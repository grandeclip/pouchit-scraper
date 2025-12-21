/**
 * Workflow Execution 서비스
 * Facade Pattern 구현
 *
 * 역할:
 * - Repository와 Loader 캡슐화
 * - 워크플로우 실행 비즈니스 로직 조율
 * - 에러 처리 및 로깅
 *
 * SOLID 원칙:
 * - SRP: 워크플로우 실행 조율만 담당
 * - DIP: IWorkflowRepository, INodeStrategy 인터페이스에 의존
 * - OCP: 새로운 노드 타입 추가 시 확장 가능
 */

import { v7 as uuidv7 } from "uuid";
import {
  IWorkflowService,
  ExecuteWorkflowRequest,
} from "@/core/interfaces/IWorkflowService";
import { IWorkflowRepository } from "@/core/interfaces/IWorkflowRepository";
import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import {
  Job,
  JobStatus,
  JobPriority,
  JobStatusResponse,
  WorkflowDefinition,
} from "@/core/domain/Workflow";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { WorkflowLoaderService } from "./WorkflowLoaderService";
import { NodeStrategyFactory } from "./NodeStrategyFactory";
import { TypedNodeStrategyFactory } from "./TypedNodeStrategyFactory";
import { logger } from "@/config/logger";
import { createJobLogger, logImportant } from "@/utils/LoggerContext";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import {
  ParallelExecutor,
  NodeExecutionInfo,
} from "@/workflow/engine/ParallelExecutor";
import {
  INodeContext,
  IPlatformConfig,
  createNodeContext,
} from "@/core/interfaces/INodeContext";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
} from "@/core/interfaces/ITypedNodeStrategy";
import { getPlatformConfig } from "@/strategies/validation/platform";
import { ConfigLoader } from "@/config/ConfigLoader";

/**
 * Workflow Execution 서비스 (Facade)
 */
export class WorkflowExecutionService implements IWorkflowService {
  private repository: IWorkflowRepository;
  private loader: WorkflowLoaderService;
  private factory: NodeStrategyFactory;
  private typedFactory: TypedNodeStrategyFactory;
  private parallelExecutor: ParallelExecutor;

  /** Workflow 실행 중 노드 간 공유 상태 (Job별로 관리) */
  private sharedStateMap: Map<string, Map<string, unknown>> = new Map();

  constructor(
    repository?: IWorkflowRepository,
    loader?: WorkflowLoaderService,
    factory?: NodeStrategyFactory,
    typedFactory?: TypedNodeStrategyFactory,
  ) {
    // Dependency Injection (테스트 가능하도록)
    this.repository = repository || new RedisWorkflowRepository();
    this.loader = loader || new WorkflowLoaderService();
    this.factory = factory || new NodeStrategyFactory();
    this.typedFactory = typedFactory || new TypedNodeStrategyFactory();
    this.parallelExecutor = new ParallelExecutor(logger);
  }

  /**
   * 워크플로우 실행
   * @param request 실행 요청
   * @returns Job ID
   */
  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<string> {
    logImportant(logger, "Executing workflow", {
      workflow_id: request.workflow_id,
      priority: request.priority || JobPriority.NORMAL,
    });

    try {
      // 1. Platform 설정 (Multi-Queue Architecture)
      // 하위 호환성: platform이 없으면 "default" 사용
      let platform: string;

      if (request.params.platform) {
        if (typeof request.params.platform !== "string") {
          throw new Error("params.platform must be a string");
        }
        platform = request.params.platform;
      } else {
        // 기존 워크플로우 호환성을 위해 기본값 사용
        platform = "default";
        logger.warn(
          { workflow_id: request.workflow_id },
          "No platform specified, using default queue",
        );
      }

      // 2. Workflow 정의 로드
      await this.loader.loadWorkflow(request.workflow_id);

      // 3. Job 생성
      const job: Job = {
        job_id: uuidv7(),
        workflow_id: request.workflow_id,
        status: JobStatus.PENDING,
        priority: request.priority || JobPriority.NORMAL,
        platform: platform, // Multi-Queue Architecture
        params: request.params,
        current_node: null,
        progress: 0,
        result: {},
        error: null,
        created_at: getTimestampWithTimezone(),
        started_at: null,
        completed_at: null,
        metadata: request.metadata || {},
      };

      // 4. Repository에 Job 추가 (Platform별 큐)
      await this.repository.enqueueJob(job);

      logImportant(logger, "Job created", {
        job_id: job.job_id,
        workflow_id: job.workflow_id,
      });

      return job.job_id;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          workflow_id: request.workflow_id,
        },
        "Failed to execute workflow",
      );
      throw error;
    }
  }

  /**
   * Job 상태 조회
   * @param jobId Job ID
   * @returns Job 상태 응답
   */
  async getJobStatus(jobId: string): Promise<JobStatusResponse | null> {
    try {
      const job = await this.repository.getJob(jobId);

      if (!job) {
        logger.warn({ job_id: jobId }, "Job을 찾을 수 없음");
        return null;
      }

      const response: JobStatusResponse = {
        job_id: job.job_id,
        workflow_id: job.workflow_id,
        status: job.status,
        progress: job.progress,
        current_node: job.current_node,
        result: job.result,
        error: job.error,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
        metadata: job.metadata,
      };

      return response;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          job_id: jobId,
        },
        "Failed to get job status",
      );
      throw error;
    }
  }

  /**
   * 대기 중인 Job 처리 (Worker용)
   * @returns 처리된 Job 또는 null
   */
  async processNextJob(): Promise<Job | null> {
    try {
      // 1. Job 가져오기
      const job = await this.repository.dequeueJob();

      if (!job) {
        // 큐가 비었을 때는 로그 생략 (너무 빈번)
        return null;
      }

      logImportant(logger, "Processing job", {
        job_id: job.job_id,
        workflow_id: job.workflow_id,
      });

      // 2. Job 실행
      await this.executeJob(job);

      return job;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to process job",
      );
      throw error;
    }
  }

  /**
   * Job 실행 (Multi-Platform Worker에서 사용)
   *
   * Phase 4 Step 4.8: DAG 기반 병렬 노드 실행 지원
   * - 동일 레벨 노드 (모든 선행 노드 완료) 동시 실행
   * - 결과 병합 및 다음 노드 전달
   */
  async executeJob(job: Job): Promise<void> {
    try {
      // 1. Workflow 정의 로드
      const workflow = await this.loader.loadWorkflow(job.workflow_id);

      // 2. Job 상태 업데이트 (RUNNING)
      // current_node가 이미 설정되어 있으면 resume (특정 노드부터 시작)
      const startNode = job.current_node || workflow.start_node;
      const isResume = job.current_node !== null;

      job.status = JobStatus.RUNNING;
      job.started_at = getTimestampWithTimezone();
      job.current_node = startNode;
      await this.repository.updateJob(job);

      // 3. DAG 선행 노드 맵 빌드
      const predecessorMap = this.buildPredecessorMap(workflow);

      // 4. 노드 DAG 실행 (병렬 처리 지원)
      // job.params를 accumulatedData에 포함 (limit, dry_run 등 전달)
      let accumulatedData: Record<string, unknown> = {
        ...job.params,
        // Job 메타데이터 추가 (시작 시간을 ResultWriterNode에서 사용)
        job_metadata: {
          started_at: job.started_at,
        },
      };
      const executedNodes = new Set<string>(); // 실행 완료된 노드 추적

      // Resume 시 startNode의 선행 노드들을 "이미 실행됨"으로 마킹
      if (isResume) {
        const predecessors = predecessorMap.get(startNode) || [];
        for (const pred of predecessors) {
          executedNodes.add(pred);
        }
      }

      let pendingNodes: string[] = [startNode]; // 실행 대기 큐 (resume 시 특정 노드부터)

      const jobLogger = createJobLogger(job.job_id, job.workflow_id);
      const totalNodes = Object.keys(workflow.nodes).length;

      // DAG 실행: 대기 큐가 빌 때까지 노드 실행
      while (pendingNodes.length > 0) {
        // 실행 가능한 노드 찾기 (모든 선행 노드 완료)
        const executableNodes = this.getExecutableNodes(
          pendingNodes,
          executedNodes,
          predecessorMap,
        );

        if (executableNodes.length === 0) {
          // 데드락 방지: 실행 가능한 노드가 없으면 에러
          throw new Error(
            `No executable nodes found. Pending: ${pendingNodes.join(", ")}`,
          );
        }

        // 노드 검증
        for (const nodeId of executableNodes) {
          if (!workflow.nodes[nodeId]) {
            throw new Error(`Node not found: ${nodeId}`);
          }
        }

        // 현재 실행 노드 업데이트
        job.current_node = executableNodes[0];

        // 노드 실행 (단일 or 병렬)
        const result = await this.executeNodesInParallel(
          executableNodes,
          job,
          workflow,
          accumulatedData,
        );

        if (!result.success) {
          throw new Error(
            result.error ||
              `Node execution failed: ${result.failedNode || "unknown"}`,
          );
        }

        // 결과 누적
        accumulatedData = { ...accumulatedData, ...result.mergedData };

        // 실행 완료 표시
        for (const nodeId of executableNodes) {
          executedNodes.add(nodeId);
        }

        // 대기 큐에서 실행 완료 노드 제거
        pendingNodes = pendingNodes.filter(
          (nodeId) => !executableNodes.includes(nodeId),
        );

        // 다음 노드들을 큐에 추가
        for (const nextNodeId of result.nextNodes) {
          if (
            !executedNodes.has(nextNodeId) &&
            !pendingNodes.includes(nextNodeId)
          ) {
            pendingNodes.push(nextNodeId);
          }
        }

        // 진행률 업데이트 (실행된 노드 수 기반)
        job.progress = Math.min(executedNodes.size / totalNodes, 1.0);
        job.current_node = pendingNodes.length > 0 ? pendingNodes[0] : null;

        // Redis 업데이트
        await this.repository.updateJob(job);

        jobLogger.info(
          {
            executed_nodes: executableNodes,
            next_pending: pendingNodes,
            executed_count: executedNodes.size,
            total_nodes: totalNodes,
          },
          "Nodes completed",
        );
      }

      // 5. Job 완료
      job.status = JobStatus.COMPLETED;
      job.current_node = null;
      job.progress = 1.0;
      job.result = accumulatedData;
      job.completed_at = getTimestampWithTimezone();
      await this.repository.updateJob(job);
    } catch (error) {
      // Job 실패 처리
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error(
        {
          error: errorMessage,
          job_id: job.job_id,
          workflow_id: job.workflow_id,
          current_node: job.current_node || "unknown",
        },
        "Job failed",
      );

      job.status = JobStatus.FAILED;
      job.error = {
        message: errorMessage,
        node_id: job.current_node || "unknown",
        timestamp: getTimestampWithTimezone(),
      };
      job.completed_at = getTimestampWithTimezone();
      await this.repository.updateJob(job);

      throw error;
    } finally {
      // 메모리 누수 방지: Job 완료 후 공유 상태 정리
      this.sharedStateMap.delete(job.job_id);
    }
  }

  /**
   * 단일 노드 실행
   */
  private async executeNode(
    job: Job,
    workflow: WorkflowDefinition,
    nodeId: string,
    node: WorkflowDefinition["nodes"][string],
    accumulatedData: Record<string, unknown>,
  ): Promise<NodeResult> {
    // Phase 4 타입드 노드 체크
    if (this.typedFactory.hasType(node.type)) {
      return this.executeTypedNode(job, nodeId, node, accumulatedData);
    }

    // Legacy 노드 실행
    return this.executeLegacyNode(job, nodeId, node, accumulatedData);
  }

  /**
   * Phase 4 타입드 노드 실행
   */
  private async executeTypedNode(
    job: Job,
    nodeId: string,
    node: WorkflowDefinition["nodes"][string],
    accumulatedData: Record<string, unknown>,
  ): Promise<NodeResult> {
    // Typed Strategy 생성
    const strategy = this.typedFactory.createTypedNode<unknown, unknown>(
      node.type,
    );

    // SharedState 조회/생성 (Job별)
    let sharedState = this.sharedStateMap.get(job.job_id);
    if (!sharedState) {
      sharedState = new Map<string, unknown>();
      // Job timing 정보 저장 (NotifyResultNode에서 사용)
      sharedState.set("job_timing", {
        started_at: job.started_at,
        created_at: job.created_at,
      });
      // Job params 저장 (sale_status 등)
      sharedState.set("job_params", job.params);
      this.sharedStateMap.set(job.job_id, sharedState);
    }

    // Platform 설정 조회
    const platform = job.platform || "default";
    const platformValidationConfig = getPlatformConfig(platform);

    // YAML 플랫폼 설정에서 strategies + workflow 로드
    let yamlStrategies: unknown[] = [];
    let yamlWorkflow: IPlatformConfig["workflow"] = undefined;
    try {
      const yamlConfig = ConfigLoader.getInstance().loadConfig(platform);
      yamlStrategies = yamlConfig.strategies || [];
      yamlWorkflow = yamlConfig.workflow as IPlatformConfig["workflow"];
    } catch {
      // YAML 설정이 없는 플랫폼은 빈 배열 사용 (default 등)
      logger.debug(
        { platform },
        "YAML 플랫폼 설정 없음 - strategies 빈 배열 사용",
      );
    }

    const platformConfig: IPlatformConfig = {
      platform,
      platform_id: platformValidationConfig?.platform || platform,
      base_url: platformValidationConfig?.urlPattern.domain || "",
      strategies: yamlStrategies,
      workflow: yamlWorkflow,
      rate_limit: {
        requests_per_minute: 60,
        delay_between_requests_ms:
          platformValidationConfig?.scanConfig.defaultTimeoutMs || 1000,
      },
    };

    // Config 변수 치환 (${variable} → 실제 값)
    const resolvedConfig = this.resolveConfigVariables(node.config, job.params);

    // INodeContext 생성
    const jobLogger = createJobLogger(job.job_id, job.workflow_id);
    const typedContext: INodeContext = createNodeContext(
      {
        job_id: job.job_id,
        workflow_id: job.workflow_id,
        node_id: nodeId,
        config: resolvedConfig,
        input: accumulatedData,
        params: job.params,
      },
      platform,
      jobLogger,
      platformConfig,
      sharedState,
    );

    // 입력 데이터 준비 (accumulatedData를 그대로 전달)
    const input = accumulatedData;

    // 재시도 로직
    const maxAttempts = node.retry?.max_attempts || 1;
    const backoffMs = node.retry?.backoff_ms || 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug(
          {
            node_id: nodeId,
            node_type: node.type,
            attempt,
            max_attempts: maxAttempts,
            job_id: job.job_id,
            phase: 4,
          },
          "Typed node execution attempt",
        );

        // 타입드 노드 실행
        const typedResult: ITypedNodeResult<unknown> = await strategy.execute(
          input,
          typedContext,
        );

        // ITypedNodeResult → NodeResult 변환
        const result: NodeResult = {
          success: typedResult.success,
          data: typedResult.data as Record<string, unknown>,
          error: typedResult.error,
          next_nodes: typedResult.next_nodes,
        };

        return result;
      } catch (error) {
        logger.error(
          {
            node_id: nodeId,
            node_type: node.type,
            attempt,
            max_attempts: maxAttempts,
            error: error instanceof Error ? error.message : String(error),
            job_id: job.job_id,
            phase: 4,
          },
          "Typed node execution attempt failed",
        );

        if (attempt === maxAttempts) {
          throw error;
        }

        // 재시도 전 대기
        await this.sleep(backoffMs * attempt);
      }
    }

    throw new Error(
      `Typed node execution failed after ${maxAttempts} attempts`,
    );
  }

  /**
   * Legacy 노드 실행 (기존 INodeStrategy)
   */
  private async executeLegacyNode(
    job: Job,
    nodeId: string,
    node: WorkflowDefinition["nodes"][string],
    accumulatedData: Record<string, unknown>,
  ): Promise<NodeResult> {
    // Strategy 생성
    const strategy: INodeStrategy = this.factory.createNode(node.type);

    // Config 검증
    strategy.validateConfig(node.config);

    // 실행 컨텍스트 생성
    const context: NodeContext = {
      job_id: job.job_id,
      workflow_id: job.workflow_id,
      node_id: nodeId,
      config: node.config,
      input: accumulatedData,
      params: job.params,
    };

    // 재시도 로직
    const maxAttempts = node.retry?.max_attempts || 1;
    const backoffMs = node.retry?.backoff_ms || 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug(
          {
            node_id: nodeId,
            attempt,
            max_attempts: maxAttempts,
            job_id: job.job_id,
          },
          "Node execution attempt",
        );

        // 노드 실행
        const result = await strategy.execute(context);

        return result;
      } catch (error) {
        logger.error(
          {
            node_id: nodeId,
            attempt,
            max_attempts: maxAttempts,
            error: error instanceof Error ? error.message : String(error),
            job_id: job.job_id,
          },
          "Node execution attempt failed",
        );

        if (attempt === maxAttempts) {
          throw error;
        }

        // 재시도 전 대기
        await this.sleep(backoffMs * attempt);
      }
    }

    throw new Error(`Node execution failed after ${maxAttempts} attempts`);
  }

  /**
   * Sleep 헬퍼
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Config 변수 치환 (${variable} → 실제 값)
   * @param config 노드 설정
   * @param params Job 파라미터
   * @returns 변수가 치환된 설정
   */
  private resolveConfigVariables(
    config: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      resolved[key] = this.substituteVariable(value, params);
    }

    return resolved;
  }

  /**
   * 단일 값 변수 치환
   * @param value 원본 값
   * @param params 파라미터
   * @returns 치환된 값
   */
  private substituteVariable(
    value: unknown,
    params: Record<string, unknown>,
  ): unknown {
    if (typeof value === "string") {
      // 전체가 ${variable} 형태인 경우 (타입 보존)
      const fullMatch = value.match(/^\$\{(\w+)\}$/);
      if (fullMatch) {
        const paramValue = params[fullMatch[1]];
        // params에 값이 있으면 그대로 반환 (타입 보존)
        return paramValue !== undefined ? paramValue : value;
      }

      // 문자열 내 부분 치환 (${var} 패턴)
      return value.replace(/\$\{(\w+)\}/g, (_, key) => {
        const replacement = params[key];
        return replacement !== undefined ? String(replacement) : `\${${key}}`;
      });
    }

    // 배열 처리
    if (Array.isArray(value)) {
      return value.map((item) => this.substituteVariable(item, params));
    }

    // 객체 처리 (중첩된 config)
    if (value !== null && typeof value === "object") {
      return this.resolveConfigVariables(
        value as Record<string, unknown>,
        params,
      );
    }

    return value;
  }

  /**
   * DAG에서 선행 노드 맵 빌드
   * @param workflow Workflow 정의
   * @returns nodeId → predecessorIds[] 맵
   */
  private buildPredecessorMap(
    workflow: WorkflowDefinition,
  ): Map<string, Set<string>> {
    const predecessorMap = new Map<string, Set<string>>();

    // 모든 노드 초기화
    for (const nodeId of Object.keys(workflow.nodes)) {
      predecessorMap.set(nodeId, new Set());
    }

    // next_nodes 관계에서 predecessor 역추적
    for (const [nodeId, node] of Object.entries(workflow.nodes)) {
      for (const nextNodeId of node.next_nodes) {
        const predecessors = predecessorMap.get(nextNodeId);
        if (predecessors) {
          predecessors.add(nodeId);
        }
      }
    }

    return predecessorMap;
  }

  /**
   * 실행 가능한 노드 찾기 (모든 선행 노드 완료)
   * @param pendingNodes 대기 중인 노드 ID 배열
   * @param executedNodes 실행 완료된 노드 ID Set
   * @param predecessorMap 선행 노드 맵
   * @returns 실행 가능한 노드 ID 배열
   */
  private getExecutableNodes(
    pendingNodes: string[],
    executedNodes: Set<string>,
    predecessorMap: Map<string, Set<string>>,
  ): string[] {
    return pendingNodes.filter((nodeId) => {
      const predecessors = predecessorMap.get(nodeId);
      if (!predecessors) return true;

      // 모든 선행 노드가 완료되었는지 확인
      for (const predId of predecessors) {
        if (!executedNodes.has(predId)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * 노드 그룹 병렬 실행
   * @param nodeIds 실행할 노드 ID 배열
   * @param job Job 정보
   * @param workflow Workflow 정의
   * @param accumulatedData 누적 데이터
   * @returns 병렬 실행 결과
   */
  private async executeNodesInParallel(
    nodeIds: string[],
    job: Job,
    workflow: WorkflowDefinition,
    accumulatedData: Record<string, unknown>,
  ): Promise<{
    success: boolean;
    mergedData: Record<string, unknown>;
    nextNodes: string[];
    failedNode?: string;
    error?: string;
  }> {
    // 단일 노드는 직접 실행 (오버헤드 감소)
    if (nodeIds.length === 1) {
      const nodeId = nodeIds[0];
      const node = workflow.nodes[nodeId];
      const result = await this.executeNode(
        job,
        workflow,
        nodeId,
        node,
        accumulatedData,
      );

      if (!result.success) {
        return {
          success: false,
          mergedData: {},
          nextNodes: [],
          failedNode: nodeId,
          error: result.error?.message,
        };
      }

      const nextNodes =
        result.next_nodes !== undefined ? result.next_nodes : node.next_nodes;

      return {
        success: true,
        mergedData: result.data,
        nextNodes,
      };
    }

    // 병렬 실행 정보 빌드
    const nodeExecutions: NodeExecutionInfo[] = nodeIds.map((nodeId) => {
      const node = workflow.nodes[nodeId];
      const strategy = this.factory.createNode(node.type);
      strategy.validateConfig(node.config);

      const context: NodeContext = {
        job_id: job.job_id,
        workflow_id: job.workflow_id,
        node_id: nodeId,
        config: node.config,
        input: accumulatedData,
        params: job.params,
      };

      return { nodeId, strategy, context };
    });

    // 병렬 실행
    const parallelResult =
      await this.parallelExecutor.executeParallel(nodeExecutions);

    if (!parallelResult.success) {
      return {
        success: false,
        mergedData: {},
        nextNodes: [],
        failedNode: parallelResult.failedNodes[0],
        error: parallelResult.results.find((r) => !r.success)?.error?.message,
      };
    }

    // 다음 노드 병합 (병렬 실행 결과 + 워크플로우 정의)
    const allNextNodes = new Set<string>(parallelResult.nextNodes);
    for (const nodeId of nodeIds) {
      const node = workflow.nodes[nodeId];
      node.next_nodes.forEach((n) => allNextNodes.add(n));
    }

    return {
      success: true,
      mergedData: parallelResult.mergedData,
      nextNodes: Array.from(allNextNodes),
    };
  }

  /**
   * 사용 가능한 워크플로우 목록 조회
   * @returns 워크플로우 ID 배열
   */
  async listWorkflows(): Promise<string[]> {
    return await this.loader.listWorkflows();
  }

  /**
   * 서비스 상태 확인
   * @returns 연결 여부
   */
  async healthCheck(): Promise<boolean> {
    return await this.repository.healthCheck();
  }
}

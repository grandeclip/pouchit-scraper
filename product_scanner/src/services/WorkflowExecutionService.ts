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
import { logger } from "@/config/logger";
import { createJobLogger, logImportant } from "@/utils/LoggerContext";
import { getTimestampWithTimezone } from "@/utils/timestamp";

/**
 * Workflow Execution 서비스 (Facade)
 */
export class WorkflowExecutionService implements IWorkflowService {
  private repository: IWorkflowRepository;
  private loader: WorkflowLoaderService;
  private factory: NodeStrategyFactory;

  constructor(
    repository?: IWorkflowRepository,
    loader?: WorkflowLoaderService,
    factory?: NodeStrategyFactory,
  ) {
    // Dependency Injection (테스트 가능하도록)
    this.repository = repository || new RedisWorkflowRepository();
    this.loader = loader || new WorkflowLoaderService();
    this.factory = factory || new NodeStrategyFactory();
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
   */
  async executeJob(job: Job): Promise<void> {
    try {
      // 1. Workflow 정의 로드
      const workflow = await this.loader.loadWorkflow(job.workflow_id);

      // 2. Job 상태 업데이트 (RUNNING)
      job.status = JobStatus.RUNNING;
      job.started_at = getTimestampWithTimezone();
      job.current_node = workflow.start_node;
      await this.repository.updateJob(job);

      // 3. 노드 DAG 실행
      let accumulatedData: Record<string, unknown> = {
        // Job 메타데이터 추가 (시작 시간을 ResultWriterNode에서 사용)
        job_metadata: {
          started_at: job.started_at,
        },
      };
      const executedNodes = new Set<string>(); // 실행 완료된 노드 추적
      const inProgressNodes = new Set<string>(); // 실행 중인 노드 추적
      let nodesToExecute: string[] = [workflow.start_node]; // 실행 대기 큐

      const jobLogger = createJobLogger(job.job_id, job.workflow_id);

      // DAG 실행: 큐가 빌 때까지 노드 실행
      while (nodesToExecute.length > 0) {
        // 현재 실행할 노드 ID
        const currentNodeId = nodesToExecute.shift()!;

        // 이미 실행된 노드는 스킵
        if (executedNodes.has(currentNodeId)) {
          continue;
        }

        const node: WorkflowDefinition["nodes"][string] | undefined =
          workflow.nodes[currentNodeId];

        if (!node) {
          throw new Error(`Node not found: ${currentNodeId}`);
        }

        jobLogger.info(
          { node_id: currentNodeId, node_type: node.type },
          "Executing node",
        );

        // 노드 실행 중으로 표시
        inProgressNodes.add(currentNodeId);

        // 노드 실행
        const result = await this.executeNode(
          job,
          workflow,
          currentNodeId,
          node,
          accumulatedData,
        );

        if (!result.success) {
          // 노드 실행 실패
          throw new Error(result.error?.message || "Node execution failed");
        }

        // 결과 누적
        accumulatedData = { ...accumulatedData, ...result.data };

        // 실행 완료 표시
        executedNodes.add(currentNodeId);
        inProgressNodes.delete(currentNodeId);

        // 다음 노드 결정 (런타임 오버라이드 우선)
        const nextNodes =
          result.next_nodes !== undefined ? result.next_nodes : node.next_nodes;

        // 다음 노드들을 큐에 추가
        for (const nextNodeId of nextNodes) {
          if (
            !executedNodes.has(nextNodeId) &&
            !nodesToExecute.includes(nextNodeId)
          ) {
            nodesToExecute.push(nextNodeId);
          }
        }

        // 진행률 업데이트 (실행된 노드 수 기반)
        const totalNodes = Object.keys(workflow.nodes).length;
        job.progress = Math.min(executedNodes.size / totalNodes, 1.0);
        job.current_node = nodesToExecute.length > 0 ? nodesToExecute[0] : null;

        // Redis 업데이트 (디버깅 로그 추가)
        jobLogger.info(
          {
            job_id: job.job_id,
            status: job.status,
            current_node: job.current_node,
          },
          "Updating job status in Redis",
        );
        await this.repository.updateJob(job);

        jobLogger.info(
          {
            node_id: currentNodeId,
            next_nodes: nextNodes,
            executed_count: executedNodes.size,
            total_nodes: totalNodes,
          },
          "Node completed",
        );
      }

      // 4. Job 완료
      job.status = JobStatus.COMPLETED;
      job.current_node = null;
      job.progress = 1.0;
      job.result = accumulatedData;
      job.completed_at = getTimestampWithTimezone();
      await this.repository.updateJob(job);

      logImportant(logger, "Job completed", {
        job_id: job.job_id,
        workflow_id: job.workflow_id,
      });
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

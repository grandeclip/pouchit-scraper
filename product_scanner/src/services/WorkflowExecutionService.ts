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

import { v4 as uuidv4 } from "uuid";
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
    console.log(`[Service] Executing workflow: ${request.workflow_id}`);

    try {
      // 1. Workflow 정의 로드
      const workflow = await this.loader.loadWorkflow(request.workflow_id);

      // 2. Job 생성
      const job: Job = {
        job_id: uuidv4(),
        workflow_id: request.workflow_id,
        status: JobStatus.PENDING,
        priority: request.priority || JobPriority.NORMAL,
        params: request.params,
        current_node: null,
        progress: 0,
        result: {},
        error: null,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        metadata: request.metadata || {},
      };

      // 3. Repository에 Job 추가
      await this.repository.enqueueJob(job);

      console.log(`[Service] Job created: ${job.job_id}`);

      return job.job_id;
    } catch (error) {
      console.error(`[Service] Failed to execute workflow:`, error);
      throw error;
    }
  }

  /**
   * Job 상태 조회
   * @param jobId Job ID
   * @returns Job 상태 응답
   */
  async getJobStatus(jobId: string): Promise<JobStatusResponse | null> {
    console.log(`[Service] Getting job status: ${jobId}`);

    try {
      const job = await this.repository.getJob(jobId);

      if (!job) {
        console.warn(`[Service] Job not found: ${jobId}`);
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
      console.error(`[Service] Failed to get job status:`, error);
      throw error;
    }
  }

  /**
   * 대기 중인 Job 처리 (Worker용)
   * @returns 처리된 Job 또는 null
   */
  async processNextJob(): Promise<Job | null> {
    console.log(`[Service] Processing next job...`);

    try {
      // 1. Job 가져오기
      const job = await this.repository.dequeueJob();

      if (!job) {
        console.log(`[Service] No jobs in queue`);
        return null;
      }

      console.log(`[Service] Processing job: ${job.job_id}`);

      // 2. Job 실행
      await this.executeJob(job);

      return job;
    } catch (error) {
      console.error(`[Service] Failed to process job:`, error);
      throw error;
    }
  }

  /**
   * Job 실행 (내부 메서드)
   */
  private async executeJob(job: Job): Promise<void> {
    try {
      // 1. Workflow 정의 로드
      const workflow = await this.loader.loadWorkflow(job.workflow_id);

      // 2. Job 상태 업데이트 (RUNNING)
      job.status = JobStatus.RUNNING;
      job.started_at = new Date().toISOString();
      job.current_node = workflow.start_node;
      await this.repository.updateJob(job);

      // 3. 노드 순차 실행
      let currentNodeId: string | null = workflow.start_node;
      let accumulatedData: Record<string, unknown> = {};

      while (currentNodeId !== null) {
        const node: WorkflowDefinition["nodes"][string] | undefined =
          workflow.nodes[currentNodeId];

        if (!node) {
          throw new Error(`Node not found: ${currentNodeId}`);
        }

        console.log(
          `[Service] Executing node: ${currentNodeId} (${node.type})`,
        );

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

        // 다음 노드로 이동
        currentNodeId =
          result.next_node !== undefined ? result.next_node : node.next_node;

        // 진행률 업데이트 (간단한 추정)
        const totalNodes = Object.keys(workflow.nodes).length;
        const executedNodes = Object.keys(accumulatedData).length;
        job.progress = Math.min(executedNodes / totalNodes, 1.0);
        job.current_node = currentNodeId;
        await this.repository.updateJob(job);
      }

      // 4. Job 완료
      job.status = JobStatus.COMPLETED;
      job.current_node = null;
      job.progress = 1.0;
      job.result = accumulatedData;
      job.completed_at = new Date().toISOString();
      await this.repository.updateJob(job);

      console.log(`[Service] Job completed: ${job.job_id}`);
    } catch (error) {
      // Job 실패 처리
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(`[Service] Job failed: ${job.job_id}`, error);

      job.status = JobStatus.FAILED;
      job.error = {
        message: errorMessage,
        node_id: job.current_node || "unknown",
        timestamp: new Date().toISOString(),
      };
      job.completed_at = new Date().toISOString();
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
        console.log(
          `[Service] Node ${nodeId} attempt ${attempt}/${maxAttempts}`,
        );

        // 노드 실행
        const result = await strategy.execute(context);

        return result;
      } catch (error) {
        console.error(
          `[Service] Node ${nodeId} attempt ${attempt}/${maxAttempts} failed:`,
          error,
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

/**
 * Workflow Service 인터페이스
 *
 * SOLID 원칙:
 * - ISP: 워크플로우 실행 서비스 전용 인터페이스
 * - DIP: 추상화에 의존 (구체 구현에 의존하지 않음)
 */

import { Job, JobStatusResponse } from "@/core/domain/Workflow";

/**
 * Workflow 실행 요청
 */
export interface ExecuteWorkflowRequest {
  workflow_id: string;
  params: Record<string, unknown>;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Workflow Service 인터페이스
 * 워크플로우 실행 및 관리
 */
export interface IWorkflowService {
  /**
   * 워크플로우 실행
   * @param request 실행 요청
   * @returns 생성된 Job ID
   */
  executeWorkflow(request: ExecuteWorkflowRequest): Promise<string>;

  /**
   * Job 상태 조회
   * @param jobId Job ID
   * @returns Job 상태 응답
   */
  getJobStatus(jobId: string): Promise<JobStatusResponse | null>;

  /**
   * 대기 중인 Job 처리 (Worker용)
   * @returns 처리된 Job 또는 null
   */
  processNextJob(): Promise<Job | null>;

  /**
   * Job 실행 (Multi-Platform Worker용)
   * @param job 실행할 Job
   * @throws Error Job 실행 실패 시
   */
  executeJob(job: Job): Promise<void>;

  /**
   * 사용 가능한 워크플로우 목록 조회
   * @returns 워크플로우 ID 배열
   */
  listWorkflows(): Promise<string[]>;

  /**
   * 서비스 상태 확인
   * @returns 연결 여부
   */
  healthCheck(): Promise<boolean>;
}

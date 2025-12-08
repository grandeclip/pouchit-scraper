/**
 * 로거 컨텍스트 유틸리티
 *
 * 컨텍스트 인식 로거 생성 헬퍼 함수
 * Job ID, Workflow ID, Request ID 추적 지원
 */

import { logger, Logger } from "@/config/logger";

/**
 * Job 전용 로거 생성 (Workflow 컨텍스트 포함)
 * @param jobId - Job ID
 * @param workflowId - Workflow ID
 * @returns Job과 Workflow 컨텍스트가 포함된 자식 로거
 */
export function createJobLogger(jobId: string, workflowId: string): Logger {
  return logger.child({
    job_id: jobId,
    workflow_id: workflowId,
  });
}

/**
 * Request 전용 로거 생성
 * @param requestId - Request ID (UUID)
 * @param method - HTTP method
 * @param path - 요청 경로
 * @returns Request 컨텍스트가 포함된 자식 로거
 */
export function createRequestLogger(
  requestId: string,
  method: string,
  path: string,
): Logger {
  return logger.child({
    request_id: requestId,
    method,
    path,
  });
}

/**
 * Task 전용 로거 생성
 * @param jobId - Job ID
 * @param taskId - Task ID
 * @param nodeType - 노드 타입 (예: "supabase_search", "hwahae_validation")
 * @returns Task 컨텍스트가 포함된 자식 로거
 */
export function createTaskLogger(
  jobId: string,
  taskId: string,
  nodeType: string,
): Logger {
  return logger.child({
    job_id: jobId,
    task_id: taskId,
    node_type: nodeType,
  });
}

/**
 * 중요 정보 로깅 (콘솔에 표시됨)
 * @param logger - 로거 인스턴스
 * @param message - 로그 메시지
 * @param data - 추가 데이터
 */
export function logImportant(
  logger: Logger,
  message: string,
  data?: Record<string, any>,
): void {
  logger.info({ ...data, important: true }, message);
}

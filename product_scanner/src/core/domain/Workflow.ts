/**
 * Workflow 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: Workflow와 Job 관련 타입만 정의
 * - Value Object Pattern: 불변 데이터 구조
 */

/**
 * Job 상태
 */
export enum JobStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

/**
 * Job 우선순위
 */
export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  URGENT = 20,
}

/**
 * Job 도메인 모델
 */
export interface Job {
  /** Job ID (UUID) */
  job_id: string;

  /** Workflow ID */
  workflow_id: string;

  /** 현재 상태 */
  status: JobStatus;

  /** 우선순위 */
  priority: JobPriority;

  /** 실행 파라미터 */
  params: Record<string, unknown>;

  /** 현재 실행 중인 Node ID */
  current_node: string | null;

  /** 진행률 (0.0 - 1.0) */
  progress: number;

  /** 누적 결과 데이터 */
  result: Record<string, unknown>;

  /** 에러 정보 */
  error: {
    message: string;
    node_id: string;
    timestamp: string;
  } | null;

  /** 생성 시각 */
  created_at: string;

  /** 시작 시각 */
  started_at: string | null;

  /** 완료 시각 */
  completed_at: string | null;

  /** 메타데이터 */
  metadata: Record<string, unknown>;
}

/**
 * Workflow 노드 정의
 */
export interface WorkflowNode {
  /** 노드 타입 */
  type: string;

  /** 노드 이름 */
  name: string;

  /** 노드 설정 */
  config: Record<string, unknown>;

  /** 다음 노드 ID (null이면 종료) */
  next_node: string | null;

  /** 재시도 설정 */
  retry?: {
    max_attempts: number;
    backoff_ms: number;
  };

  /** 타임아웃 (밀리초) */
  timeout_ms?: number;
}

/**
 * Workflow 정의
 */
export interface WorkflowDefinition {
  /** Workflow ID */
  workflow_id: string;

  /** Workflow 이름 */
  name: string;

  /** 버전 */
  version: string;

  /** 설명 */
  description?: string;

  /** 시작 노드 ID */
  start_node: string;

  /** 노드 맵 (node_id → node) */
  nodes: Record<string, WorkflowNode>;

  /** 기본 파라미터 */
  defaults?: Record<string, unknown>;

  /** 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * Job 상태 응답
 */
export interface JobStatusResponse {
  job_id: string;
  workflow_id: string;
  status: JobStatus;
  progress: number;
  current_node: string | null;
  result: Record<string, unknown>;
  error: Job["error"];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

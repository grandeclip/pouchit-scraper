/**
 * Platform Config 도메인 모델
 * 모든 Platform에 공통으로 적용되는 설정 타입
 *
 * SOLID 원칙:
 * - OCP: Platform별로 확장 가능한 구조
 * - ISP: 각 Platform은 필요한 설정만 구현
 */

/**
 * Workflow Rate Limit 설정
 */
export interface WorkflowRateLimitConfig {
  enabled: boolean;
  wait_time_ms: number;
  description?: string;
}

/**
 * Workflow Concurrency 설정 (병렬 처리)
 */
export interface WorkflowConcurrencyConfig {
  max: number; // 최대 병렬 개수
  default: number; // 기본 병렬 개수
  description?: string;
}

/**
 * Memory Management 설정 (메모리 최적화)
 */
export interface WorkflowMemoryManagementConfig {
  page_rotation_interval: number; // N개마다 Page 재생성
  context_rotation_interval: number; // N개마다 Context 재생성
  enable_gc_hints: boolean; // V8 GC 힌트 활성화
  description?: string;
}

/**
 * Workflow 설정
 */
export interface WorkflowConfig {
  rate_limit?: WorkflowRateLimitConfig;
  concurrency?: WorkflowConcurrencyConfig;
  memory_management?: WorkflowMemoryManagementConfig;
}

/**
 * Platform Config (기본 인터페이스)
 */
export interface PlatformConfig {
  platform: string;
  name: string;
  baseUrl?: string;

  /** Workflow 설정 (Multi-Queue Architecture) */
  workflow?: WorkflowConfig;

  /** Platform별 추가 설정 (확장 가능) */
  [key: string]: any;
}

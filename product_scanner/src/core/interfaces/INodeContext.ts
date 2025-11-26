/**
 * Enhanced Node Context Interface (Phase 4)
 *
 * SOLID 원칙:
 * - ISP: 노드 실행 컨텍스트 전용 인터페이스
 * - DIP: 추상화에 의존 (Logger, Config 등)
 *
 * 목적:
 * - 노드 간 데이터 전달 타입 안전성
 * - 공유 상태 관리
 * - 로깅 컨텍스트 전달
 */

import type { Logger } from "pino";

/**
 * Platform 설정 (Phase 4용 확장)
 */
export interface IPlatformConfig {
  platform: string;
  baseUrl?: string;
  strategies?: unknown[];
  workflow?: {
    rate_limit?: {
      wait_time_ms?: number;
    };
    concurrency?: {
      default?: number;
      max?: number;
    };
    memory_management?: {
      page_rotation_interval?: number;
      context_rotation_interval?: number;
      enable_gc_hints?: boolean;
    };
  };
  [key: string]: unknown;
}

/**
 * Enhanced Node Context (Phase 4)
 *
 * 기존 NodeContext 확장:
 * - logger: Pino 로거 인스턴스
 * - platformConfig: 플랫폼 설정
 * - sharedState: 노드 간 공유 상태
 */
export interface INodeContext {
  /** 현재 Job ID */
  job_id: string;

  /** Workflow ID */
  workflow_id: string;

  /** 현재 Node ID */
  node_id: string;

  /** Node 설정 (workflow JSON의 config) */
  config: Record<string, unknown>;

  /** 이전 Node의 출력 데이터 */
  input: Record<string, unknown>;

  /** Job 실행 파라미터 (변수 치환용) */
  params: Record<string, unknown>;

  /** Platform ID */
  platform: string;

  /** Pino Logger 인스턴스 */
  logger: Logger;

  /** Platform 설정 */
  platformConfig: IPlatformConfig;

  /** 노드 간 공유 상태 (Workflow 실행 동안 유지) */
  sharedState: Map<string, unknown>;
}

/**
 * Node Context Factory 함수 타입
 */
export type NodeContextFactory = (
  baseContext: Pick<
    INodeContext,
    "job_id" | "workflow_id" | "node_id" | "config" | "input" | "params"
  >,
  platform: string,
  logger: Logger,
  platformConfig: IPlatformConfig,
  sharedState?: Map<string, unknown>,
) => INodeContext;

/**
 * Node Context 생성 헬퍼
 */
export function createNodeContext(
  baseContext: Pick<
    INodeContext,
    "job_id" | "workflow_id" | "node_id" | "config" | "input" | "params"
  >,
  platform: string,
  logger: Logger,
  platformConfig: IPlatformConfig,
  sharedState?: Map<string, unknown>,
): INodeContext {
  return {
    ...baseContext,
    platform,
    logger,
    platformConfig,
    sharedState: sharedState ?? new Map<string, unknown>(),
  };
}

/**
 * Legacy NodeContext → INodeContext 변환 헬퍼
 * (하위 호환성 유지)
 */
export function toEnhancedContext(
  legacyContext: {
    job_id: string;
    workflow_id: string;
    node_id: string;
    config: Record<string, unknown>;
    input: Record<string, unknown>;
    params: Record<string, unknown>;
  },
  platform: string,
  logger: Logger,
  platformConfig: IPlatformConfig,
  sharedState?: Map<string, unknown>,
): INodeContext {
  return createNodeContext(
    legacyContext,
    platform,
    logger,
    platformConfig,
    sharedState,
  );
}

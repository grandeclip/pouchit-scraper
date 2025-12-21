/**
 * Heartbeat 유틸리티
 *
 * Redis 기반 서비스 상태 모니터링
 * - 각 서비스가 주기적으로 heartbeat 기록
 * - Restarter가 heartbeat 확인 후 무응답 시 재시작
 */

import type { Redis } from "ioredis";
import { logger } from "@/config/logger";

/**
 * Heartbeat Redis 키 패턴
 */
export const HEARTBEAT_KEY = (service: string): string =>
  `heartbeat:${service}`;

/**
 * Heartbeat TTL (초) - 60초 후 자동 만료
 */
export const HEARTBEAT_TTL_SECONDS = 60;

/**
 * Heartbeat 업데이트 간격 (밀리초) - 30초
 */
export const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Heartbeat 상태
 */
export type HeartbeatStatus = "healthy" | "busy" | "starting";

/**
 * Heartbeat 데이터 구조
 */
export interface HeartbeatData {
  timestamp: number;
  status: HeartbeatStatus;
  uptime_seconds?: number;
}

/**
 * Heartbeat 업데이트
 *
 * @param redis Redis 클라이언트
 * @param serviceName 서비스 이름 (예: "worker:oliveyoung", "scheduler")
 * @param status 서비스 상태
 * @param startTime 서비스 시작 시간 (uptime 계산용)
 */
export async function updateHeartbeat(
  redis: Redis,
  serviceName: string,
  status: HeartbeatStatus = "healthy",
  startTime?: number,
): Promise<void> {
  try {
    const data: HeartbeatData = {
      timestamp: Date.now(),
      status,
    };

    if (startTime) {
      data.uptime_seconds = Math.floor((Date.now() - startTime) / 1000);
    }

    await redis.set(
      HEARTBEAT_KEY(serviceName),
      JSON.stringify(data),
      "EX",
      HEARTBEAT_TTL_SECONDS,
    );
  } catch (error) {
    // Heartbeat 실패는 치명적이지 않음 - 로그만 기록
    logger.debug(
      {
        service: serviceName,
        error: error instanceof Error ? error.message : String(error),
      },
      "[Heartbeat] 업데이트 실패 (무시)",
    );
  }
}

/**
 * Heartbeat 삭제 (서비스 종료 시)
 *
 * @param redis Redis 클라이언트
 * @param serviceName 서비스 이름
 */
export async function clearHeartbeat(
  redis: Redis,
  serviceName: string,
): Promise<void> {
  try {
    await redis.del(HEARTBEAT_KEY(serviceName));
  } catch (error) {
    logger.debug(
      {
        service: serviceName,
        error: error instanceof Error ? error.message : String(error),
      },
      "[Heartbeat] 삭제 실패 (무시)",
    );
  }
}

/**
 * Heartbeat 인터벌 시작
 *
 * @param redis Redis 클라이언트
 * @param serviceName 서비스 이름
 * @param startTime 서비스 시작 시간
 * @returns 인터벌 정리 함수
 */
export function startHeartbeat(
  redis: Redis,
  serviceName: string,
  startTime: number = Date.now(),
): () => void {
  // 즉시 첫 heartbeat 전송
  updateHeartbeat(redis, serviceName, "starting", startTime);

  // 30초마다 heartbeat 업데이트
  const intervalId = setInterval(async () => {
    await updateHeartbeat(redis, serviceName, "healthy", startTime);
  }, HEARTBEAT_INTERVAL_MS);

  logger.info({ service: serviceName }, "[Heartbeat] 모니터링 시작");

  // 정리 함수 반환
  return () => {
    clearInterval(intervalId);
    clearHeartbeat(redis, serviceName);
    logger.info({ service: serviceName }, "[Heartbeat] 모니터링 종료");
  };
}

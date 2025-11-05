/**
 * Rate Limiter Utility
 *
 * SOLID 원칙:
 * - SRP: Rate Limiting만 담당
 * - OCP: 다양한 전략 확장 가능
 *
 * 목적:
 * - ValidationNode에서 rate limiting 로직 분리
 * - 플랫폼별 설정 기반 대기 시간 적용
 */

import { logger } from "@/config/logger";

/**
 * Rate Limiter
 */
export class RateLimiter {
  private lastExecutionTime: number = 0;

  constructor(private waitTimeMs: number) {}

  /**
   * Rate limiting 적용 (필요시 대기)
   */
  async throttle(context?: string): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastExecutionTime;

    if (elapsed < this.waitTimeMs) {
      const waitTime = this.waitTimeMs - elapsed;
      logger.debug({ wait_time_ms: waitTime, context }, "Rate limiting 대기");
      await this.sleep(waitTime);
    }

    this.lastExecutionTime = Date.now();
  }

  /**
   * Sleep 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 설정 업데이트
   */
  updateWaitTime(waitTimeMs: number): void {
    this.waitTimeMs = waitTimeMs;
  }

  /**
   * 현재 설정 조회
   */
  getWaitTime(): number {
    return this.waitTimeMs;
  }
}

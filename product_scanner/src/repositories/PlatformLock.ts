/**
 * Platform Lock
 * Redis 기반 분산 Lock 구현
 *
 * 목적:
 * - 동일 Platform 내 Job 순차 실행 보장
 * - Multi-Worker 환경에서 동시 실행 방지
 *
 * 구현:
 * - SET NX EX (atomic operation)
 * - TTL 기반 자동 만료 (데드락 방지)
 */

import Redis from "ioredis";
import { LOCK_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";

/**
 * Redis 키 패턴
 */
const LOCK_KEYS = {
  PLATFORM_LOCK: (platform: string) => `workflow:lock:platform:${platform}`,
  RUNNING_JOB: (platform: string) => `workflow:running:platform:${platform}`,
} as const;

/**
 * Platform Lock 클래스
 * 플랫폼별 분산 Lock 관리
 */
export class PlatformLock {
  private readonly lockKey: string;
  private readonly runningJobKey: string;
  private readonly lockTTLSeconds: number;

  constructor(
    private readonly redis: Redis,
    private readonly platform: string,
  ) {
    this.lockKey = LOCK_KEYS.PLATFORM_LOCK(platform);
    this.runningJobKey = LOCK_KEYS.RUNNING_JOB(platform);
    this.lockTTLSeconds = Math.ceil(LOCK_CONFIG.LOCK_TTL_MS / 1000);
  }

  /**
   * Lock 획득 시도
   * @returns true: 획득 성공, false: 획득 실패 (다른 프로세스가 보유 중)
   */
  async acquire(): Promise<boolean> {
    try {
      // SET NX EX (atomic): key가 없을 때만 설정 + TTL
      const result = await this.redis.set(
        this.lockKey,
        Date.now().toString(),
        "EX",
        this.lockTTLSeconds,
        "NX",
      );

      return result === "OK";
    } catch (error) {
      logger.error(
        {
          platform: this.platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "Platform Lock 획득 중 오류",
      );
      return false;
    }
  }

  /**
   * Lock 해제
   */
  async release(): Promise<void> {
    try {
      await this.redis.del(this.lockKey);
    } catch (error) {
      logger.error(
        {
          platform: this.platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "Platform Lock 해제 중 오류",
      );
    }
  }

  /**
   * Lock 보유 여부 확인
   */
  async isLocked(): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.lockKey);
      return exists === 1;
    } catch (error) {
      logger.error(
        {
          platform: this.platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "Platform Lock 상태 확인 중 오류",
      );
      return false;
    }
  }

  /**
   * Lock 남은 TTL 조회 (초)
   * @returns 남은 TTL (초), -2: 키 없음, -1: TTL 없음
   */
  async getTTL(): Promise<number> {
    try {
      return await this.redis.ttl(this.lockKey);
    } catch (error) {
      logger.error(
        {
          platform: this.platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "Platform Lock TTL 조회 중 오류",
      );
      return -2;
    }
  }

  /**
   * 실행 중인 Job 설정
   * Lock과 동일한 TTL 적용 (Job 완료 시 clearRunningJob 호출 필요)
   */
  async setRunningJob(jobId: string, workflowId?: string): Promise<void> {
    try {
      const value = JSON.stringify({
        job_id: jobId,
        workflow_id: workflowId,
        started_at: new Date().toISOString(),
      });
      await this.redis.set(
        this.runningJobKey,
        value,
        "EX",
        this.lockTTLSeconds,
      );
    } catch (error) {
      logger.error(
        {
          platform: this.platform,
          job_id: jobId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Running Job 설정 중 오류",
      );
    }
  }

  /**
   * 실행 중인 Job 정보 초기화
   */
  async clearRunningJob(): Promise<void> {
    try {
      await this.redis.del(this.runningJobKey);
    } catch (error) {
      logger.error(
        {
          platform: this.platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "Running Job 초기화 중 오류",
      );
    }
  }

  /**
   * 실행 중인 Job 정보 조회
   * @returns Job 정보 또는 null (실행 중인 Job 없음)
   */
  async getRunningJob(): Promise<{
    job_id: string;
    workflow_id?: string;
    started_at: string;
  } | null> {
    try {
      const value = await this.redis.get(this.runningJobKey);
      if (!value) {
        return null;
      }
      return JSON.parse(value);
    } catch (error) {
      logger.error(
        {
          platform: this.platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "Running Job 조회 중 오류",
      );
      return null;
    }
  }
}

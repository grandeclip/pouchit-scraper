/**
 * Scheduler State Repository
 * Redis 기반 스케줄러 상태 관리
 *
 * 목적:
 * - 글로벌 Job 요청 시간 추적 (플랫폼 간 30초 간격)
 * - 플랫폼별 상태 관리 (on_sale 카운터, 완료 시간)
 */

import Redis from "ioredis";
import { SCHEDULER_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";

/**
 * Redis 키 패턴
 */
const SCHEDULER_KEYS = {
  /** 글로벌: 마지막 Job 요청 시간 (any platform) */
  LAST_ENQUEUE_AT: "scheduler:last_enqueue_at",
  /** 플랫폼별 상태: { on_sale_counter, last_completed_at } */
  PLATFORM_STATE: (platform: string) => `scheduler:state:${platform}`,
} as const;

/**
 * 플랫폼 상태 인터페이스
 */
export interface PlatformState {
  /** on_sale 카운터 (0 ~ ON_SALE_RATIO-1: on_sale, ON_SALE_RATIO: off_sale) */
  on_sale_counter: number;
  /** 마지막 Job 완료 시간 (ISO 8601) */
  last_completed_at: string | null;
}

/**
 * Scheduler State Repository
 */
export class SchedulerStateRepository {
  constructor(private readonly redis: Redis) {}

  /**
   * 마지막 Job 요청 시간 조회
   * @returns timestamp (ms) 또는 0 (없음)
   */
  async getLastEnqueueAt(): Promise<number> {
    try {
      const value = await this.redis.get(SCHEDULER_KEYS.LAST_ENQUEUE_AT);
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[SchedulerState] getLastEnqueueAt 오류",
      );
      return 0;
    }
  }

  /**
   * 마지막 Job 요청 시간 설정
   * @param timestamp - timestamp (ms)
   */
  async setLastEnqueueAt(timestamp: number): Promise<void> {
    try {
      // TTL 1시간 (스케줄러 재시작 시에도 안전)
      await this.redis.set(
        SCHEDULER_KEYS.LAST_ENQUEUE_AT,
        timestamp.toString(),
        "EX",
        3600,
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[SchedulerState] setLastEnqueueAt 오류",
      );
    }
  }

  /**
   * 플랫폼 상태 조회
   * @param platform - 플랫폼명
   * @returns PlatformState 또는 기본값
   */
  async getPlatformState(platform: string): Promise<PlatformState> {
    try {
      const value = await this.redis.get(
        SCHEDULER_KEYS.PLATFORM_STATE(platform),
      );
      if (!value) {
        return { on_sale_counter: 0, last_completed_at: null };
      }
      return JSON.parse(value) as PlatformState;
    } catch (error) {
      logger.error(
        {
          platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "[SchedulerState] getPlatformState 오류",
      );
      return { on_sale_counter: 0, last_completed_at: null };
    }
  }

  /**
   * 플랫폼 상태 업데이트
   * @param platform - 플랫폼명
   * @param state - 업데이트할 상태 (부분 업데이트 가능)
   */
  async updatePlatformState(
    platform: string,
    state: Partial<PlatformState>,
  ): Promise<void> {
    try {
      const current = await this.getPlatformState(platform);
      const updated: PlatformState = {
        ...current,
        ...state,
      };

      // TTL 24시간 (충분한 유지 기간)
      await this.redis.set(
        SCHEDULER_KEYS.PLATFORM_STATE(platform),
        JSON.stringify(updated),
        "EX",
        86400,
      );

      logger.debug(
        { platform, state: updated },
        "[SchedulerState] 플랫폼 상태 업데이트",
      );
    } catch (error) {
      logger.error(
        {
          platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "[SchedulerState] updatePlatformState 오류",
      );
    }
  }

  /**
   * on_sale 카운터 증가 및 다음 sale_status 결정
   * @param platform - 플랫폼명
   * @returns 다음 Job의 sale_status ("on_sale" | "off_sale")
   */
  async getNextSaleStatus(platform: string): Promise<"on_sale" | "off_sale"> {
    const state = await this.getPlatformState(platform);
    const ratio = SCHEDULER_CONFIG.ON_SALE_RATIO;

    // 카운터가 ratio 미만이면 on_sale, ratio 이상이면 off_sale
    if (state.on_sale_counter < ratio) {
      return "on_sale";
    } else {
      return "off_sale";
    }
  }

  /**
   * on_sale 카운터 증가 (off_sale 후 리셋)
   * @param platform - 플랫폼명
   * @param currentSaleStatus - 현재 실행된 sale_status
   */
  async incrementOnSaleCounter(
    platform: string,
    currentSaleStatus: "on_sale" | "off_sale",
  ): Promise<void> {
    const state = await this.getPlatformState(platform);
    const ratio = SCHEDULER_CONFIG.ON_SALE_RATIO;

    let newCounter: number;
    if (currentSaleStatus === "off_sale") {
      // off_sale 실행 후 리셋
      newCounter = 0;
    } else {
      // on_sale 실행 후 증가
      newCounter = state.on_sale_counter + 1;
      if (newCounter > ratio) {
        newCounter = ratio; // 최대값 제한
      }
    }

    await this.updatePlatformState(platform, { on_sale_counter: newCounter });
  }

  /**
   * Job 완료 시간 기록
   * @param platform - 플랫폼명
   */
  async setJobCompletedAt(platform: string): Promise<void> {
    await this.updatePlatformState(platform, {
      last_completed_at: new Date().toISOString(),
    });
  }

  /**
   * 플랫폼 쿨다운 확인
   * @param platform - 플랫폼명
   * @returns true: 쿨다운 완료 (Job 요청 가능), false: 아직 쿨다운 중
   */
  async isPlatformCooldownComplete(platform: string): Promise<boolean> {
    const state = await this.getPlatformState(platform);

    if (!state.last_completed_at) {
      // 이전 기록 없음 - 요청 가능
      return true;
    }

    const lastCompletedAt = new Date(state.last_completed_at).getTime();
    const elapsed = Date.now() - lastCompletedAt;

    return elapsed >= SCHEDULER_CONFIG.SAME_PLATFORM_COOLDOWN_MS;
  }

  /**
   * 글로벌 쿨다운 확인 (플랫폼 간 간격)
   * @returns true: 쿨다운 완료 (Job 요청 가능), false: 아직 쿨다운 중
   */
  async isGlobalCooldownComplete(): Promise<boolean> {
    const lastEnqueueAt = await this.getLastEnqueueAt();

    if (lastEnqueueAt === 0) {
      // 이전 기록 없음 - 요청 가능
      return true;
    }

    const elapsed = Date.now() - lastEnqueueAt;
    return elapsed >= SCHEDULER_CONFIG.INTER_PLATFORM_DELAY_MS;
  }

  /**
   * 모든 플랫폼 상태 조회 (디버깅/모니터링용)
   */
  async getAllPlatformStates(): Promise<Record<string, PlatformState>> {
    const states: Record<string, PlatformState> = {};

    for (const platform of SCHEDULER_CONFIG.PLATFORMS) {
      states[platform] = await this.getPlatformState(platform);
    }

    return states;
  }
}

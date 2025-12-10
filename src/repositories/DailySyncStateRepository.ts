/**
 * Daily Sync State Repository
 * Redis 기반 Daily Planning Product Sync 스케줄러 상태 관리
 *
 * 목적:
 * - Daily Sync 스케줄러 활성화/비활성화 관리
 * - 실행 시간 설정 (기본: 오전 2시 KST)
 * - 마지막 실행 정보 추적
 *
 * SOLID 원칙:
 * - SRP: Daily Sync 스케줄러 상태만 관리
 * - DIP: Redis 클라이언트 의존성 주입
 */

import Redis from "ioredis";
import { logger } from "@/config/logger";

/**
 * Redis 키 패턴
 */
const DAILY_SYNC_KEYS = {
  /** 스케줄러 활성화 여부 */
  ENABLED: "daily_sync:enabled",
  /** 스케줄러 설정 및 상태 */
  STATUS: "daily_sync:status",
  /** 마지막 실행 결과 */
  LAST_RUN: "daily_sync:last_run",
} as const;

/**
 * Daily Sync 설정 인터페이스
 */
export interface DailySyncConfig {
  /** 실행 시간 (24시간 형식, 0-23) */
  hour: number;
  /** 실행 분 (0-59) */
  minute: number;
  /** cron 표현식 (자동 생성됨) */
  cronExpression: string;
}

/**
 * Daily Sync 상태 인터페이스
 */
export interface DailySyncStatus {
  /** 스케줄러 활성화 여부 */
  enabled: boolean;
  /** 스케줄러 컨테이너 실행 중 여부 */
  running: boolean;
  /** 설정 */
  config: DailySyncConfig;
  /** 마지막 상태 변경 시간 */
  last_changed_at: string | null;
  /** 마지막 heartbeat 시간 */
  last_heartbeat_at: string | null;
  /** 다음 예정 실행 시간 */
  next_run_at: string | null;
}

/**
 * 마지막 실행 결과 인터페이스
 */
export interface DailySyncLastRun {
  /** 실행 시작 시간 */
  started_at: string;
  /** 실행 완료 시간 */
  completed_at: string | null;
  /** 성공 여부 */
  success: boolean;
  /** 결과 요약 */
  summary: {
    total_products: number;
    success_count: number;
    failed_count: number;
    new_product_sets: number;
    duration_ms: number;
  } | null;
  /** 에러 메시지 (실패 시) */
  error: string | null;
}

/**
 * 기본 설정 (오전 2시 KST)
 * cron: "0 2 * * *" (매일 02:00)
 * node-cron은 서버 로컬 타임존(TZ=Asia/Seoul) 기준으로 실행
 */
const DEFAULT_CONFIG: DailySyncConfig = {
  hour: 2,
  minute: 0,
  cronExpression: "0 2 * * *",
};

/**
 * hour, minute으로 cron 표현식 생성
 */
export function buildCronExpression(hour: number, minute: number): string {
  return `${minute} ${hour} * * *`;
}

/**
 * Daily Sync State Repository
 */
export class DailySyncStateRepository {
  constructor(private readonly redis: Redis) {}

  /**
   * 스케줄러 활성화 여부 조회
   */
  async isEnabled(): Promise<boolean> {
    try {
      const value = await this.redis.get(DAILY_SYNC_KEYS.ENABLED);
      return value === "true";
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] isEnabled 오류",
      );
      return false;
    }
  }

  /**
   * 스케줄러 활성화/비활성화 설정
   */
  async setEnabled(enabled: boolean): Promise<void> {
    try {
      await this.redis.set(DAILY_SYNC_KEYS.ENABLED, enabled ? "true" : "false");
      logger.info(
        { enabled },
        `[DailySyncState] Daily Sync 스케줄러 ${enabled ? "활성화" : "비활성화"}`,
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] setEnabled 오류",
      );
    }
  }

  /**
   * 설정 조회
   */
  async getConfig(): Promise<DailySyncConfig> {
    try {
      const statusJson = await this.redis.get(DAILY_SYNC_KEYS.STATUS);
      if (!statusJson) {
        return DEFAULT_CONFIG;
      }
      const status = JSON.parse(statusJson) as Partial<DailySyncStatus>;
      return status.config ?? DEFAULT_CONFIG;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] getConfig 오류",
      );
      return DEFAULT_CONFIG;
    }
  }

  /**
   * 설정 업데이트 (hour, minute 지정 시 cronExpression 자동 생성)
   */
  async setConfig(
    config: Partial<Omit<DailySyncConfig, "cronExpression">>,
  ): Promise<void> {
    try {
      const current = await this.getStatus();
      const hour = config.hour ?? current.config.hour;
      const minute = config.minute ?? current.config.minute;

      const updatedConfig: DailySyncConfig = {
        hour,
        minute,
        cronExpression: buildCronExpression(hour, minute),
      };

      await this.updateStatus({ config: updatedConfig });
      logger.info({ config: updatedConfig }, "[DailySyncState] 설정 업데이트");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] setConfig 오류",
      );
    }
  }

  /**
   * 스케줄러 상태 조회
   */
  async getStatus(): Promise<DailySyncStatus> {
    try {
      const [enabled, statusJson] = await Promise.all([
        this.isEnabled(),
        this.redis.get(DAILY_SYNC_KEYS.STATUS),
      ]);

      const defaultStatus: DailySyncStatus = {
        enabled,
        running: false,
        config: DEFAULT_CONFIG,
        last_changed_at: null,
        last_heartbeat_at: null,
        next_run_at: null,
      };

      if (!statusJson) {
        return defaultStatus;
      }

      const status = JSON.parse(statusJson) as Partial<DailySyncStatus>;

      // heartbeat가 60초 이상 오래되면 running = false로 판단
      let isRunning = status.running ?? false;
      if (status.last_heartbeat_at) {
        const heartbeatAge =
          Date.now() - new Date(status.last_heartbeat_at).getTime();
        if (heartbeatAge > 60000) {
          isRunning = false;
        }
      }

      return {
        enabled,
        running: isRunning,
        config: status.config ?? DEFAULT_CONFIG,
        last_changed_at: status.last_changed_at ?? null,
        last_heartbeat_at: status.last_heartbeat_at ?? null,
        next_run_at: status.next_run_at ?? null,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] getStatus 오류",
      );
      return {
        enabled: false,
        running: false,
        config: DEFAULT_CONFIG,
        last_changed_at: null,
        last_heartbeat_at: null,
        next_run_at: null,
      };
    }
  }

  /**
   * 스케줄러 상태 업데이트
   */
  async updateStatus(
    updates: Partial<Omit<DailySyncStatus, "enabled">>,
  ): Promise<void> {
    try {
      const current = await this.getStatus();
      const updated: Omit<DailySyncStatus, "enabled"> = {
        running: updates.running ?? current.running,
        config: updates.config ?? current.config,
        last_changed_at: updates.last_changed_at ?? current.last_changed_at,
        last_heartbeat_at:
          updates.last_heartbeat_at ?? current.last_heartbeat_at,
        next_run_at: updates.next_run_at ?? current.next_run_at,
      };

      // TTL 24시간
      await this.redis.set(
        DAILY_SYNC_KEYS.STATUS,
        JSON.stringify(updated),
        "EX",
        86400,
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] updateStatus 오류",
      );
    }
  }

  /**
   * Heartbeat 업데이트
   */
  async updateHeartbeat(): Promise<void> {
    await this.updateStatus({
      running: true,
      last_heartbeat_at: new Date().toISOString(),
    });
  }

  /**
   * 다음 실행 시간 설정 (cron에서 호출)
   */
  async setNextRunAt(nextRunAt: string): Promise<void> {
    await this.updateStatus({ next_run_at: nextRunAt });
  }

  /**
   * 마지막 실행 결과 저장
   */
  async setLastRun(lastRun: DailySyncLastRun): Promise<void> {
    try {
      // TTL 7일
      await this.redis.set(
        DAILY_SYNC_KEYS.LAST_RUN,
        JSON.stringify(lastRun),
        "EX",
        604800,
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] setLastRun 오류",
      );
    }
  }

  /**
   * 마지막 실행 결과 조회
   */
  async getLastRun(): Promise<DailySyncLastRun | null> {
    try {
      const value = await this.redis.get(DAILY_SYNC_KEYS.LAST_RUN);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as DailySyncLastRun;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncState] getLastRun 오류",
      );
      return null;
    }
  }
}

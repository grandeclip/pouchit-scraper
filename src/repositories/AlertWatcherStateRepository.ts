/**
 * Alert Watcher State Repository
 * Redis 기반 Alert Watcher 상태 관리
 *
 * 목적:
 * - Alert Watcher 활성화/비활성화 제어
 * - 감시 작업별 완료 시간 추적 (완료 후 interval 대기)
 * - Heartbeat 기반 실행 상태 모니터링
 */

import Redis from "ioredis";
import { logger } from "@/config/logger";

/**
 * Redis 키 패턴
 */
const ALERT_WATCHER_KEYS = {
  /** Alert Watcher 활성화 여부 */
  ENABLED: "alert_watcher:enabled",
  /** Alert Watcher 상태 정보 */
  STATUS: "alert_watcher:status",
  /** 작업별 마지막 완료 시간 */
  TASK_COMPLETED_AT: (taskId: string) =>
    `alert_watcher:task:${taskId}:completed_at`,
} as const;

/**
 * Alert Watcher 상태 인터페이스
 */
export interface AlertWatcherStatus {
  /** Alert Watcher 활성화 여부 */
  enabled: boolean;
  /** Alert Watcher 컨테이너 실행 중 여부 */
  running: boolean;
  /** 마지막 상태 변경 시간 */
  last_changed_at: string | null;
  /** 마지막 heartbeat 시간 */
  last_heartbeat_at: string | null;
  /** 총 실행된 Job 수 */
  total_jobs_executed: number;
}

/**
 * 감시 작업 상태 인터페이스
 */
export interface WatchTaskState {
  /** 마지막 완료 시간 (ISO 8601) */
  last_completed_at: string | null;
}

/**
 * Alert Watcher State Repository
 */
export class AlertWatcherStateRepository {
  constructor(private readonly redis: Redis) {}

  // ============================================
  // Alert Watcher Control Methods
  // ============================================

  /**
   * Alert Watcher 활성화 여부 조회
   * @returns true: 활성화됨, false: 비활성화됨
   */
  async isEnabled(): Promise<boolean> {
    try {
      const value = await this.redis.get(ALERT_WATCHER_KEYS.ENABLED);
      // 기본값: false (비활성화)
      return value === "true";
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[AlertWatcherState] isEnabled 오류",
      );
      return false;
    }
  }

  /**
   * Alert Watcher 활성화/비활성화 설정
   * @param enabled - true: 활성화, false: 비활성화
   */
  async setEnabled(enabled: boolean): Promise<void> {
    try {
      await this.redis.set(
        ALERT_WATCHER_KEYS.ENABLED,
        enabled ? "true" : "false",
      );
      logger.info(
        { enabled },
        `[AlertWatcherState] Alert Watcher ${enabled ? "활성화" : "비활성화"}`,
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[AlertWatcherState] setEnabled 오류",
      );
    }
  }

  /**
   * Alert Watcher 상태 조회
   */
  async getStatus(): Promise<AlertWatcherStatus> {
    try {
      const [enabled, statusJson] = await Promise.all([
        this.isEnabled(),
        this.redis.get(ALERT_WATCHER_KEYS.STATUS),
      ]);

      const defaultStatus: AlertWatcherStatus = {
        enabled,
        running: false,
        last_changed_at: null,
        last_heartbeat_at: null,
        total_jobs_executed: 0,
      };

      if (!statusJson) {
        return defaultStatus;
      }

      const status = JSON.parse(statusJson) as Partial<AlertWatcherStatus>;

      // heartbeat가 30초 이상 오래되면 running = false로 판단
      let isRunning = status.running ?? false;
      if (status.last_heartbeat_at) {
        const heartbeatAge =
          Date.now() - new Date(status.last_heartbeat_at).getTime();
        if (heartbeatAge > 30000) {
          isRunning = false;
        }
      }

      return {
        enabled,
        running: isRunning,
        last_changed_at: status.last_changed_at ?? null,
        last_heartbeat_at: status.last_heartbeat_at ?? null,
        total_jobs_executed: status.total_jobs_executed ?? 0,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[AlertWatcherState] getStatus 오류",
      );
      return {
        enabled: false,
        running: false,
        last_changed_at: null,
        last_heartbeat_at: null,
        total_jobs_executed: 0,
      };
    }
  }

  /**
   * Alert Watcher 상태 업데이트
   */
  async updateStatus(
    updates: Partial<Omit<AlertWatcherStatus, "enabled">>,
  ): Promise<void> {
    try {
      const current = await this.getStatus();
      const updated: Omit<AlertWatcherStatus, "enabled"> = {
        running: updates.running ?? current.running,
        last_changed_at: updates.last_changed_at ?? current.last_changed_at,
        last_heartbeat_at:
          updates.last_heartbeat_at ?? current.last_heartbeat_at,
        total_jobs_executed:
          updates.total_jobs_executed ?? current.total_jobs_executed,
      };

      // TTL 1시간
      await this.redis.set(
        ALERT_WATCHER_KEYS.STATUS,
        JSON.stringify(updated),
        "EX",
        3600,
      );
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[AlertWatcherState] updateStatus 오류",
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
   * 실행된 Job 수 증가
   */
  async incrementJobsExecuted(): Promise<void> {
    const status = await this.getStatus();
    await this.updateStatus({
      total_jobs_executed: status.total_jobs_executed + 1,
    });
  }

  // ============================================
  // Task State Methods (완료 시간 기반 대기)
  // ============================================

  /**
   * 작업 완료 시간 조회
   * @param taskId - 작업 ID (e.g., "collabo_banner")
   * @returns 완료 시간 timestamp (ms) 또는 0 (없음)
   */
  async getTaskCompletedAt(taskId: string): Promise<number> {
    try {
      const value = await this.redis.get(
        ALERT_WATCHER_KEYS.TASK_COMPLETED_AT(taskId),
      );
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      logger.error(
        {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        },
        "[AlertWatcherState] getTaskCompletedAt 오류",
      );
      return 0;
    }
  }

  /**
   * 작업 완료 시간 설정
   * @param taskId - 작업 ID
   * @param timestamp - 완료 시간 (ms), 기본값: 현재 시간
   */
  async setTaskCompletedAt(taskId: string, timestamp?: number): Promise<void> {
    try {
      const ts = timestamp ?? Date.now();
      // TTL 24시간
      await this.redis.set(
        ALERT_WATCHER_KEYS.TASK_COMPLETED_AT(taskId),
        ts.toString(),
        "EX",
        86400,
      );
      logger.debug(
        { taskId, completed_at: new Date(ts).toISOString() },
        "[AlertWatcherState] 작업 완료 시간 기록",
      );
    } catch (error) {
      logger.error(
        {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        },
        "[AlertWatcherState] setTaskCompletedAt 오류",
      );
    }
  }

  /**
   * 작업 쿨다운 완료 확인 (완료 후 interval 경과 여부)
   * @param taskId - 작업 ID
   * @param intervalMs - 대기 시간 (ms)
   * @returns true: 실행 가능, false: 아직 대기 중
   */
  async isTaskCooldownComplete(
    taskId: string,
    intervalMs: number,
  ): Promise<boolean> {
    const completedAt = await this.getTaskCompletedAt(taskId);

    if (completedAt === 0) {
      // 이전 완료 기록 없음 - 즉시 실행 가능
      return true;
    }

    const elapsed = Date.now() - completedAt;
    return elapsed >= intervalMs;
  }

  /**
   * 모든 작업 상태 조회 (디버깅/모니터링용)
   * @param taskIds - 조회할 작업 ID 목록
   */
  async getAllTaskStates(
    taskIds: string[],
  ): Promise<Record<string, WatchTaskState>> {
    const states: Record<string, WatchTaskState> = {};

    for (const taskId of taskIds) {
      const completedAt = await this.getTaskCompletedAt(taskId);
      states[taskId] = {
        last_completed_at:
          completedAt > 0 ? new Date(completedAt).toISOString() : null,
      };
    }

    return states;
  }
}

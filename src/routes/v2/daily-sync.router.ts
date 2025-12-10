/**
 * Daily Sync Scheduler API Router
 *
 * 기획상품 자동 추가 스케줄러 제어 및 상태 조회 API
 * - GET /status - 스케줄러 상태 조회
 * - POST /start - 스케줄러 시작 (실행 시간 설정 가능)
 * - POST /stop - 스케줄러 중지
 * - POST /run - 즉시 실행 (테스트용)
 *
 * SOLID 원칙:
 * - SRP: Daily Sync 스케줄러 API만 담당
 * - DIP: Repository 추상화에 의존
 */

import { Router, Request, Response } from "express";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import {
  DailySyncStateRepository,
  buildCronExpression,
} from "@/repositories/DailySyncStateRepository";
import {
  DailyPlanningProductSyncService,
  SyncResult,
} from "@/services/DailyPlanningProductSyncService";
import { logger } from "@/config/logger";

const router = Router();

/**
 * GET /api/v2/daily-sync/status
 *
 * Daily Sync 스케줄러 상태 조회
 */
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const dailySyncState = new DailySyncStateRepository(repository.client);

    const status = await dailySyncState.getStatus();
    const lastRun = await dailySyncState.getLastRun();

    res.json({
      success: true,
      data: {
        scheduler: {
          enabled: status.enabled,
          running: status.running,
          last_changed_at: status.last_changed_at,
          last_heartbeat_at: status.last_heartbeat_at,
          next_run_at: status.next_run_at,
        },
        config: {
          hour: status.config.hour,
          minute: status.config.minute,
          cron_expression: status.config.cronExpression,
          timezone: "Asia/Seoul (KST, +09:00)",
        },
        last_run: lastRun,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[DailySyncRouter] 상태 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to fetch daily sync status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/daily-sync/start
 *
 * Daily Sync 스케줄러 시작 (활성화)
 *
 * Body (optional):
 * - hour: 실행 시간 (0-23, 기본: 2)
 * - minute: 실행 분 (0-59, 기본: 0)
 */
router.post("/start", async (req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const dailySyncState = new DailySyncStateRepository(repository.client);

    const { hour, minute } = req.body as { hour?: number; minute?: number };

    // 시간 유효성 검사
    if (hour !== undefined && (hour < 0 || hour > 23)) {
      res.status(400).json({
        success: false,
        error: "Invalid hour",
        message: "hour must be between 0 and 23",
      });
      return;
    }

    if (minute !== undefined && (minute < 0 || minute > 59)) {
      res.status(400).json({
        success: false,
        error: "Invalid minute",
        message: "minute must be between 0 and 59",
      });
      return;
    }

    const currentStatus = await dailySyncState.getStatus();

    // 시간 설정 변경 (지정된 경우)
    if (hour !== undefined || minute !== undefined) {
      await dailySyncState.setConfig({
        hour: hour ?? currentStatus.config.hour,
        minute: minute ?? currentStatus.config.minute,
      });
    }

    // 이미 활성화 상태
    if (currentStatus.enabled) {
      const updatedStatus = await dailySyncState.getStatus();
      res.json({
        success: true,
        message: "Daily Sync scheduler is already enabled",
        data: {
          enabled: true,
          was_enabled: true,
          config: {
            hour: updatedStatus.config.hour,
            minute: updatedStatus.config.minute,
            cron_expression: updatedStatus.config.cronExpression,
          },
        },
      });
      return;
    }

    // 활성화
    await dailySyncState.setEnabled(true);
    await dailySyncState.updateStatus({
      last_changed_at: new Date().toISOString(),
    });

    const updatedStatus = await dailySyncState.getStatus();

    logger.info(
      { config: updatedStatus.config },
      "[DailySyncRouter] Daily Sync 스케줄러 시작 요청",
    );

    res.json({
      success: true,
      message: "Daily Sync scheduler started",
      data: {
        enabled: true,
        was_enabled: false,
        config: {
          hour: updatedStatus.config.hour,
          minute: updatedStatus.config.minute,
          cron_expression: updatedStatus.config.cronExpression,
          timezone: "Asia/Seoul (KST, +09:00)",
        },
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[DailySyncRouter] 시작 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to start daily sync scheduler",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/daily-sync/stop
 *
 * Daily Sync 스케줄러 중지 (비활성화)
 */
router.post("/stop", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const dailySyncState = new DailySyncStateRepository(repository.client);

    const currentStatus = await dailySyncState.getStatus();
    const wasEnabled = currentStatus.enabled;

    if (wasEnabled) {
      await dailySyncState.setEnabled(false);
      await dailySyncState.updateStatus({
        last_changed_at: new Date().toISOString(),
      });
    }

    logger.info("[DailySyncRouter] Daily Sync 스케줄러 중지 요청");

    res.json({
      success: true,
      message: wasEnabled
        ? "Daily Sync scheduler stopped"
        : "Daily Sync scheduler was already stopped",
      data: {
        enabled: false,
        was_enabled: wasEnabled,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[DailySyncRouter] 중지 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to stop daily sync scheduler",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/daily-sync/run
 *
 * Daily Sync 즉시 실행 (테스트/수동 실행용)
 *
 * Body (optional):
 * - dry_run: true면 실제 INSERT/enqueue 하지 않음
 * - product_ids: 특정 product_id만 처리
 * - batch_size: 배치 크기 (기본: 10)
 * - delay_ms: 요청 간 딜레이 (기본: 2000)
 */
router.post("/run", async (req: Request, res: Response) => {
  try {
    const {
      dry_run = false,
      product_ids,
      batch_size = 10,
      delay_ms = 2000,
    } = req.body as {
      dry_run?: boolean;
      product_ids?: string[];
      batch_size?: number;
      delay_ms?: number;
    };

    logger.info(
      { dry_run, product_ids, batch_size, delay_ms },
      "[DailySyncRouter] Daily Sync 수동 실행 요청",
    );

    const repository = RedisWorkflowRepository.getInstance();
    const dailySyncState = new DailySyncStateRepository(repository.client);

    // 실행 시작 기록
    const startedAt = new Date().toISOString();
    await dailySyncState.setLastRun({
      started_at: startedAt,
      completed_at: null,
      success: false,
      summary: null,
      error: null,
    });

    // 동기화 실행
    const syncService = new DailyPlanningProductSyncService();
    let result: SyncResult;

    try {
      result = await syncService.sync({
        batchSize: batch_size,
        delayMs: delay_ms,
        dryRun: dry_run,
        productIds: product_ids,
      });

      // 성공 기록
      await dailySyncState.setLastRun({
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        success: true,
        summary: {
          total_products: result.totalProducts,
          success_count: result.successCount,
          failed_count: result.failedCount,
          new_product_sets: result.newProductSetsCount,
          duration_ms: result.durationMs,
        },
        error: null,
      });

      // Slack: 완료 알림 (dry_run이 아니고 신규 ProductSet이 있을 때만)
      if (!dry_run && result.newProductSetsCount > 0) {
        await syncService.sendCompleteNotification(result);
      }

      res.json({
        success: true,
        message: dry_run
          ? "Daily Sync dry run completed"
          : "Daily Sync completed",
        data: {
          dry_run,
          total_products: result.totalProducts,
          success_count: result.successCount,
          skipped_count: result.skippedCount,
          failed_count: result.failedCount,
          new_product_sets_count: result.newProductSetsCount,
          enqueued_jobs_count: result.enqueuedJobsCount,
          duration_ms: result.durationMs,
          errors:
            result.errors.length > 0 ? result.errors.slice(0, 10) : undefined, // 최대 10개만 반환
          errors_truncated: result.errors.length > 10,
        },
      });
    } catch (syncError) {
      const errorMessage =
        syncError instanceof Error ? syncError.message : String(syncError);

      // 실패 기록
      await dailySyncState.setLastRun({
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        success: false,
        summary: null,
        error: errorMessage,
      });

      throw syncError;
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[DailySyncRouter] 수동 실행 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to run daily sync",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/v2/daily-sync/config
 *
 * Daily Sync 실행 시간 설정 변경
 *
 * Body:
 * - hour: 실행 시간 (0-23)
 * - minute: 실행 분 (0-59, 기본: 0)
 */
router.put("/config", async (req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const dailySyncState = new DailySyncStateRepository(repository.client);

    const { hour, minute = 0 } = req.body as { hour: number; minute?: number };

    // 유효성 검사
    if (hour === undefined || hour < 0 || hour > 23) {
      res.status(400).json({
        success: false,
        error: "Invalid hour",
        message: "hour is required and must be between 0 and 23",
      });
      return;
    }

    if (minute < 0 || minute > 59) {
      res.status(400).json({
        success: false,
        error: "Invalid minute",
        message: "minute must be between 0 and 59",
      });
      return;
    }

    await dailySyncState.setConfig({ hour, minute });

    const cronExpression = buildCronExpression(hour, minute);

    logger.info(
      { hour, minute, cronExpression },
      "[DailySyncRouter] 실행 시간 설정 변경",
    );

    res.json({
      success: true,
      message: "Daily Sync config updated",
      data: {
        hour,
        minute,
        cron_expression: cronExpression,
        timezone: "Asia/Seoul (KST, +09:00)",
        note: "변경사항은 스케줄러 재시작 후 적용됩니다",
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[DailySyncRouter] 설정 변경 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to update daily sync config",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

/**
 * Scheduler API Router
 *
 * 스케줄러 제어 및 상태 조회 API
 * - GET /status - 스케줄러 상태 조회
 * - POST /start - 스케줄러 시작
 * - POST /stop - 스케줄러 중지
 */

import { Router, Request, Response } from "express";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { SchedulerStateRepository } from "@/repositories/SchedulerStateRepository";
import { SCHEDULER_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";

const router = Router();

/**
 * GET /api/v2/scheduler/status
 *
 * 스케줄러 상태 조회
 */
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const schedulerState = new SchedulerStateRepository(repository.client);

    const status = await schedulerState.getSchedulerStatus();
    const platformStates = await schedulerState.getAllPlatformStates();

    res.json({
      success: true,
      data: {
        scheduler: {
          enabled: status.enabled,
          running: status.running,
          last_changed_at: status.last_changed_at,
          last_heartbeat_at: status.last_heartbeat_at,
          total_jobs_scheduled: status.total_jobs_scheduled,
        },
        config: {
          platforms: SCHEDULER_CONFIG.PLATFORMS,
          check_interval_ms: SCHEDULER_CONFIG.CHECK_INTERVAL_MS,
          inter_platform_delay_ms: SCHEDULER_CONFIG.INTER_PLATFORM_DELAY_MS,
          same_platform_cooldown_ms: SCHEDULER_CONFIG.SAME_PLATFORM_COOLDOWN_MS,
          on_sale_ratio: SCHEDULER_CONFIG.ON_SALE_RATIO,
          limit: "전체 조회 (자동 pagination)",
        },
        platforms: platformStates,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SchedulerRouter] 상태 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to fetch scheduler status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/scheduler/start
 *
 * 스케줄러 시작 (활성화)
 */
router.post("/start", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const schedulerState = new SchedulerStateRepository(repository.client);

    const currentStatus = await schedulerState.getSchedulerStatus();

    if (currentStatus.enabled) {
      res.json({
        success: true,
        message: "Scheduler is already enabled",
        data: { enabled: true, was_enabled: true },
      });
      return;
    }

    await schedulerState.setEnabled(true);
    await schedulerState.updateSchedulerStatus({
      last_changed_at: new Date().toISOString(),
    });

    logger.info("[SchedulerRouter] 스케줄러 시작 요청");

    res.json({
      success: true,
      message: "Scheduler started",
      data: { enabled: true, was_enabled: false },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SchedulerRouter] 시작 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to start scheduler",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/scheduler/stop
 *
 * 스케줄러 중지 (비활성화)
 *
 * Query Parameters:
 * - clear_queue: "true" - 대기 중인 모든 Job 삭제
 */
router.post("/stop", async (req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const schedulerState = new SchedulerStateRepository(repository.client);
    const clearQueue = req.query.clear_queue === "true";

    const currentStatus = await schedulerState.getSchedulerStatus();
    const wasEnabled = currentStatus.enabled;

    // 스케줄러 비활성화
    if (wasEnabled) {
      await schedulerState.setEnabled(false);
      await schedulerState.updateSchedulerStatus({
        last_changed_at: new Date().toISOString(),
      });
    }

    // Queue 비우기 (옵션)
    let clearedJobs: Record<string, number> = {};
    let totalCleared = 0;

    if (clearQueue) {
      clearedJobs = await repository.clearAllQueues(SCHEDULER_CONFIG.PLATFORMS);
      totalCleared = Object.values(clearedJobs).reduce((a, b) => a + b, 0);

      logger.info(
        { total_cleared: totalCleared, cleared_by_platform: clearedJobs },
        "[SchedulerRouter] 스케줄러 중지 + 큐 비우기",
      );
    } else {
      logger.info("[SchedulerRouter] 스케줄러 중지 요청");
    }

    res.json({
      success: true,
      message: clearQueue
        ? `Scheduler stopped and ${totalCleared} queued jobs cleared`
        : "Scheduler stopped",
      data: {
        enabled: false,
        was_enabled: wasEnabled,
        queue_cleared: clearQueue,
        cleared_jobs: clearQueue ? clearedJobs : undefined,
        total_cleared: clearQueue ? totalCleared : undefined,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SchedulerRouter] 중지 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to stop scheduler",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

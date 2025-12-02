/**
 * Alert Watcher API Router
 *
 * Alert Watcher 제어 및 상태 조회 API
 * - GET /status - Alert Watcher 상태 조회
 * - POST /start - Alert Watcher 시작
 * - POST /stop - Alert Watcher 중지
 */

import { Router, Request, Response } from "express";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { AlertWatcherStateRepository } from "@/repositories/AlertWatcherStateRepository";
import { logger } from "@/config/logger";

const router = Router();

/**
 * Alert Watcher 설정 (alert-watcher.ts와 동기화 필요)
 */
const ALERT_WATCHER_CONFIG = {
  TASKS: [
    { id: "collabo_banner", name: "Collabo Banner Monitor", interval_min: 20 },
    { id: "votes", name: "Votes Monitor", interval_min: 20 },
  ],
  CHECK_INTERVAL_MS: 60 * 1000,
};

/**
 * GET /api/v2/alert-watcher/status
 *
 * Alert Watcher 상태 조회
 */
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const watcherState = new AlertWatcherStateRepository(repository.client);

    const status = await watcherState.getStatus();
    const taskIds = ALERT_WATCHER_CONFIG.TASKS.map((t) => t.id);
    const taskStates = await watcherState.getAllTaskStates(taskIds);

    res.json({
      success: true,
      data: {
        watcher: {
          enabled: status.enabled,
          running: status.running,
          last_changed_at: status.last_changed_at,
          last_heartbeat_at: status.last_heartbeat_at,
          total_jobs_executed: status.total_jobs_executed,
        },
        config: {
          tasks: ALERT_WATCHER_CONFIG.TASKS,
          check_interval_ms: ALERT_WATCHER_CONFIG.CHECK_INTERVAL_MS,
        },
        tasks: taskStates,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[AlertWatcherRouter] 상태 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to fetch alert watcher status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/alert-watcher/start
 *
 * Alert Watcher 시작 (활성화)
 */
router.post("/start", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const watcherState = new AlertWatcherStateRepository(repository.client);

    const currentStatus = await watcherState.getStatus();

    if (currentStatus.enabled) {
      res.json({
        success: true,
        message: "Alert Watcher is already enabled",
        data: { enabled: true, was_enabled: true },
      });
      return;
    }

    await watcherState.setEnabled(true);
    await watcherState.updateStatus({
      last_changed_at: new Date().toISOString(),
    });

    logger.info("[AlertWatcherRouter] Alert Watcher 시작 요청");

    res.json({
      success: true,
      message: "Alert Watcher started",
      data: { enabled: true, was_enabled: false },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[AlertWatcherRouter] 시작 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to start alert watcher",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/alert-watcher/stop
 *
 * Alert Watcher 중지 (비활성화)
 *
 * Query Parameters:
 * - clear_queue: "true" - 대기 중인 alert Job 삭제
 */
router.post("/stop", async (req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const watcherState = new AlertWatcherStateRepository(repository.client);
    const clearQueue = req.query.clear_queue === "true";

    const currentStatus = await watcherState.getStatus();
    const wasEnabled = currentStatus.enabled;

    // Alert Watcher 비활성화
    if (wasEnabled) {
      await watcherState.setEnabled(false);
      await watcherState.updateStatus({
        last_changed_at: new Date().toISOString(),
      });
    }

    // Queue 비우기 (옵션)
    let clearedJobs = 0;

    if (clearQueue) {
      const cleared = await repository.clearAllQueues(["alert"]);
      clearedJobs = cleared["alert"] || 0;

      logger.info(
        { cleared_jobs: clearedJobs },
        "[AlertWatcherRouter] Alert Watcher 중지 + 큐 비우기",
      );
    } else {
      logger.info("[AlertWatcherRouter] Alert Watcher 중지 요청");
    }

    res.json({
      success: true,
      message: clearQueue
        ? `Alert Watcher stopped and ${clearedJobs} queued jobs cleared`
        : "Alert Watcher stopped",
      data: {
        enabled: false,
        was_enabled: wasEnabled,
        queue_cleared: clearQueue,
        cleared_jobs: clearQueue ? clearedJobs : undefined,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[AlertWatcherRouter] 중지 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to stop alert watcher",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

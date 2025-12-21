/**
 * System API Router
 *
 * 시스템 전체 관리 API
 * - POST /restart-all - 모든 컨테이너 순차 재시작 트리거
 * - GET /restart-status - 재시작 트리거 상태 조회
 */

import { Router, Request, Response } from "express";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { logger } from "@/config/logger";

const router = Router();

/**
 * 시스템 재시작 트리거 Redis 키
 * - restarter 컨테이너가 30초마다 폴링
 */
const RESTART_TRIGGER_KEY = "system:restart:trigger";

/**
 * 트리거 TTL (초) - 5분 후 자동 만료
 */
const RESTART_TRIGGER_TTL_SECONDS = 300;

/**
 * POST /api/v2/system/restart-all
 *
 * 모든 컨테이너 순차 재시작 트리거
 * - Redis에 신호 키 설정
 * - restarter 컨테이너가 감지 후 순차 재시작 실행
 */
router.post("/restart-all", async (req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const reason = req.body?.reason || "Manual trigger via API";

    // 이미 트리거가 설정되어 있는지 확인
    const existingTrigger = await repository.client.get(RESTART_TRIGGER_KEY);
    if (existingTrigger) {
      const triggerData = JSON.parse(existingTrigger);
      res.status(409).json({
        success: false,
        error: "Restart already triggered",
        message:
          "A restart is already pending. Please wait for it to complete.",
        data: {
          triggered_at: triggerData.triggered_at,
          reason: triggerData.reason,
          ttl_seconds: await repository.client.ttl(RESTART_TRIGGER_KEY),
        },
      });
      return;
    }

    // 트리거 데이터 생성
    const triggerData = {
      triggered_at: new Date().toISOString(),
      reason,
      triggered_by: "api",
    };

    // Redis에 트리거 설정
    await repository.client.set(
      RESTART_TRIGGER_KEY,
      JSON.stringify(triggerData),
      "EX",
      RESTART_TRIGGER_TTL_SECONDS,
    );

    logger.warn(
      { trigger: triggerData },
      "[SystemRouter] 시스템 전체 재시작 트리거 설정",
    );

    res.json({
      success: true,
      message:
        "System restart triggered. Restarter will execute within 30 seconds.",
      data: {
        trigger_key: RESTART_TRIGGER_KEY,
        trigger_ttl_seconds: RESTART_TRIGGER_TTL_SECONDS,
        expected_execution_within_seconds: 30,
        restart_order: [
          "redis",
          "product_scanner",
          "workers (browser → api)",
          "scheduler, alert_watcher",
        ],
        ...triggerData,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SystemRouter] 시스템 재시작 트리거 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to trigger system restart",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/v2/system/restart-all
 *
 * 재시작 트리거 취소
 */
router.delete("/restart-all", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();

    const deleted = await repository.client.del(RESTART_TRIGGER_KEY);

    if (deleted === 0) {
      res.status(404).json({
        success: false,
        error: "No pending restart",
        message: "There is no pending restart trigger to cancel.",
      });
      return;
    }

    logger.info("[SystemRouter] 시스템 재시작 트리거 취소됨");

    res.json({
      success: true,
      message: "Restart trigger cancelled successfully.",
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SystemRouter] 재시작 트리거 취소 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to cancel restart trigger",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v2/system/restart-status
 *
 * 재시작 트리거 상태 조회
 */
router.get("/restart-status", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();

    const trigger = await repository.client.get(RESTART_TRIGGER_KEY);
    const ttl = await repository.client.ttl(RESTART_TRIGGER_KEY);

    if (!trigger) {
      res.json({
        success: true,
        data: {
          pending: false,
          message: "No restart pending",
        },
      });
      return;
    }

    const triggerData = JSON.parse(trigger);

    res.json({
      success: true,
      data: {
        pending: true,
        triggered_at: triggerData.triggered_at,
        reason: triggerData.reason,
        triggered_by: triggerData.triggered_by,
        ttl_seconds: ttl,
        message: "Restart pending - restarter will execute soon",
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SystemRouter] 재시작 상태 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to get restart status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

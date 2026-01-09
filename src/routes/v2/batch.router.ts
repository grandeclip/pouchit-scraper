/**
 * Batch API Router
 *
 * 배치 처리 API
 * - POST /oliveyoung-sync - 올리브영 상품 동기화 배치 실행
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { OliveYoungBatchService } from "@/services/OliveYoungBatchService";
import { logger } from "@/config/logger";

/**
 * 올리브영 동기화 요청 스키마
 */
const OliveYoungSyncRequestSchema = z.object({
  limit: z.number().int().min(1).max(100000).optional(),
  offset: z.number().int().min(0).optional(),
  delayMs: z.number().int().min(0).max(60000).optional(),
});

const router = Router();

/**
 * POST /api/v2/batch/oliveyoung-sync
 *
 * 올리브영 상품 동기화 배치 실행
 *
 * Body:
 * {
 *   "limit": 10,      // 처리할 상품 수 (선택, 최대 1000)
 *   "offset": 0,      // 시작 위치 (선택)
 *   "delayMs": 2000   // 요청 간 지연 ms (선택, 기본 2000)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "totalProducts": 10,
 *     "processed": 10,
 *     "success": 8,
 *     "failed": 2,
 *     "results": [...],
 *     "durationMs": 25000
 *   }
 * }
 */
router.post("/oliveyoung-sync", async (req: Request, res: Response) => {
  try {
    // 입력 검증
    const parseResult = OliveYoungSyncRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: parseResult.error.errors.map((e) => e.message).join(", "),
      });
      return;
    }

    const { limit, offset, delayMs } = parseResult.data;

    logger.info(
      { limit, offset, delayMs },
      "[BatchRouter] 올리브영 동기화 배치 시작",
    );

    // 배치 서비스 실행
    const service = new OliveYoungBatchService();
    const result = await service.processAllProducts({
      limit,
      offset,
      delayMs,
    });

    logger.info(
      {
        totalProducts: result.totalProducts,
        success: result.success,
        failed: result.failed,
        durationMs: result.durationMs,
      },
      "[BatchRouter] 올리브영 동기화 배치 완료",
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[BatchRouter] 올리브영 동기화 배치 실패",
    );

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v2/batch/status
 *
 * 배치 상태 조회 (현재는 단순 상태만 반환)
 */
router.get("/status", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      available: true,
      message: "Batch service is ready",
    },
  });
});

export default router;

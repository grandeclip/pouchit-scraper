/**
 * Search API Router
 *
 * 상품 검색 비동기 처리 API
 * - POST / - 검색 Job 생성 (큐에 추가)
 * - GET /jobs/:jobId - Job 상태 조회
 * - GET /platforms - 지원 플랫폼 목록
 * - GET /queue - 큐 현황 조회
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { RedisSearchRepository } from "@/repositories/RedisSearchRepository";
import { SearchJobRequestSchema } from "@/core/domain/search/SearchJob";
import { SearchQueueService } from "@/services/SearchQueueService";
import { getSupportedSearchPlatforms } from "@/searchers";
import { logger } from "@/config/logger";

/**
 * 통합 검색 요청 스키마
 */
const UnifiedSearchRequestSchema = z.object({
  brand: z.string().min(1, "brand is required"),
  productName: z.string().default(""),
  maxPerPlatform: z.number().int().min(1).max(20).default(5),
});

const router = Router();

/**
 * POST /api/v2/search
 *
 * 검색 Job 생성 및 큐에 추가
 *
 * Body:
 * {
 *   "platform": "zigzag",
 *   "keyword": "수분크림",
 *   "limit": 10
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "job_id": "uuid",
 *     "status": "pending",
 *     "message": "Job queued successfully"
 *   }
 * }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    // 입력 검증
    const parseResult = SearchJobRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: parseResult.error.errors.map((e) => e.message).join(", "),
      });
      return;
    }

    const request = parseResult.data;

    // 지원 플랫폼 확인
    const supportedPlatforms = getSupportedSearchPlatforms();
    if (!supportedPlatforms.includes(request.platform)) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Unsupported platform: ${request.platform}. Supported: ${supportedPlatforms.join(", ")}`,
      });
      return;
    }

    // Job 생성 및 큐에 추가
    const repository = RedisSearchRepository.getInstance();
    const jobId = await repository.createAndEnqueueJob(request);

    logger.info(
      { job_id: jobId, platform: request.platform, keyword: request.keyword },
      "[SearchRouter] Search Job 생성",
    );

    res.status(202).json({
      success: true,
      data: {
        job_id: jobId,
        status: "pending",
        message: "Job queued successfully",
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SearchRouter] Search Job 생성 실패",
    );

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v2/search/jobs/:jobId
 *
 * 검색 Job 상태 조회
 *
 * Response (pending/running):
 * {
 *   "success": true,
 *   "data": {
 *     "job_id": "uuid",
 *     "platform": "zigzag",
 *     "keyword": "수분크림",
 *     "status": "pending",
 *     "result": null,
 *     "error": null
 *   }
 * }
 *
 * Response (completed):
 * {
 *   "success": true,
 *   "data": {
 *     "job_id": "uuid",
 *     "platform": "zigzag",
 *     "keyword": "수분크림",
 *     "status": "completed",
 *     "result": {
 *       "products": [...],
 *       "totalCount": 100
 *     },
 *     "error": null
 *   }
 * }
 */
router.get("/jobs/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const repository = RedisSearchRepository.getInstance();
    const job = await repository.getJob(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: "Not Found",
        message: `Job not found: ${jobId}`,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        job_id: job.job_id,
        platform: job.platform,
        keyword: job.keyword,
        limit: job.limit,
        status: job.status,
        result: job.result,
        error: job.error,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at,
      },
    });
  } catch (error) {
    logger.error(
      {
        job_id: req.params.jobId,
        error: error instanceof Error ? error.message : String(error),
      },
      "[SearchRouter] Job 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v2/search/platforms
 *
 * 지원 플랫폼 목록 조회
 */
router.get("/platforms", (_req: Request, res: Response) => {
  const platforms = getSupportedSearchPlatforms();

  res.json({
    success: true,
    data: {
      platforms,
      count: platforms.length,
    },
  });
});

/**
 * GET /api/v2/search/queue
 *
 * 검색 큐 현황 조회
 */
router.get("/queue", async (_req: Request, res: Response) => {
  try {
    const repository = RedisSearchRepository.getInstance();

    const queueLength = await repository.getQueueLength();
    const queuedJobs = await repository.getQueuedJobs(10);

    res.json({
      success: true,
      data: {
        queue_length: queueLength,
        recent_jobs: queuedJobs.map((job) => ({
          job_id: job.job_id,
          platform: job.platform,
          keyword: job.keyword,
          status: job.status,
          created_at: job.created_at,
        })),
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SearchRouter] Queue 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v2/search/unified
 *
 * 6개 플랫폼 통합 검색 (동기 - 결과 즉시 반환)
 *
 * Body:
 * {
 *   "brand": "라네즈",
 *   "productName": "워터뱅크 크림",
 *   "maxPerPlatform": 5
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "jobId": "uuid7",
 *     "keyword": "라네즈 워터뱅크 크림",
 *     "brand": "라네즈",
 *     "productName": "워터뱅크 크림",
 *     "maxPerPlatform": 5,
 *     "platforms": [...],
 *     "allProducts": [...],
 *     "summary": {...},
 *     "resultFilePath": "/app/results/..."
 *   }
 * }
 */
router.post("/unified", async (req: Request, res: Response) => {
  try {
    // 입력 검증
    const parseResult = UnifiedSearchRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: parseResult.error.errors.map((e) => e.message).join(", "),
      });
      return;
    }

    const request = parseResult.data;

    logger.info(
      {
        brand: request.brand,
        product_name: request.productName,
        max_per_platform: request.maxPerPlatform,
      },
      "[SearchRouter] 통합 검색 요청",
    );

    // 통합 검색 실행 (Queue를 통해 동시 1개만 처리)
    const queueService = SearchQueueService.getInstance();
    const result = await queueService.search({
      brand: request.brand,
      productName: request.productName,
      maxPerPlatform: request.maxPerPlatform,
    });

    logger.info(
      {
        job_id: result.jobId,
        total_products: result.summary.totalProducts,
        success_platforms: result.summary.successPlatforms,
        duration_ms: result.summary.durationMs,
      },
      "[SearchRouter] 통합 검색 완료",
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SearchRouter] 통합 검색 실패",
    );

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v2/search/unified/status
 *
 * 통합 검색 큐 상태 조회
 */
router.get("/unified/status", (_req: Request, res: Response) => {
  const queueService = SearchQueueService.getInstance();
  const status = queueService.getStatus();

  res.json({
    success: true,
    data: {
      is_processing: status.isProcessing,
      waiting_count: status.waitingCount,
    },
  });
});

export default router;

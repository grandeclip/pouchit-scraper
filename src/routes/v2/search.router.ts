/**
 * Search API Router
 *
 * 상품 검색 비동기 처리 API
 * - POST / - 검색 Job 생성 (큐에 추가)
 * - GET /jobs/:jobId - Job 상태 조회
 * - GET /platforms - 지원 플랫폼 목록
 * - GET /queue - 큐 현황 조회
 * - POST /filter-products - LLM 기반 상품 유효성 필터링
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";
import { RedisSearchRepository } from "@/repositories/RedisSearchRepository";
import { SearchJobRequestSchema } from "@/core/domain/search/SearchJob";
import { SearchQueueService } from "@/services/SearchQueueService";
import { getSupportedSearchPlatforms } from "@/searchers";
import { SearcherFactory } from "@/searchers/base/SearcherFactory";
import { logger } from "@/config/logger";
import {
  ProductFilteringService,
  ProductFilteringSchema,
  logLlmCost,
} from "@/llm";
import type { ProductFilteringResult } from "@/llm";
import {
  parseGeminiError,
  toClientError,
  sanitizeMessage,
} from "@/utils/GeminiErrorParser";

/**
 * 통합 검색 요청 스키마
 */
const UnifiedSearchRequestSchema = z.object({
  brand: z.string().min(1, "brand is required"),
  productName: z.string().default(""),
  maxPerPlatform: z.number().int().min(1).max(20).default(5),
});

/**
 * 올리브영 단독 검색 요청 스키마
 */
const OliveYoungSearchRequestSchema = z.object({
  brand: z.string().min(1, "brand is required"),
  productName: z.string().default(""),
  maxResults: z.number().int().min(1).max(50).default(10),
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

// ============================================
// OliveYoung 단독 검색 API
// ============================================

/**
 * POST /api/v2/search/oliveyoung
 *
 * 올리브영 단독 검색 (동기 - 결과 즉시 반환)
 *
 * Body:
 * {
 *   "brand": "라네즈",
 *   "productName": "워터뱅크 크림",
 *   "maxResults": 10
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "keyword": "라네즈 워터뱅크 크림",
 *     "totalCount": 100,
 *     "products": [{
 *       "productName": "...",
 *       "productUrl": "...",
 *       "thumbnail": "...",
 *       "originalPrice": 35000,
 *       "price": 28000
 *     }],
 *     "durationMs": 5234
 *   }
 * }
 */
router.post("/oliveyoung", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // 입력 검증
    const parseResult = OliveYoungSearchRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: "Bad Request",
        message: parseResult.error.errors.map((e) => e.message).join(", "),
      });
      return;
    }

    const { brand, productName, maxResults } = parseResult.data;
    const keyword = productName ? `${brand} ${productName}` : brand;

    logger.info(
      { brand, productName, keyword, maxResults },
      "[SearchRouter] 올리브영 단독 검색 요청",
    );

    // OliveYoung Searcher 생성 및 검색
    const searcher = SearcherFactory.createSearcher("oliveyoung");
    const result = await searcher.search({ keyword, limit: maxResults });

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        keyword,
        total_count: result.totalCount,
        products_count: result.products.length,
        duration_ms: durationMs,
      },
      "[SearchRouter] 올리브영 검색 완료",
    );

    res.json({
      success: true,
      data: {
        keyword,
        totalCount: result.totalCount,
        products: result.products.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          productUrl: p.productUrl,
          thumbnail: p.thumbnail,
          brand: p.brand,
          originalPrice: p.originalPrice,
          price: p.price,
          discountRate: p.discountRate,
        })),
        durationMs,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[SearchRouter] 올리브영 검색 실패",
    );

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================
// Filter Products API (LLM 기반 상품 필터링)
// ============================================

/**
 * 상품 필터링 요청 스키마
 */
const FilterProductsRequestSchema = z.object({
  brand: z.string().min(1, "brand is required"),
  product_name: z.string().min(1, "product_name is required"),
  product_names: z
    .record(z.string(), z.array(z.string()))
    .refine((obj) => Object.keys(obj).length > 0, {
      message: "product_names must have at least one platform",
    }),
});

/**
 * POST /api/v2/search/filter-products
 *
 * LLM 기반 상품 유효성 필터링
 *
 * 검색 결과에서 본품에 해당하는 상품만 필터링합니다.
 * 구성품, 증정품, 다른 상품이 주가 되는 세트는 제외됩니다.
 *
 * Body:
 * {
 *   "brand": "토리든",
 *   "product_name": "다이브인 저분자 히알루론산 세럼",
 *   "product_names": {
 *     "oliveyoung": ["상품1", "상품2"],
 *     "zigzag": ["상품A", "상품B"]
 *   }
 * }
 *
 * Response (성공):
 * {
 *   "success": true,
 *   "data": {
 *     "brand": "토리든",
 *     "product_name": "다이브인 저분자 히알루론산 세럼",
 *     "platforms": [
 *       { "platform": "oliveyoung", "valid_indices": [0, 1] }
 *     ],
 *     "usage": { "input_tokens": 1926, "output_tokens": 41, "cost_usd": 0.000313 },
 *     "durationMs": 1314
 *   }
 * }
 *
 * Response (에러):
 * {
 *   "success": false,
 *   "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "..." },
 *   "data": { "platforms": [] }
 * }
 */
router.post("/filter-products", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const jobId = uuidv7();

  try {
    // 입력 검증
    const parseResult = FilterProductsRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors.map((e) => e.message).join(", "),
        },
        data: { platforms: [] },
      });
      return;
    }

    const { brand, product_name, product_names } = parseResult.data;

    logger.info(
      {
        job_id: jobId,
        brand,
        product_name,
        platform_count: Object.keys(product_names).length,
      },
      "[SearchRouter] 상품 필터링 요청",
    );

    // LLM 호출 (재시도 로직 포함)
    const service = new ProductFilteringService();
    let response: Awaited<ReturnType<typeof service.filter>>;
    let retryCount = 0;
    const maxRetries = 1;

    while (true) {
      try {
        response = await service.filter({
          brand,
          product_name,
          product_names,
        });
        break;
      } catch (error) {
        const errorInfo = parseGeminiError(error);

        if (errorInfo.retryable && retryCount < maxRetries) {
          retryCount++;
          logger.warn(
            {
              job_id: jobId,
              error_code: errorInfo.code,
              retry_count: retryCount,
            },
            "[SearchRouter] Gemini API 재시도",
          );
          // 1초 대기 후 재시도
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // 재시도 불가 또는 재시도 초과
        logger.error(
          {
            job_id: jobId,
            error_code: errorInfo.code,
            error_detail: errorInfo.originalMessage,
          },
          "[SearchRouter] 상품 필터링 실패",
        );

        res.status(500).json({
          success: false,
          error: toClientError(errorInfo),
          data: { platforms: [] },
        });
        return;
      }
    }

    const durationMs = Date.now() - startTime;

    // 비용 로깅
    logLlmCost({
      job_id: jobId,
      platform: "search",
      product_set_id: "",
      operation: "product_filtering",
      model: response.model,
      input_tokens: response.usage.promptTokenCount,
      output_tokens: response.usage.candidatesTokenCount,
    });

    logger.info(
      {
        job_id: jobId,
        platforms: response.result.platforms.map((p) => ({
          platform: p.platform,
          valid_count: p.valid_indices.length,
        })),
        tokens: response.usage.totalTokenCount,
        duration_ms: durationMs,
      },
      "[SearchRouter] 상품 필터링 완료",
    );

    res.json({
      success: true,
      data: {
        brand,
        product_name,
        platforms: response.result.platforms,
        usage: {
          input_tokens: response.usage.promptTokenCount,
          output_tokens: response.usage.candidatesTokenCount,
          total_tokens: response.usage.totalTokenCount,
          cost_usd: calculateCostUsd(
            response.usage.promptTokenCount,
            response.usage.candidatesTokenCount,
          ),
        },
        durationMs,
      },
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const safeMessage = sanitizeMessage(rawMessage);

    logger.error(
      {
        job_id: jobId,
        error_detail: safeMessage,
      },
      "[SearchRouter] 상품 필터링 예외 발생",
    );

    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "서버 내부 오류가 발생했습니다",
      },
      data: { platforms: [] },
    });
  }
});

/**
 * 비용 계산 (USD)
 */
function calculateCostUsd(inputTokens: number, outputTokens: number): number {
  // Gemini 2.5 Flash 가격 (2024-12 기준)
  const inputPer1M = 0.15;
  const outputPer1M = 0.6;
  return (
    (inputTokens / 1_000_000) * inputPer1M +
    (outputTokens / 1_000_000) * outputPer1M
  );
}

export default router;

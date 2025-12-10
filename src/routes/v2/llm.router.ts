/**
 * LLM API Router
 *
 * LLM 기반 서비스 API
 * - POST /generate-description - 상품 설명 및 카테고리 생성
 * - GET /cost-stats - 오늘 LLM 비용 통계
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";
import { logger } from "@/config/logger";
import {
  getProductDescriptionService,
  type ProductDescriptionResponse,
} from "@/llm/ProductDescriptionService";
import { logLlmCost, getTodayCostStats } from "@/llm/LlmCostLogger";
import {
  parseGeminiError,
  toClientError,
  sanitizeMessage,
} from "@/utils/GeminiErrorParser";

// ============================================
// 상수 정의
// ============================================

/** 재시도 설정 */
const RETRY_CONFIG = {
  maxRetries: 1,
  delayMs: 1000,
} as const;

// ============================================
// 스키마 정의
// ============================================

/**
 * 상품 설명 생성 요청 스키마
 */
const GenerateDescriptionRequestSchema = z.object({
  brand: z.string().min(1, "brand is required"),
  product_name: z.string().min(1, "product_name is required"),
  urls: z
    .array(z.string().url("Invalid URL format"))
    .min(1, "At least one URL is required")
    .max(20, "Maximum 20 URLs allowed"),
});

// ============================================
// 라우터 정의
// ============================================

const router = Router();

/**
 * POST /api/v2/llm/generate-description
 *
 * 상품 설명 및 카테고리 생성
 *
 * URL Context를 활용하여 상품 페이지를 분석하고
 * 마케팅용 상품 설명과 카테고리를 생성합니다.
 *
 * Body:
 * {
 *   "brand": "토리든",
 *   "product_name": "다이브인 저분자 히알루론산 세럼",
 *   "urls": [
 *     "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000238213",
 *     "https://zigzag.kr/catalog/products/131281148"
 *   ]
 * }
 *
 * Response (성공):
 * {
 *   "success": true,
 *   "data": {
 *     "description": "피부 깊숙이 수분을 채워주는...",
 *     "category": { "id": 5, "path": "스킨케어 > 에센스/세럼/앰플" },
 *     "usage": {
 *       "stage1": { "input": 180, "output": 463, "url_context": 12587 },
 *       "stage2": { "input": 2148, "output": 77 },
 *       "total": { "input": 14915, "output": 540, "cost_usd": 0.002561 }
 *     },
 *     "model": "gemini-2.5-flash",
 *     "duration_ms": 6788
 *   }
 * }
 */
router.post("/generate-description", async (req: Request, res: Response) => {
  const jobId = uuidv7();

  try {
    // 입력 검증
    const parseResult = GenerateDescriptionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors.map((e) => e.message).join(", "),
        },
      });
      return;
    }

    const { brand, product_name, urls } = parseResult.data;

    logger.info(
      {
        job_id: jobId,
        brand,
        product_name,
        url_count: urls.length,
      },
      "[LlmRouter] 상품 설명 생성 요청",
    );

    // LLM 호출 (재시도 로직 포함)
    const service = getProductDescriptionService();
    let response: ProductDescriptionResponse;
    let retryCount = 0;

    while (true) {
      try {
        response = await service.generate({
          brand,
          product_name,
          urls,
        });
        break;
      } catch (error) {
        const errorInfo = parseGeminiError(error);

        if (errorInfo.retryable && retryCount < RETRY_CONFIG.maxRetries) {
          retryCount++;
          logger.warn(
            {
              job_id: jobId,
              error_code: errorInfo.code,
              retry_count: retryCount,
            },
            "[LlmRouter] Gemini API 재시도",
          );
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_CONFIG.delayMs),
          );
          continue;
        }

        logger.error(
          {
            job_id: jobId,
            error_code: errorInfo.code,
            error_detail: errorInfo.originalMessage,
          },
          "[LlmRouter] 상품 설명 생성 실패",
        );

        res.status(500).json({
          success: false,
          error: toClientError(errorInfo),
        });
        return;
      }
    }

    // 비용 로깅 - 1단계 (URL Context 추출)
    logLlmCost({
      job_id: jobId,
      platform: "description",
      product_set_id: "",
      operation: "product_description_extract",
      model: response.model,
      input_tokens:
        response.stage1Usage.promptTokenCount +
        response.stage1Usage.toolUsePromptTokenCount,
      output_tokens: response.stage1Usage.candidatesTokenCount,
    });

    // 비용 로깅 - 2단계 (Structured Output)
    logLlmCost({
      job_id: jobId,
      platform: "description",
      product_set_id: "",
      operation: "product_description_structured",
      model: response.model,
      input_tokens: response.stage2Usage.promptTokenCount,
      output_tokens: response.stage2Usage.candidatesTokenCount,
    });

    logger.info(
      {
        job_id: jobId,
        category_id: response.result.category.id,
        total_tokens: response.totalUsage.totalTokens,
        cost_usd: response.totalUsage.costUsd,
        duration_ms: response.durationMs,
      },
      "[LlmRouter] 상품 설명 생성 완료",
    );

    res.json({
      success: true,
      data: {
        description: response.result.description,
        category: response.result.category,
        usage: {
          stage1: {
            input: response.stage1Usage.promptTokenCount,
            output: response.stage1Usage.candidatesTokenCount,
            url_context: response.stage1Usage.toolUsePromptTokenCount,
          },
          stage2: {
            input: response.stage2Usage.promptTokenCount,
            output: response.stage2Usage.candidatesTokenCount,
          },
          total: {
            input: response.totalUsage.inputTokens,
            output: response.totalUsage.outputTokens,
            url_context: response.totalUsage.urlContextTokens,
            total: response.totalUsage.totalTokens,
            cost_usd: response.totalUsage.costUsd,
          },
        },
        url_selection: {
          original_count: response.urlSelection.originalCount,
          selected_count: response.urlSelection.selectedCount,
          by_platform: response.urlSelection.selectionByPlatform,
        },
        model: response.model,
        duration_ms: response.durationMs,
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
      "[LlmRouter] 상품 설명 생성 예외 발생",
    );

    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "서버 내부 오류가 발생했습니다",
      },
    });
  }
});

/**
 * GET /api/v2/llm/cost-stats
 *
 * 오늘 LLM 비용 통계 조회
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "total_cost_usd": 0.123,
 *     "total_records": 45,
 *     "total_input_tokens": 12345,
 *     "total_output_tokens": 6789,
 *     "by_operation": { ... },
 *     "by_platform": { ... }
 *   }
 * }
 */
router.get("/cost-stats", (_req: Request, res: Response) => {
  try {
    const stats = getTodayCostStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[LlmRouter] 비용 통계 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "비용 통계 조회에 실패했습니다",
      },
    });
  }
});

export default router;

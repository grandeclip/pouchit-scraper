/**
 * Products API v2 라우터
 *
 * 상품 추출 엔드포인트
 * - POST /api/v2/products/extract-by-product-set
 * - POST /api/v2/products/extract-by-url (후순위)
 * - POST /api/v2/products/extract-by-id (후순위)
 */

import { Router, Request, Response } from "express";
import { ExtractByProductSetService } from "@/services/extract/ExtractByProductSetService";
import { ExtractByUrlService } from "@/services/extract/ExtractByUrlService";
import { createRequestLogger } from "@/utils/LoggerContext";

const router = Router();

/**
 * POST /api/v2/products/extract-by-product-set
 *
 * product_set_id 기반 상품 추출
 *
 * Request Body:
 * {
 *   "productSetId": "uuid-string"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "product": { ... },
 *   "durationMs": 1234
 * }
 */
router.post("/extract-by-product-set", async (req: Request, res: Response) => {
  const requestLogger = createRequestLogger(
    req.headers["x-request-id"] as string,
    req.method,
    req.path,
  );

  try {
    const { productSetId } = req.body;

    // 필수 파라미터 검증
    if (!productSetId) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "productSetId is required",
        },
      });
      return;
    }

    // UUID 형식 간단 검증
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(productSetId)) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "productSetId must be a valid UUID",
        },
      });
      return;
    }

    requestLogger.info({ productSetId }, "extract-by-product-set 요청");

    // 서비스 호출
    const service = new ExtractByProductSetService();
    const result = await service.extract({
      mode: "by-product-set",
      productSetId,
    });

    // 응답
    if (result.success) {
      res.status(200).json(result);
    } else {
      // 에러 코드에 따른 HTTP 상태 코드
      const statusCode = getStatusCodeFromErrorCode(result.error?.code);
      res.status(statusCode).json(result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    requestLogger.error({ error: message }, "extract-by-product-set 실패");

    res.status(500).json({
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message,
      },
    });
  }
});

/**
 * POST /api/v2/products/extract-by-url
 *
 * URL 기반 상품 추출
 *
 * Request Body:
 * {
 *   "url": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "product": { ... },
 *   "durationMs": 1234
 * }
 *
 * 특징:
 * - Supabase 조회 없음 (db: null, comparison: null)
 * - URL에서 플랫폼 자동 감지
 */
router.post("/extract-by-url", async (req: Request, res: Response) => {
  const requestLogger = createRequestLogger(
    req.headers["x-request-id"] as string,
    req.method,
    req.path,
  );

  try {
    const { url } = req.body;

    // 필수 파라미터 검증
    if (!url) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "url is required",
        },
      });
      return;
    }

    // URL 형식 간단 검증
    try {
      new URL(url);
    } catch {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "url must be a valid URL",
        },
      });
      return;
    }

    requestLogger.info({ url }, "extract-by-url 요청");

    // 서비스 호출
    const service = new ExtractByUrlService();
    const result = await service.extract({
      mode: "by-url",
      url,
    });

    // 응답
    if (result.success) {
      res.status(200).json(result);
    } else {
      const statusCode = getStatusCodeFromErrorCode(result.error?.code);
      res.status(statusCode).json(result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    requestLogger.error({ error: message }, "extract-by-url 실패");

    res.status(500).json({
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message,
      },
    });
  }
});

/**
 * POST /api/v2/products/extract-by-id
 *
 * (platform, productId) 기반 상품 추출 (후순위)
 */
router.post("/extract-by-id", async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: "extract-by-id is not implemented yet",
    },
  });
});

/**
 * 에러 코드에 따른 HTTP 상태 코드 반환
 */
function getStatusCodeFromErrorCode(errorCode?: string): number {
  switch (errorCode) {
    case "PRODUCT_SET_NOT_FOUND":
    case "PRODUCT_NOT_FOUND":
      return 404;
    case "LINK_URL_MISSING":
    case "PLATFORM_NOT_DETECTED":
    case "PLATFORM_NOT_SUPPORTED":
      return 400;
    case "EXTRACTION_FAILED":
    case "SCANNER_ERROR":
      return 500;
    default:
      return 500;
  }
}

export default router;

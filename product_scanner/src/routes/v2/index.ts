/**
 * API v2 메인 라우터
 *
 * v2 API 특징:
 * - 상품 추출 전용 엔드포인트
 * - 3가지 추출 모드 지원 (product-set, url, id)
 */

import { Router } from "express";
import productsRouter from "./products.router";
import workflowsRouter from "./workflows.router";
import { logger } from "@/config/logger";

const router = Router();

// Products API (추출 엔드포인트)
router.use("/products", productsRouter);

// Workflows API (워크플로우 실행/조회)
router.use("/workflows", workflowsRouter);

logger.info(
  {
    endpoints: [
      "POST /api/v2/products/extract-by-product-set",
      "POST /api/v2/products/extract-by-url",
      "POST /api/v2/products/extract-by-id (not implemented)",
      "POST /api/v2/workflows/execute",
      "GET /api/v2/workflows/jobs/:jobId",
      "GET /api/v2/workflows",
      "GET /api/v2/workflows/health",
    ],
  },
  "[v2Router] API v2 라우터 등록",
);

export default router;

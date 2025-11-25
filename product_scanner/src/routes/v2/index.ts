/**
 * API v2 메인 라우터
 *
 * v2 API 특징:
 * - 상품 추출 전용 엔드포인트
 * - 3가지 추출 모드 지원 (product-set, url, id)
 */

import { Router } from "express";
import productsRouter from "./products.router";
import { logger } from "@/config/logger";

const router = Router();

// Products API (추출 엔드포인트)
router.use("/products", productsRouter);

logger.info(
  {
    endpoints: [
      "POST /api/v2/products/extract-by-product-set",
      "POST /api/v2/products/extract-by-url (not implemented)",
      "POST /api/v2/products/extract-by-id (not implemented)",
    ],
  },
  "[v2Router] API v2 라우터 등록"
);

export default router;


/**
 * 상품 검색 라우터
 * GET /api/v1/products/* - Supabase 상품 검색/조회
 */

import { Router, Request, Response } from "express";
import { ProductSearchController } from "@/controllers/ProductSearchController";
import {
  validateProductSearchQuery,
  validateProductSetIdParam,
} from "@/middleware/validation";

const router = Router();
const productSearchController = new ProductSearchController();

/**
 * GET /api/v1/products/search
 * 상품 검색 (Supabase)
 */
router.get(
  "/search",
  validateProductSearchQuery,
  (req: Request, res: Response) => productSearchController.search(req, res),
);

/**
 * GET /api/v1/products/health
 * Supabase 연결 상태 확인
 */
router.get("/health", (req: Request, res: Response) =>
  productSearchController.health(req, res),
);

/**
 * GET /api/v1/products/:productSetId
 * 상품 조회 by UUID
 */
router.get(
  "/:productSetId",
  validateProductSetIdParam,
  (req: Request, res: Response) => productSearchController.getById(req, res),
);

export default router;

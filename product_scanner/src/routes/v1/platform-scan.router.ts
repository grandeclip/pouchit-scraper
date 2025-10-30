/**
 * 플랫폼별 스캔 라우터
 * 동적 플랫폼 라우팅: /api/v1/platforms/:platform/scan/*
 *
 * SOLID 원칙:
 * - OCP: 새 플랫폼 YAML 추가만으로 자동 라우팅
 */

import { Router, Request, Response } from "express";
import { ScanController } from "@/controllers/ScanController";
import {
  validateScanRequest,
  validateGoodsIdParam,
} from "@/middleware/validation";

/**
 * 플랫폼별 스캔 라우터 생성
 */
export function createPlatformScanRouter(platform: string): Router {
  const router = Router();
  const scanController = new ScanController(platform);

  /**
   * POST /api/v1/platforms/:platform/scan/validate
   * 상품 검증 (CSV vs API)
   */
  router.post("/validate", validateScanRequest, (req: Request, res: Response) =>
    scanController.validate(req, res),
  );

  /**
   * POST /api/v1/platforms/:platform/scan/:goodsId
   * 상품 스캔 (검증 없이)
   */
  router.post(
    "/:goodsId",
    validateGoodsIdParam,
    (req: Request, res: Response) => scanController.scan(req, res),
  );

  /**
   * GET /api/v1/platforms/:platform/scan/strategies
   * 사용 가능한 전략 목록
   */
  router.get("/strategies", (req: Request, res: Response) =>
    scanController.getStrategies(req, res),
  );

  return router;
}

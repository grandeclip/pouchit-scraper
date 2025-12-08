/**
 * 스캔 컨트롤러
 * HTTP 요청 처리
 *
 * SOLID 원칙:
 * - SRP: HTTP 요청/응답 변환만 담당
 * - DIP: Service 인터페이스에 의존
 * - OCP: 플랫폼 파라미터로 확장 가능
 */

import { Request, Response } from "express";
import { HwahaeScanService } from "@/services/HwahaeScanService";
import { ValidationRequest } from "@/core/domain/HwahaeConfig";
import { createRequestLogger } from "@/utils/LoggerContext";

/**
 * 스캔 컨트롤러 (플랫폼별)
 */
export class ScanController {
  private service: HwahaeScanService;
  private platform: string;

  constructor(platform: string = "hwahae") {
    this.platform = platform;
    this.service = new HwahaeScanService(platform);
  }

  /**
   * POST /api/scan/validate
   * 상품 검증 (CSV vs API)
   */
  async validate(req: Request, res: Response): Promise<void> {
    try {
      const { goodsId, csvData, strategyId } = req.body;

      // 입력 검증
      if (!goodsId) {
        res.status(400).json({
          error: "goodsId is required",
        });
        return;
      }

      if (!csvData) {
        res.status(400).json({
          error: "csvData is required",
        });
        return;
      }

      // ValidationRequest 구성
      const validationRequest: ValidationRequest = {
        goodsId: csvData.goodsId || goodsId,
        productName: csvData.productName,
        thumbnail: csvData.thumbnail,
        originalPrice: Number(csvData.originalPrice),
        discountedPrice: Number(csvData.discountedPrice),
        saleStatus: csvData.saleStatus,
      };

      // 검증 실행
      const result = await this.service.validateProduct(
        goodsId,
        validationRequest,
        strategyId,
      );

      // 응답
      res.status(200).json(result);
    } catch (error) {
      const logger = createRequestLogger(
        req.headers["x-request-id"] as string,
        req.method,
        req.path,
      );
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Controller] 검증 요청 처리 실패",
      );
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * POST /api/scan/:goodsId
   * 상품 스캔 (검증 없이)
   */
  async scan(req: Request, res: Response): Promise<void> {
    try {
      const { goodsId } = req.params;
      const { strategyId } = req.query;

      // 입력 검증
      if (!goodsId) {
        res.status(400).json({
          error: "goodsId is required",
        });
        return;
      }

      // 스캔 실행
      const product = await this.service.scanProduct(
        goodsId,
        strategyId as string | undefined,
      );

      // 응답
      res.status(200).json(product);
    } catch (error) {
      const logger = createRequestLogger(
        req.headers["x-request-id"] as string,
        req.method,
        req.path,
      );

      // 404 처리
      if (error instanceof Error && error.message.includes("not found")) {
        logger.error(
          { error: error.message },
          "[Controller] 상품 스캔 실패 - 상품 없음",
        );
        res.status(404).json({
          error: "Product not found",
        });
        return;
      }

      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Controller] 상품 스캔 실패",
      );
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /api/scan/strategies
   * 사용 가능한 전략 목록
   */
  async getStrategies(req: Request, res: Response): Promise<void> {
    try {
      const strategies = this.service.getAvailableStrategies();

      res.status(200).json({
        strategies,
      });
    } catch (error) {
      const logger = createRequestLogger(
        req.headers["x-request-id"] as string,
        req.method,
        req.path,
      );
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Controller] 전략 목록 조회 실패",
      );
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    await this.service.cleanup();
  }
}

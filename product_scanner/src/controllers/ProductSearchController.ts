/**
 * Product Search 컨트롤러
 * HTTP 요청 처리
 *
 * SOLID 원칙:
 * - SRP: HTTP 요청/응답 변환만 담당
 * - DIP: Service 인터페이스에 의존
 */

import { Request, Response } from "express";
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import { ProductSearchService } from "@/services/ProductSearchService";
import { ProductSetSearchRequest } from "@/core/domain/ProductSet";
import { API_CONFIG } from "@/config/constants";
import { createRequestLogger } from "@/utils/logger-context";

/**
 * Product Search 컨트롤러
 */
export class ProductSearchController {
  private service: IProductSearchService;

  constructor(service?: IProductSearchService) {
    // Dependency Injection (테스트 가능하도록)
    this.service = service || new ProductSearchService();
  }

  /**
   * GET /api/products/search
   * 상품 검색 (쿼리 파라미터)
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const { link_url, sale_status, limit } = req.query;

      // 검색 요청 구성
      const searchRequest: ProductSetSearchRequest = {
        link_url_pattern: link_url ? String(link_url) : undefined,
        sale_status: sale_status ? String(sale_status) : undefined,
        limit: limit ? Number(limit) : API_CONFIG.DEFAULT_SEARCH_LIMIT,
      };

      // 검색 실행
      const results = await this.service.searchProducts(searchRequest);

      // 응답
      res.status(200).json({
        success: true,
        count: results.length,
        data: results,
      });
    } catch (error) {
      const logger = createRequestLogger(
        req.headers["x-request-id"] as string,
        req.method,
        req.path,
      );
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Controller] 상품 검색 실패",
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /api/products/:productSetId
   * 상품 ID로 조회 (UUID)
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { productSetId } = req.params;

      // 조회 실행 (검증은 Middleware에서 완료)
      const result = await this.service.getProductById(productSetId);

      if (!result) {
        res.status(404).json({
          success: false,
          error: "Product not found",
        });
        return;
      }

      // 응답
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const logger = createRequestLogger(
        req.headers["x-request-id"] as string,
        req.method,
        req.path,
      );
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Controller] 상품 ID 조회 실패",
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /api/products/health
   * Supabase 연결 상태 확인
   */
  async health(req: Request, res: Response): Promise<void> {
    try {
      const isHealthy = await this.service.healthCheck();

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        message: isHealthy
          ? "Supabase connection OK"
          : "Supabase connection failed",
      });
    } catch (error) {
      const logger = createRequestLogger(
        req.headers["x-request-id"] as string,
        req.method,
        req.path,
      );
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Controller] Health check 실패",
      );
      res.status(503).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
}

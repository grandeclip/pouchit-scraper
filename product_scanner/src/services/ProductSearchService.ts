/**
 * Product Search 서비스
 * Facade Pattern
 *
 * 역할:
 * - Repository 캡슐화
 * - 비즈니스 로직 조율
 * - 에러 처리 및 로깅
 *
 * SOLID 원칙:
 * - SRP: 상품 검색 비즈니스 로직 조율만 담당
 * - DIP: IProductRepository 인터페이스에 의존
 * - OCP: 새로운 검색 기능 추가 시 확장 가능
 */

import { IProductRepository } from "@/core/interfaces/IProductRepository";
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import {
  ProductSetSearchRequest,
  ProductSetSearchResult,
} from "@/core/domain/ProductSet";
import { SupabaseProductRepository } from "@/repositories/SupabaseProductRepository";
import { logger } from "@/config/logger";

/**
 * Product Search 서비스 (Facade)
 */
export class ProductSearchService implements IProductSearchService {
  private repository: IProductRepository;

  constructor(repository?: IProductRepository) {
    // Dependency Injection (테스트 가능하도록)
    this.repository = repository || new SupabaseProductRepository();
  }

  /**
   * 상품 검색
   * @param request 검색 조건
   * @returns 검색 결과 목록
   */
  async searchProducts(
    request: ProductSetSearchRequest,
  ): Promise<ProductSetSearchResult[]> {
    logger.info({ request }, "상품 검색 시작");

    try {
      // Repository를 통한 검색
      const entities = await this.repository.search(request);

      // 도메인 엔티티를 검색 결과로 변환
      const results = entities.map((entity) => entity.toSearchResult());

      logger.info({ count: results.length }, "상품 검색 완료");

      return results;
    } catch (error) {
      logger.error({ error, request }, "상품 검색 실패");
      throw error;
    }
  }

  /**
   * 상품 ID로 조회
   * @param productSetId 상품 세트 ID (UUID)
   * @returns 상품 정보
   */
  async getProductById(
    productSetId: string,
  ): Promise<ProductSetSearchResult | null> {
    logger.info({ productSetId }, "상품 조회 시작");

    try {
      const entity = await this.repository.findById(productSetId);

      if (!entity) {
        logger.info({ productSetId }, "상품을 찾을 수 없음");
        return null;
      }

      const result = entity.toSearchResult();

      logger.info(
        { productSetId, productName: result.product_name },
        "상품 조회 완료",
      );

      return result;
    } catch (error) {
      logger.error({ error, productSetId }, "상품 조회 실패");
      throw error;
    }
  }

  /**
   * product_id로 상품 목록 조회 (Multi-Platform용)
   * @param productId Supabase product_id (UUID)
   * @param saleStatus 판매 상태 필터 (optional: "on_sale" | "off_sale" | undefined=전체)
   * @returns 해당 product_id를 가진 상품 목록
   */
  async searchByProductId(
    productId: string,
    saleStatus?: string,
  ): Promise<ProductSetSearchResult[]> {
    logger.info({ productId, saleStatus }, "product_id 기반 상품 검색 시작");

    try {
      // product_id로 검색 (limit 100으로 충분히)
      const request: ProductSetSearchRequest = {
        product_id: productId,
        limit: 100,
      };

      // saleStatus가 있으면 필터 추가 (all인 경우 undefined로 전체 검색)
      if (saleStatus && saleStatus !== "all") {
        request.sale_status = saleStatus;
      }

      const results = await this.searchProducts(request);

      logger.info(
        { productId, saleStatus, count: results.length },
        "product_id 기반 상품 검색 완료",
      );

      return results;
    } catch (error) {
      logger.error(
        { error, productId, saleStatus },
        "product_id 기반 상품 검색 실패",
      );
      throw error;
    }
  }

  /**
   * Supabase 연결 상태 확인
   * @returns 연결 여부
   */
  async healthCheck(): Promise<boolean> {
    logger.info("Health check 시작");

    try {
      const isHealthy = await this.repository.healthCheck();

      logger.info({ isHealthy }, `Health check ${isHealthy ? "성공" : "실패"}`);

      return isHealthy;
    } catch (error) {
      logger.error({ error }, "Health check 실패");
      return false;
    }
  }
}

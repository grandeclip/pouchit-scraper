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
    console.log(`[Service] 상품 검색 시작:`, request);

    try {
      // Repository를 통한 검색
      const entities = await this.repository.search(request);

      // 도메인 엔티티를 검색 결과로 변환
      const results = entities.map((entity) => entity.toSearchResult());

      console.log(`[Service] 상품 검색 완료: ${results.length}개 상품 발견`);

      return results;
    } catch (error) {
      console.error(`[Service] 상품 검색 실패:`, error);
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
    console.log(`[Service] 상품 조회 시작: product_set_id=${productSetId}`);

    try {
      const entity = await this.repository.findById(productSetId);

      if (!entity) {
        console.log(
          `[Service] 상품을 찾을 수 없음: product_set_id=${productSetId}`,
        );
        return null;
      }

      const result = entity.toSearchResult();

      console.log(`[Service] 상품 조회 완료: ${result.product_name}`);

      return result;
    } catch (error) {
      console.error(`[Service] 상품 조회 실패:`, error);
      throw error;
    }
  }

  /**
   * Supabase 연결 상태 확인
   * @returns 연결 여부
   */
  async healthCheck(): Promise<boolean> {
    console.log(`[Service] Health check 시작`);

    try {
      const isHealthy = await this.repository.healthCheck();

      console.log(`[Service] Health check ${isHealthy ? "성공" : "실패"}`);

      return isHealthy;
    } catch (error) {
      console.error(`[Service] Health check 실패:`, error);
      return false;
    }
  }
}

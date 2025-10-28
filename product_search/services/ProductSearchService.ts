/**
 * 상품 검색 서비스
 * Facade Pattern
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색
 * 
 * 역할:
 * - 비즈니스 로직 계층
 * - 요청 검증
 * - 상품 검색기 선택 및 실행
 * - 결과 변환 및 포맷팅
 * - 에러 처리
 * 
 * SOLID 원칙:
 * - SRP: 상품 검색 비즈니스 로직만 담당
 * - Facade: 복잡한 하위 시스템을 단순한 인터페이스로 제공
 */

import { ShoppingMall } from '../core/domain/Product';
import { ProductSearchRequest, ProductSearchResult } from '../core/domain/ProductSearchConfig';
import { ProductSearchRegistry } from './ProductSearchRegistry';
import { IProductSearcher } from '../core/interfaces/IProductSearcher';

/**
 * 상품 검색 서비스
 */
export class ProductSearchService {
  private registry: ProductSearchRegistry;

  constructor() {
    this.registry = ProductSearchRegistry.getInstance();
  }

  /**
   * 상품 검색 실행
   * @param mall 쇼핑몰 이름
   * @param request 상품 검색 요청
   * @returns 상품 검색 결과
   * 
   * 동시성 안전성:
   * - 요청마다 새로운 검색기 인스턴스 생성
   * - 각 인스턴스는 독립적인 Browser/Context/Page 사용
   * - finally 블록에서 반드시 리소스 정리
   */
  async search(mall: ShoppingMall, request: ProductSearchRequest): Promise<ProductSearchResult> {
    const startTime = Date.now();
    let searcher: IProductSearcher | null = null;

    try {
      // 요청 검증
      this.validateRequest(request);

      // 쇼핑몰 사용 가능 여부 확인
      if (!this.registry.isAvailable(mall)) {
        throw new Error(`지원하지 않는 쇼핑몰: ${mall}`);
      }

      // 상품 검색기 생성 (캐시 사용하지 않음 - 동시성 안전성)
      searcher = this.registry.createFreshSearcher(mall);

      // 상품 검색 실행
      const products = await searcher.search(request);

      // 결과 포맷팅
      const formattedProducts = products.map((product) => product.toPlainObject());

      const duration = Date.now() - startTime;
      const productCount = formattedProducts.length;

      // 결과 메시지 생성
      let message: string;
      if (productCount === 0) {
        message = `"${request.brand} ${request.productName}" 검색 결과가 없습니다`;
      } else if (productCount === 1) {
        message = `1개의 상품을 찾았습니다`;
      } else {
        message = `${productCount}개의 상품을 찾았습니다`;
      }

      return {
        success: true,
        products: formattedProducts,
        message,
        mall,
        userAgent: (searcher as any).selectedUserAgent ? {
          id: (searcher as any).selectedUserAgent.id,
          value: (searcher as any).selectedUserAgent.value,
          description: (searcher as any).selectedUserAgent.description,
          platform: (searcher as any).selectedUserAgent.platform,
          browser: (searcher as any).selectedUserAgent.browser,
        } : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[ProductSearchService] 상품 검색 실패 (${mall}, ${duration}ms):`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        products: [],
        message: `상품 검색 중 오류가 발생했습니다`,
        error: errorMessage,
        mall,
      };
    } finally {
      // 반드시 리소스 정리 (메모리 누수 방지)
      if (searcher) {
        try {
          await searcher.cleanup();
        } catch (cleanupError) {
          console.warn(`[ProductSearchService] 리소스 정리 실패 (${mall}):`, cleanupError);
        }
      }
    }
  }

  /**
   * 사용 가능한 쇼핑몰 목록
   */
  getAvailableMalls(): ShoppingMall[] {
    return this.registry.getAvailableMalls();
  }

  /**
   * 쇼핑몰 사용 가능 여부
   */
  isAvailable(mall: ShoppingMall): boolean {
    return this.registry.isAvailable(mall);
  }

  /**
   * 요청 검증
   */
  private validateRequest(request: ProductSearchRequest): void {
    if (!request.brand || request.brand.trim().length === 0) {
      throw new Error('brand는 필수입니다');
    }

    if (!request.productName || request.productName.trim().length === 0) {
      throw new Error('productName은 필수입니다');
    }
  }

  /**
   * 모든 상품 검색기 정리
   */
  async cleanup(): Promise<void> {
    await this.registry.cleanupAll();
  }
}


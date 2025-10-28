/**
 * 상품 검색 레지스트리
 * Registry Pattern + Singleton
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색을 위한 검색기 관리
 * 
 * 역할:
 * - 상품 검색기 인스턴스 관리
 * - Lazy Loading 및 캐싱
 * - 등록된 쇼핑몰 목록 제공
 * 
 * SOLID 원칙:
 * - SRP: 상품 검색기 관리만 담당
 * - Singleton: 전역 레지스트리
 */

import { IProductSearcher } from '../core/interfaces/IProductSearcher';
import { ShoppingMall } from '../core/domain/Product';
import { ProductSearcherFactory } from '../searchers/base/ProductSearcherFactory';
import { ConfigLoader } from '../config/ConfigLoader';

/**
 * 상품 검색 레지스트리 (Singleton)
 */
export class ProductSearchRegistry {
  private static instance: ProductSearchRegistry;
  private searchers: Map<ShoppingMall, IProductSearcher> = new Map();
  private configLoader: ConfigLoader;

  private constructor() {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * Singleton 인스턴스
   */
  static getInstance(): ProductSearchRegistry {
    if (!ProductSearchRegistry.instance) {
      ProductSearchRegistry.instance = new ProductSearchRegistry();
    }
    return ProductSearchRegistry.instance;
  }

  /**
   * 새로운 상품 검색기 인스턴스 생성 (캐시 사용하지 않음)
   * 
   * 동시성 안전성을 위해 매 요청마다 새 인스턴스를 생성합니다.
   * 각 인스턴스는 독립적인 Browser/Context/Page를 가집니다.
   * 
   * @param mall 쇼핑몰 이름
   * @returns 새로운 상품 검색기 인스턴스
   */
  createFreshSearcher(mall: ShoppingMall): IProductSearcher {
    console.log(`[ProductSearchRegistry] 새 상품 검색기 인스턴스 생성: ${mall}`);
    return ProductSearcherFactory.createSearcher(mall);
  }

  /**
   * 상품 검색기 가져오기 (Lazy Loading + 캐싱)
   * 
   * @deprecated 동시성 문제로 인해 사용 중단됨. createFreshSearcher() 사용 권장
   * @param mall 쇼핑몰 이름
   * @returns 상품 검색기 인스턴스
   */
  getSearcher(mall: ShoppingMall): IProductSearcher {
    console.warn(`[ProductSearchRegistry] getSearcher()는 deprecated됨. createFreshSearcher() 사용 권장`);
    
    // 캐시 확인
    if (this.searchers.has(mall)) {
      return this.searchers.get(mall)!;
    }

    // 상품 검색기 생성
    console.log(`[ProductSearchRegistry] 상품 검색기 생성: ${mall}`);
    const searcher = ProductSearcherFactory.createSearcher(mall);

    // 캐시에 저장
    this.searchers.set(mall, searcher);

    return searcher;
  }

  /**
   * 직접 상품 검색기 등록 (테스트용 또는 커스텀 검색기)
   */
  registerSearcher(mall: ShoppingMall, searcher: IProductSearcher): void {
    this.searchers.set(mall, searcher);
    console.log(`[ProductSearchRegistry] 상품 검색기 등록: ${mall}`);
  }

  /**
   * 상품 검색기 존재 여부
   */
  hasSearcher(mall: ShoppingMall): boolean {
    return this.searchers.has(mall) || this.isAvailable(mall);
  }

  /**
   * 사용 가능한 쇼핑몰 목록
   * YAML 기반 + 커스텀 검색기 포함
   */
  getAvailableMalls(): ShoppingMall[] {
    const yamlMalls = this.configLoader.getAvailableMalls();
    
    // 커스텀 검색기 목록 (YAML 없이 코드로만 존재하는 쇼핑몰)
    // 현재는 모든 쇼핑몰이 YAML을 가지므로 빈 배열
    const customOnlyMalls: ShoppingMall[] = [];
    
    // 중복 제거하며 합치기
    const allMalls = [...new Set([...yamlMalls, ...customOnlyMalls])];
    
    return allMalls;
  }

  /**
   * 쇼핑몰이 사용 가능한지 확인
   */
  isAvailable(mall: ShoppingMall): boolean {
    const availableMalls = this.getAvailableMalls();
    return availableMalls.includes(mall);
  }

  /**
   * 모든 상품 검색기 정리
   */
  async cleanupAll(): Promise<void> {
    console.log('[ProductSearchRegistry] 모든 상품 검색기 정리 시작');

    for (const [mall, searcher] of this.searchers.entries()) {
      try {
        await searcher.cleanup();
        console.log(`[ProductSearchRegistry] ${mall} 정리 완료`);
      } catch (error) {
        console.warn(`[ProductSearchRegistry] ${mall} 정리 실패:`, error);
      }
    }

    this.searchers.clear();
    console.log('[ProductSearchRegistry] 모든 상품 검색기 정리 완료');
  }

  /**
   * 특정 상품 검색기 제거
   */
  async removeSearcher(mall: ShoppingMall): Promise<void> {
    const searcher = this.searchers.get(mall);
    if (searcher) {
      await searcher.cleanup();
      this.searchers.delete(mall);
      console.log(`[ProductSearchRegistry] ${mall} 제거 완료`);
    }
  }

  /**
   * 캐시 초기화 (상품 검색기는 정리하지 않음)
   */
  clearCache(): void {
    this.searchers.clear();
    console.log('[ProductSearchRegistry] 캐시 초기화');
  }
}


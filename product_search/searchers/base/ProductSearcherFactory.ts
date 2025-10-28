/**
 * 상품 검색 팩토리
 * Factory Pattern
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색을 위한 검색기 생성
 * 
 * 역할:
 * - 쇼핑몰 이름으로 상품 검색기 인스턴스 생성
 * - ConfigDrivenProductSearcher 또는 커스텀 검색기 사용
 * 
 * SOLID 원칙:
 * - SRP: 상품 검색기 생성만 담당
 * - OCP: 새 쇼핑몰 추가 시 코드 수정 불필요 (설정 기반)
 */

import { IProductSearcher } from '../../core/interfaces/IProductSearcher';
import { ShoppingMall } from '../../core/domain/Product';
import { ConfigDrivenProductSearcher } from '../ConfigDrivenProductSearcher';

/**
 * 상품 검색 팩토리
 */
export class ProductSearcherFactory {
  /**
   * 상품 검색기 생성
   * @param mall 쇼핑몰 이름
   * @returns 상품 검색기 인스턴스
   */
  static createSearcher(mall: ShoppingMall): IProductSearcher {
    // 커스텀 검색기가 있으면 우선 사용
    if (this.customSearchers.has(mall)) {
      return this.customSearchers.get(mall)!;
    }

    // 모든 쇼핑몰이 YAML 기반 ConfigDrivenProductSearcher 사용
    return new ConfigDrivenProductSearcher(mall);
  }

  /**
   * 커스텀 상품 검색기 등록 (향후 확장용)
   * 
   * 사용 예:
   * ProductSearcherFactory.registerCustomSearcher('newmall', new CustomSearcher());
   */
  private static customSearchers: Map<ShoppingMall, IProductSearcher> = new Map();

  static registerCustomSearcher(mall: ShoppingMall, searcher: IProductSearcher): void {
    this.customSearchers.set(mall, searcher);
  }

  static hasCustomSearcher(mall: ShoppingMall): boolean {
    return this.customSearchers.has(mall);
  }

  static getCustomSearcher(mall: ShoppingMall): IProductSearcher | undefined {
    return this.customSearchers.get(mall);
  }
}


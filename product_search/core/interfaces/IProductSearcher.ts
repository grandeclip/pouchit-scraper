/**
 * 상품 검색 인터페이스
 * Strategy Pattern의 핵심 인터페이스
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색
 * 
 * SOLID 원칙:
 * - SRP: 상품 검색 실행 책임만 가짐
 * - OCP: 새로운 쇼핑몰 추가 시 인터페이스 수정 불필요
 * - LSP: 모든 구현체는 이 인터페이스로 대체 가능
 * - ISP: 클라이언트가 필요한 메서드만 정의
 * - DIP: 상위 모듈이 이 추상화에 의존
 */

import { Product, ShoppingMall } from '../domain/Product';
import { ProductSearchRequest } from '../domain/ProductSearchConfig';

/**
 * 상품 검색 인터페이스
 */
export interface IProductSearcher {
  /**
   * 쇼핑몰 이름 반환
   */
  getMallName(): ShoppingMall;

  /**
   * 상품 검색 실행
   * @param request 상품 검색 요청 (brand, productName)
   * @returns 추출된 상품 목록
   */
  search(request: ProductSearchRequest): Promise<Product[]>;

  /**
   * 초기화
   */
  initialize(): Promise<void>;

  /**
   * 리소스 정리
   */
  cleanup(): Promise<void>;
}


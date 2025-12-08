/**
 * Product Repository 인터페이스
 *
 * SOLID 원칙:
 * - ISP: 클라이언트별 인터페이스 분리
 * - DIP: 추상화에 의존 (Supabase 구체 구현에 의존하지 않음)
 */

import {
  ProductSetEntity,
  ProductSetSearchRequest,
} from "@/core/domain/ProductSet";

/**
 * Product Repository 인터페이스
 */
export interface IProductRepository {
  /**
   * 상품 검색
   * @param request 검색 조건
   * @returns 검색된 상품 목록
   */
  search(request: ProductSetSearchRequest): Promise<ProductSetEntity[]>;

  /**
   * 상품 ID로 조회
   * @param productSetId 상품 세트 ID (UUID)
   * @returns 상품 정보
   */
  findById(productSetId: string): Promise<ProductSetEntity | null>;

  /**
   * 연결 상태 확인
   * @returns 연결 여부
   */
  healthCheck(): Promise<boolean>;
}

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
 * product_sets INSERT 요청 데이터
 */
export interface ProductSetInsertRequest {
  /** 상품 ID (FK to products) */
  product_id: string;

  /** 상품 링크 URL (PC) */
  link_url: string;

  /** 모바일 링크 URL */
  mobile_link_url?: string;

  /** 플랫폼 ID (FK to platforms) */
  platform_id: number;

  /** 자동 크롤링 여부 (기본값: false) */
  auto_crawled?: boolean;

  /** 판매 상태 (auto_crawled=true인 경우 off_sale) */
  sale_status?: string;
}

/**
 * product_sets INSERT 결과
 */
export interface ProductSetInsertResult {
  /** 생성된 product_set_id (UUID) */
  product_set_id: string;

  /** 상품 ID */
  product_id: string;

  /** 링크 URL (PC) */
  link_url: string;

  /** 모바일 링크 URL */
  mobile_link_url?: string;
}

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

  /**
   * 새 product_set 삽입
   * @param request 삽입할 데이터
   * @returns 생성된 product_set 정보
   */
  insert(
    request: ProductSetInsertRequest,
  ): Promise<ProductSetInsertResult | null>;

  /**
   * 여러 product_set 일괄 삽입
   * @param requests 삽입할 데이터 배열
   * @returns 생성된 product_set 정보 배열
   */
  insertMany(
    requests: ProductSetInsertRequest[],
  ): Promise<ProductSetInsertResult[]>;
}

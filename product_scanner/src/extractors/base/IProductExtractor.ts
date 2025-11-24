/**
 * IProductExtractor Interface
 *
 * 목적: 전체 상품 정보 추출 통합 인터페이스
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 */

import type { Page } from "playwright";
import type { PriceData } from "./IPriceExtractor";
import type { SaleStatusData } from "./ISaleStatusExtractor";
import type { MetadataData } from "./IMetadataExtractor";

/**
 * 통합 상품 데이터 구조
 */
export interface ProductData {
  /** 메타데이터 (상품명, 브랜드, 썸네일) */
  metadata: MetadataData;

  /** 가격 정보 */
  price: PriceData;

  /** 판매 상태 */
  saleStatus: SaleStatusData;
}

/**
 * 상품 정보 추출기 통합 인터페이스
 *
 * Generic 타입으로 다양한 입력 형식 지원:
 * - Page: Playwright DOM 기반 추출 (oliveyoung, ably, kurly)
 * - ApiResponse: HTTP API 기반 추출 (hwahae, musinsa)
 * - GraphQLResponse: GraphQL 기반 추출 (zigzag)
 *
 * @template TInput 입력 데이터 타입 (기본값: Page)
 */
export interface IProductExtractor<TInput = Page> {
  /**
   * 전체 상품 정보 추출
   *
   * @param input 입력 데이터 (Page, ApiResponse, GraphQLResponse 등)
   * @returns 추출된 전체 상품 데이터
   */
  extract(input: TInput): Promise<ProductData>;
}

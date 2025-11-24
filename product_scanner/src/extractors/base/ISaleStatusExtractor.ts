/**
 * ISaleStatusExtractor Interface
 *
 * 목적: 판매 상태 정보 추출 인터페이스
 * 패턴: Strategy Pattern
 * 표준: schema.org ItemAvailability 규약 준수
 * @see https://schema.org/ItemAvailability
 */

import type { Page } from "playwright";

/**
 * 판매 상태 Enum (schema.org ItemAvailability 기반)
 *
 * @see https://schema.org/ItemAvailability
 *
 * - InStock: 재고 있음 (판매 중) = 0
 * - OutOfStock: 일시 품절 = 1
 * - SoldOut: 완판 = 2
 * - Discontinued: 판매 종료 = 3
 */
export enum SaleStatus {
  InStock,
  OutOfStock,
  SoldOut,
  Discontinued,
}

/**
 * 판매 상태 데이터 구조
 */
export interface SaleStatusData {
  /** 판매 상태 코드 (필수) */
  saleStatus: SaleStatus;

  /** 구매 가능 여부 (필수) */
  isAvailable: boolean;
}

/**
 * 판매 상태 추출기 인터페이스
 *
 * Generic 타입으로 다양한 입력 형식 지원:
 * - Page: Playwright DOM 기반 추출 (oliveyoung, ably, kurly)
 * - ApiResponse: HTTP API 기반 추출 (hwahae, musinsa)
 * - GraphQLResponse: GraphQL 기반 추출 (zigzag)
 *
 * @template TInput 입력 데이터 타입 (기본값: Page)
 */
export interface ISaleStatusExtractor<TInput = Page> {
  /**
   * 판매 상태 정보 추출
   *
   * @param input 입력 데이터 (Page, ApiResponse, GraphQLResponse 등)
   * @returns 추출된 판매 상태 데이터
   */
  extract(input: TInput): Promise<SaleStatusData>;
}

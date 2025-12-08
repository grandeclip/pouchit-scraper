/**
 * IPriceExtractor Interface
 *
 * 목적: 가격 정보 추출 인터페이스
 * 패턴: Strategy Pattern
 */

import type { Page } from "playwright";

/**
 * 가격 데이터 구조
 */
export interface PriceData {
  /** 실제 판매가 (필수) */
  price: number;

  /** 정가 (할인 적용 전 가격) */
  originalPrice?: number;

  /** 할인율 (%) */
  discountRate?: number;

  /** 통화 코드 (기본: KRW) */
  currency: string;
}

/**
 * 가격 정보 추출기 인터페이스
 *
 * Generic 타입으로 다양한 입력 형식 지원:
 * - Page: Playwright DOM 기반 추출 (oliveyoung, ably, kurly)
 * - ApiResponse: HTTP API 기반 추출 (hwahae, musinsa)
 * - GraphQLResponse: GraphQL 기반 추출 (zigzag)
 *
 * @template TInput 입력 데이터 타입 (기본값: Page)
 */
export interface IPriceExtractor<TInput = Page> {
  /**
   * 가격 정보 추출
   *
   * @param input 입력 데이터 (Page, ApiResponse, GraphQLResponse 등)
   * @returns 추출된 가격 데이터
   */
  extract(input: TInput): Promise<PriceData>;
}

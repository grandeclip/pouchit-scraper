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
 * 구현체는 Playwright Page에서 가격 정보를 추출하여
 * PriceData 구조로 반환해야 함
 */
export interface IPriceExtractor {
  /**
   * 가격 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 가격 데이터
   */
  extract(page: Page): Promise<PriceData>;
}

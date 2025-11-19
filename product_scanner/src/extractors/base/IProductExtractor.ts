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
 * 구현체는 Playwright Page에서 전체 상품 정보를 추출하여
 * ProductData 구조로 반환해야 함
 */
export interface IProductExtractor {
  /**
   * 전체 상품 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 전체 상품 데이터
   */
  extract(page: Page): Promise<ProductData>;
}

/**
 * KurlyExtractor
 *
 * 목적: 마켓컬리 상품 데이터 통합 추출
 * 패턴: Facade Pattern
 * 참고: docs/analysis/kurly-strategy-analysis.md
 *
 * SOLID 원칙:
 * - SRP: 3개 서브 Extractor 통합만 담당
 * - OCP: 새로운 데이터 타입 추가 시 서브 Extractor 확장
 * - DIP: 인터페이스(IProductExtractor)에 의존
 */

import type { Page } from "playwright";
import type { IProductExtractor, ProductData } from "@/extractors/base";
import { KurlyPriceExtractor } from "./KurlyPriceExtractor";
import { KurlySaleStatusExtractor } from "./KurlySaleStatusExtractor";
import { KurlyMetadataExtractor } from "./KurlyMetadataExtractor";

/**
 * 마켓컬리 통합 Extractor (Facade)
 *
 * 책임:
 * 1. 3개 서브 Extractor 조합
 * 2. 병렬 추출로 성능 최적화
 * 3. 통합 로깅
 *
 * @implements {IProductExtractor<Page>}
 */
export class KurlyExtractor implements IProductExtractor<Page> {
  private readonly priceExtractor: KurlyPriceExtractor;
  private readonly saleStatusExtractor: KurlySaleStatusExtractor;
  private readonly metadataExtractor: KurlyMetadataExtractor;

  constructor() {
    this.priceExtractor = new KurlyPriceExtractor();
    this.saleStatusExtractor = new KurlySaleStatusExtractor();
    this.metadataExtractor = new KurlyMetadataExtractor();
  }

  /**
   * 상품 데이터 통합 추출
   *
   * Promise.all로 3개 Extractor 병렬 실행하여 성능 최적화
   *
   * @param page Playwright Page 객체
   * @returns 통합된 상품 데이터
   */
  async extract(page: Page): Promise<ProductData> {
    const [metadata, price, saleStatus] = await Promise.all([
      this.metadataExtractor.extract(page),
      this.priceExtractor.extract(page),
      this.saleStatusExtractor.extract(page),
    ]);

    return {
      metadata,
      price,
      saleStatus,
    };
  }
}

/**
 * OliveyoungExtractor
 *
 * 목적: 올리브영 통합 Extractor (Facade Pattern)
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 * 참고: docs/analysis/oliveyoung-logic-analysis.md
 */

import type { Page } from "playwright";
import type { IProductExtractor, ProductData } from "@/extractors/base";
import { OliveyoungPriceExtractor } from "./OliveyoungPriceExtractor";
import { OliveyoungSaleStatusExtractor } from "./OliveyoungSaleStatusExtractor";
import { OliveyoungMetadataExtractor } from "./OliveyoungMetadataExtractor";

/**
 * 올리브영 통합 추출기
 *
 * 전략:
 * - Facade Pattern으로 3개 전문 Extractor 조합
 * - 병렬 처리로 성능 최적화
 * - 각 Extractor는 독립적으로 동작
 */
export class OliveyoungExtractor implements IProductExtractor {
  private readonly priceExtractor: OliveyoungPriceExtractor;
  private readonly saleStatusExtractor: OliveyoungSaleStatusExtractor;
  private readonly metadataExtractor: OliveyoungMetadataExtractor;

  constructor() {
    this.priceExtractor = new OliveyoungPriceExtractor();
    this.saleStatusExtractor = new OliveyoungSaleStatusExtractor();
    this.metadataExtractor = new OliveyoungMetadataExtractor();
  }

  /**
   * 전체 상품 정보 추출
   *
   * 전략:
   * - Promise.all로 병렬 처리 (성능 최적화)
   * - 각 Extractor 실패 시에도 나머지 계속 진행
   *
   * @param page Playwright Page 객체
   * @returns 추출된 전체 상품 데이터
   */
  async extract(page: Page): Promise<ProductData> {
    // 병렬 추출로 성능 최적화
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

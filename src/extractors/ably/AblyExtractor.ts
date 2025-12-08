/**
 * AblyExtractor
 *
 * 목적: 에이블리 통합 Extractor (Facade Pattern)
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 * 참고: docs/analysis/ably-strategy-analysis.md L465-516
 */

import type { Page } from "playwright";
import type { IProductExtractor, ProductData } from "@/extractors/base";
import { AblyPriceExtractor } from "./AblyPriceExtractor";
import { AblySaleStatusExtractor } from "./AblySaleStatusExtractor";
import { AblyMetadataExtractor } from "./AblyMetadataExtractor";

/**
 * 에이블리 통합 추출기
 *
 * 전략:
 * - Facade Pattern으로 3개 전문 Extractor 조합
 * - 병렬 처리로 성능 최적화 (Promise.all)
 * - 각 Extractor는 독립적으로 SSR → Fallback 전략 수행
 * - Olive Young과 달리 전처리 불필요 (SSR 데이터 즉시 파싱)
 *
 * @implements {IProductExtractor<Page>} Playwright Page 기반 추출
 */
export class AblyExtractor implements IProductExtractor<Page> {
  private readonly priceExtractor: AblyPriceExtractor;
  private readonly saleStatusExtractor: AblySaleStatusExtractor;
  private readonly metadataExtractor: AblyMetadataExtractor;

  constructor() {
    this.priceExtractor = new AblyPriceExtractor();
    this.saleStatusExtractor = new AblySaleStatusExtractor();
    this.metadataExtractor = new AblyMetadataExtractor();
  }

  /**
   * 전체 상품 정보 추출
   *
   * 전략:
   * - Promise.all로 병렬 처리 (성능 최적화)
   * - 각 Extractor 실패 시에도 나머지 계속 진행
   * - SSR 데이터 우선 + Meta tag fallback (각 Extractor 내부)
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

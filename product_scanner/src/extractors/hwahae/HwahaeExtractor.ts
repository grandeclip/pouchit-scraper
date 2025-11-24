/**
 * HwahaeExtractor
 *
 * 목적: 화해 통합 Extractor (Facade Pattern)
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 * 입력: HwahaeApiResponse (HTTP API JSON)
 */

import type { IProductExtractor, ProductData } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";
import { HwahaePriceExtractor } from "./HwahaePriceExtractor";
import { HwahaeSaleStatusExtractor } from "./HwahaeSaleStatusExtractor";
import { HwahaeMetadataExtractor } from "./HwahaeMetadataExtractor";

/**
 * 화해 통합 추출기 (API 기반)
 *
 * 전략:
 * - Facade Pattern으로 3개 전문 Extractor 조합
 * - 병렬 처리로 성능 최적화
 * - 각 Extractor는 독립적으로 동작
 * - API response 기반 추출 (DOM 불필요)
 *
 * @implements {IProductExtractor<HwahaeApiResponse>} HTTP API 기반 추출
 */
export class HwahaeExtractor implements IProductExtractor<HwahaeApiResponse> {
  private readonly priceExtractor: HwahaePriceExtractor;
  private readonly saleStatusExtractor: HwahaeSaleStatusExtractor;
  private readonly metadataExtractor: HwahaeMetadataExtractor;

  constructor() {
    this.priceExtractor = new HwahaePriceExtractor();
    this.saleStatusExtractor = new HwahaeSaleStatusExtractor();
    this.metadataExtractor = new HwahaeMetadataExtractor();
  }

  /**
   * 전체 상품 정보 추출
   *
   * 전략:
   * - Promise.all로 병렬 처리 (성능 최적화)
   * - API response에서 직접 추출 (전처리 불필요)
   * - 각 Extractor 실패 시에도 나머지 계속 진행
   *
   * @param response 화해 API 응답 객체
   * @returns 추출된 전체 상품 데이터
   */
  async extract(response: HwahaeApiResponse): Promise<ProductData> {
    // 병렬 추출로 성능 최적화
    const [metadata, price, saleStatus] = await Promise.all([
      this.metadataExtractor.extract(response),
      this.priceExtractor.extract(response),
      this.saleStatusExtractor.extract(response),
    ]);

    return {
      metadata,
      price,
      saleStatus,
    };
  }
}

/**
 * MusinsaExtractor
 *
 * 목적: 무신사 통합 Extractor (Facade Pattern)
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 * 입력: MusinsaApiResponse (HTTP API JSON)
 */

import type { IProductExtractor, ProductData } from "@/extractors/base";
import type { MusinsaApiResponse } from "./MusinsaPriceExtractor";
import { MusinsaPriceExtractor } from "./MusinsaPriceExtractor";
import { MusinsaSaleStatusExtractor } from "./MusinsaSaleStatusExtractor";
import { MusinsaMetadataExtractor } from "./MusinsaMetadataExtractor";
import { MUSINSA_IMAGE_CDN_BASE_URL } from "./MusinsaConstants";

/**
 * 무신사 통합 추출기 (API 기반)
 *
 * 전략:
 * - Facade Pattern으로 3개 전문 Extractor 조합
 * - 병렬 처리로 성능 최적화
 * - 각 Extractor는 독립적으로 동작
 * - API response 기반 추출 (DOM 불필요)
 *
 * @implements {IProductExtractor<MusinsaApiResponse>} HTTP API 기반 추출
 */
export class MusinsaExtractor implements IProductExtractor<MusinsaApiResponse> {
  private readonly priceExtractor: MusinsaPriceExtractor;
  private readonly saleStatusExtractor: MusinsaSaleStatusExtractor;
  private readonly metadataExtractor: MusinsaMetadataExtractor;

  constructor() {
    this.priceExtractor = new MusinsaPriceExtractor();
    this.saleStatusExtractor = new MusinsaSaleStatusExtractor();
    this.metadataExtractor = new MusinsaMetadataExtractor(
      MUSINSA_IMAGE_CDN_BASE_URL,
    );
  }

  /**
   * 전체 상품 정보 추출
   *
   * 전략:
   * - Promise.all로 병렬 처리 (성능 최적화)
   * - API response에서 직접 추출 (전처리 불필요)
   * - 각 Extractor 실패 시에도 나머지 계속 진행
   *
   * @param response 무신사 API 응답 객체
   * @returns 추출된 전체 상품 데이터
   */
  async extract(response: MusinsaApiResponse): Promise<ProductData> {
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

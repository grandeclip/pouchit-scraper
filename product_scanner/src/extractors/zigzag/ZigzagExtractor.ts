/**
 * ZigzagExtractor
 *
 * 목적: ZigZag 통합 Extractor (Facade Pattern)
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 * 입력: ZigzagGraphQLResponse (GraphQL API)
 */

import type { IProductExtractor, ProductData } from "@/extractors/base";
import {
  ZigzagPriceExtractor,
  type ZigzagGraphQLResponse,
} from "./ZigzagPriceExtractor";
import { ZigzagSaleStatusExtractor } from "./ZigzagSaleStatusExtractor";
import { ZigzagMetadataExtractor } from "./ZigzagMetadataExtractor";

/**
 * ZigZag 통합 추출기 (GraphQL 기반)
 *
 * 전략:
 * - Facade Pattern으로 3개 전문 Extractor 조합
 * - 병렬 처리로 성능 최적화
 * - 각 Extractor는 독립적으로 동작
 * - GraphQL response 기반 추출
 *
 * @implements {IProductExtractor<ZigzagGraphQLResponse>}
 */
export class ZigzagExtractor
  implements IProductExtractor<ZigzagGraphQLResponse>
{
  private readonly priceExtractor: ZigzagPriceExtractor;
  private readonly saleStatusExtractor: ZigzagSaleStatusExtractor;
  private readonly metadataExtractor: ZigzagMetadataExtractor;

  constructor() {
    this.priceExtractor = new ZigzagPriceExtractor();
    this.saleStatusExtractor = new ZigzagSaleStatusExtractor();
    this.metadataExtractor = new ZigzagMetadataExtractor();
  }

  /**
   * 전체 상품 정보 추출
   *
   * 전략:
   * - Promise.all로 병렬 처리 (성능 최적화)
   * - GraphQL response에서 직접 추출
   * - 각 Extractor 실패 시 에러 전파
   *
   * @param response ZigZag GraphQL 응답 객체
   * @returns 추출된 전체 상품 데이터
   * @throws Error GraphQL 에러 또는 상품 없음
   */
  async extract(response: ZigzagGraphQLResponse): Promise<ProductData> {
    // GraphQL 에러 체크
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors.map((e) => e.message).join(", ");
      throw new Error(`GraphQL Error: ${errorMessages}`);
    }

    // 데이터 존재 확인
    if (!response.data?.pdp_option_info) {
      throw new Error("Product not found (no data returned)");
    }

    if (!response.data.pdp_option_info.catalog_product) {
      throw new Error("Product not found (catalog_product is null)");
    }

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

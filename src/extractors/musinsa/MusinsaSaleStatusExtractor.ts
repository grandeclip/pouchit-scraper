/**
 * MusinsaSaleStatusExtractor
 *
 * 목적: 무신사 판매 상태 추출 (API 기반)
 * 패턴: Strategy Pattern
 * 입력: MusinsaApiResponse (HTTP API JSON)
 */

import type { ISaleStatusExtractor, SaleStatusData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";
import type { MusinsaApiResponse } from "./MusinsaPriceExtractor";

/**
 * API 판매 상태 (무신사 원본)
 */
export type ApiSaleStatus = "SALE" | "SOLDOUT" | "STOP_SALE";

/**
 * 무신사 판매 상태 추출기 (API 기반)
 *
 * 전략:
 * - API response의 goodsSaleType 필드에서 판매 상태 추출
 * - SALE(판매중) → InStock
 * - SOLDOUT(품절) → SoldOut
 * - STOP_SALE(판매중지) → Discontinued
 * - schema.org ItemAvailability 표준 준수
 *
 * @implements {ISaleStatusExtractor<MusinsaApiResponse>} HTTP API 기반 추출
 */
export class MusinsaSaleStatusExtractor
  implements ISaleStatusExtractor<MusinsaApiResponse>
{
  /**
   * 판매 상태 추출
   *
   * @param response 무신사 API 응답 객체
   * @returns 추출된 판매 상태 데이터
   */
  async extract(response: MusinsaApiResponse): Promise<SaleStatusData> {
    const apiStatus = response.data.goodsSaleType;
    const saleStatus = this.mapSaleStatus(apiStatus);

    return {
      saleStatus,
      isAvailable: saleStatus === SaleStatus.InStock,
    };
  }

  /**
   * API 판매 상태 → schema.org 표준 변환
   *
   * 매핑 규칙:
   * - SALE: 판매중 → InStock
   * - SOLDOUT: 품절 → SoldOut
   * - STOP_SALE: 판매중지 → Discontinued
   *
   * @param apiStatus API 판매 상태
   * @returns schema.org SaleStatus enum
   */
  private mapSaleStatus(apiStatus: ApiSaleStatus): SaleStatus {
    const mapping: Record<ApiSaleStatus, SaleStatus> = {
      SALE: SaleStatus.InStock, // 판매중
      SOLDOUT: SaleStatus.SoldOut, // 품절
      STOP_SALE: SaleStatus.Discontinued, // 판매중지
    };
    return mapping[apiStatus];
  }
}

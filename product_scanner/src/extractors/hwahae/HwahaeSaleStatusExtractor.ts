/**
 * HwahaeSaleStatusExtractor
 *
 * 목적: 화해 판매 상태 정보 추출 (API 기반)
 * 패턴: Strategy Pattern
 * 표준: schema.org ItemAvailability 규약 준수
 */

import type { ISaleStatusExtractor, SaleStatusData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

/**
 * 화해 API 판매 상태 타입
 */
type ApiSaleStatus = "SELNG" | "SLDOT" | "STSEL";

/**
 * 화해 판매 상태 추출기 (API 기반)
 *
 * 전략:
 * - API response의 sale_status 직접 활용
 * - SELNG(판매중) → InStock
 * - SLDOT(품절) → SoldOut
 * - STSEL(판매중지) → Discontinued
 *
 * @implements {ISaleStatusExtractor<HwahaeApiResponse>} HTTP API 기반 추출
 */
export class HwahaeSaleStatusExtractor
  implements ISaleStatusExtractor<HwahaeApiResponse>
{
  /**
   * 판매 상태 정보 추출
   *
   * @param response 화해 API 응답 객체
   * @returns 추출된 판매 상태 데이터
   */
  async extract(response: HwahaeApiResponse): Promise<SaleStatusData> {
    const apiStatus = response.sale_status;
    const saleStatus = this.mapSaleStatus(apiStatus);

    return {
      saleStatus,
      isAvailable: saleStatus === SaleStatus.InStock,
    };
  }

  /**
   * API 판매 상태 → SaleStatus enum 변환
   *
   * 매핑 규칙:
   * - SELNG: 판매중 → InStock
   * - SLDOT: 품절 → SoldOut
   * - STSEL: 판매중지 → Discontinued
   *
   * @param apiStatus 화해 API 판매 상태
   * @returns SaleStatus enum 값
   */
  private mapSaleStatus(apiStatus: ApiSaleStatus): SaleStatus {
    const mapping: Record<ApiSaleStatus, SaleStatus> = {
      SELNG: SaleStatus.InStock,
      SLDOT: SaleStatus.Discontinued, // DB 에 OutOfStock 관련 flag 가 없음
      STSEL: SaleStatus.Discontinued,
    };

    return mapping[apiStatus];
  }
}

/**
 * ZigzagSaleStatusExtractor
 *
 * 목적: ZigZag GraphQL 응답에서 판매 상태 추출
 * 패턴: Strategy Pattern
 * 입력: ZigzagGraphQLResponse
 *
 * 핵심 로직 (우선순위):
 * 1. 상품 레벨 필드 (catalog_product.sales_status) - 최우선
 * 2. matched_item_list fallback - 상품 레벨 필드 없을 때
 *
 * 상품 레벨 필드가 matched_item_list와 다를 수 있음:
 * - 예: matched_item_list에 ON_SALE이 있어도 상품이 SUSPENDED일 수 있음
 */

import type { ISaleStatusExtractor, SaleStatusData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";
import type {
  ZigzagGraphQLResponse,
  MatchedItem,
  ZigzagSalesStatus,
  ZigzagDisplayStatus,
} from "./ZigzagPriceExtractor";

/**
 * ZigZag 판매 상태 추출기
 *
 * 전략:
 * 1. 상품 레벨 sales_status, is_purchasable 우선 사용
 * 2. 없으면 matched_item_list 배열에서 복합 상태 계산
 *
 * @implements {ISaleStatusExtractor<ZigzagGraphQLResponse>}
 */
export class ZigzagSaleStatusExtractor
  implements ISaleStatusExtractor<ZigzagGraphQLResponse>
{
  /**
   * 판매 상태 추출
   *
   * @param response GraphQL 응답
   * @returns 판매 상태 데이터
   * @throws Error 상품 데이터 없음
   */
  async extract(response: ZigzagGraphQLResponse): Promise<SaleStatusData> {
    const product = response.data?.pdp_option_info?.catalog_product;

    if (!product) {
      throw new Error("Product not found in GraphQL response");
    }

    // 1️⃣ 상품 레벨 필드 우선 체크 (가장 신뢰할 수 있음)
    if (product.sales_status) {
      return {
        saleStatus: this.mapToSaleStatus(product.sales_status),
        isAvailable: product.is_purchasable ?? false,
      };
    }

    // 2️⃣ Fallback: matched_item_list 기반 계산
    const items = product.matched_item_list || [];
    const salesStatus = this.determineSalesStatusFromItems(items);
    const displayStatus = this.determineDisplayStatusFromItems(items);

    // 구매 가능 여부 = 판매중 AND 노출중
    const isPurchasable =
      salesStatus === "ON_SALE" && displayStatus === "VISIBLE";

    return {
      saleStatus: this.mapToSaleStatus(salesStatus),
      isAvailable: isPurchasable,
    };
  }

  /**
   * 판매 상태 결정 (matched_item_list 기반 - Fallback)
   *
   * 로직:
   * - 하나라도 ON_SALE → ON_SALE
   * - 모두 SOLD_OUT → SOLD_OUT
   * - 그 외 → 첫 번째 아이템 상태 또는 SUSPENDED
   *
   * @param items matched_item_list 배열
   * @returns ZigZag 판매 상태
   */
  private determineSalesStatusFromItems(
    items: MatchedItem[],
  ): ZigzagSalesStatus {
    if (items.length === 0) {
      return "SUSPENDED"; // 기본값
    }

    // 하나라도 ON_SALE이면 판매중
    const hasOnSale = items.some((item) => item.sales_status === "ON_SALE");
    if (hasOnSale) {
      return "ON_SALE";
    }

    // 모두 SOLD_OUT인지 확인
    const allSoldOut = items.every((item) => item.sales_status === "SOLD_OUT");
    if (allSoldOut) {
      return "SOLD_OUT";
    }

    // 그 외: 첫 번째 아이템 상태
    return items[0].sales_status;
  }

  /**
   * 노출 상태 결정 (matched_item_list 기반 - Fallback)
   *
   * 로직:
   * - 하나라도 VISIBLE → VISIBLE
   * - 그 외 → 첫 번째 아이템 상태 또는 HIDDEN
   *
   * @param items matched_item_list 배열
   * @returns ZigZag 노출 상태
   */
  private determineDisplayStatusFromItems(
    items: MatchedItem[],
  ): ZigzagDisplayStatus {
    if (items.length === 0) {
      return "HIDDEN"; // 기본값
    }

    // 하나라도 VISIBLE이면 노출중
    const hasVisible = items.some((item) => item.display_status === "VISIBLE");
    if (hasVisible) {
      return "VISIBLE";
    }

    // 그 외: 첫 번째 아이템 상태
    return items[0].display_status;
  }

  /**
   * ZigZag 판매 상태 → SaleStatus enum 매핑
   *
   * @param status ZigZag 판매 상태
   * @returns SaleStatus enum 값
   */
  private mapToSaleStatus(status: ZigzagSalesStatus): SaleStatus {
    switch (status) {
      case "ON_SALE":
        return SaleStatus.InStock;
      case "SOLD_OUT":
        return SaleStatus.SoldOut;
      case "SUSPENDED":
        return SaleStatus.Discontinued;
      default:
        return SaleStatus.Discontinued;
    }
  }
}

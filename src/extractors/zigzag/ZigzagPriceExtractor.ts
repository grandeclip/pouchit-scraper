/**
 * ZigzagPriceExtractor
 *
 * 목적: ZigZag GraphQL 응답에서 가격 정보 추출
 * 패턴: Strategy Pattern
 * 입력: ZigzagGraphQLResponse
 *
 * 핵심 로직:
 * - 첫구매 배지 검사 → 조건부 가격 선택
 * - originalPrice: max_price_info.price
 * - discountedPrice: 첫구매 여부에 따라 final_price vs final_discount_info
 */

import type { IPriceExtractor, PriceData } from "@/extractors/base";
import { ZIGZAG_CONSTANTS } from "@/config/constants";

// ============================================================================
// ZigZag GraphQL Types (from types.ts)
// ============================================================================

/**
 * ZigZag 판매 상태
 */
export type ZigzagSalesStatus = "ON_SALE" | "SOLD_OUT" | "SUSPENDED";

/**
 * ZigZag 노출 상태
 */
export type ZigzagDisplayStatus = "VISIBLE" | "HIDDEN";

/**
 * 가격 배지 정보
 */
export interface PriceBadge {
  text: string;
}

/**
 * 최종 가격 정보
 */
export interface FinalPriceInfo {
  price: number;
  badge: PriceBadge | null;
}

/**
 * 추가 가격 정보 (첫구매 등)
 */
export interface FinalPriceAdditional {
  price: number;
  badge: PriceBadge;
}

/**
 * 표시 가격 정보
 */
export interface DisplayFinalPrice {
  final_price: FinalPriceInfo;
  final_price_additional: FinalPriceAdditional | null;
}

/**
 * 상품 가격 정보
 */
export interface ProductPrice {
  max_price_info: { price: number };
  final_discount_info: { discount_price: number };
  display_final_price: DisplayFinalPrice;
}

/**
 * 옵션 아이템 정보 (matched_item_list)
 */
export interface MatchedItem {
  sales_status: ZigzagSalesStatus;
  display_status: ZigzagDisplayStatus;
}

/**
 * 상품 이미지 정보
 */
export interface ProductImage {
  image_type: string; // "MAIN", "SUB" 등
  pdp_thumbnail_url: string;
}

/**
 * 카탈로그 상품 정보
 */
export interface CatalogProduct {
  id: string;
  name: string;
  shop_name: string;
  product_price: ProductPrice;
  matched_item_list?: MatchedItem[];
  product_image_list?: ProductImage[];
  // 상품 레벨 상태 필드 (matched_item_list보다 우선)
  sales_status?: ZigzagSalesStatus;
  display_status?: ZigzagDisplayStatus;
  is_purchasable?: boolean;
}

/**
 * PDP 옵션 정보
 */
export interface PdpOptionInfo {
  catalog_product: CatalogProduct | null;
}

/**
 * GraphQL 에러
 */
export interface GraphQLError {
  message: string;
  extensions?: Record<string, string | number | boolean>;
}

/**
 * ZigZag GraphQL 응답 (GetCatalogProductDetailPageOption)
 */
export interface ZigzagGraphQLResponse {
  data?: {
    pdp_option_info?: PdpOptionInfo | null;
  } | null;
  errors?: GraphQLError[];
}

// ============================================================================
// ZigzagPriceExtractor
// ============================================================================

/**
 * ZigZag 가격 추출기
 *
 * 전략:
 * - 첫구매 배지 검사로 가격 선택
 * - 첫구매 O: display_final_price.final_price.price (첫구매 제외가)
 * - 첫구매 X: final_discount_info.discount_price (일반 할인가)
 *
 * @implements {IPriceExtractor<ZigzagGraphQLResponse>}
 */
export class ZigzagPriceExtractor
  implements IPriceExtractor<ZigzagGraphQLResponse>
{
  /**
   * 가격 정보 추출
   *
   * @param response GraphQL 응답
   * @returns 가격 데이터
   * @throws Error 상품 데이터 없음
   */
  async extract(response: ZigzagGraphQLResponse): Promise<PriceData> {
    const product = response.data?.pdp_option_info?.catalog_product;

    if (!product) {
      throw new Error("Product not found in GraphQL response");
    }

    const priceData = product.product_price;
    const originalPrice = priceData?.max_price_info?.price || 0;

    // 첫구매 제외 가격 계산
    const discountedPrice = this.calculateDiscountedPrice(
      priceData,
      originalPrice,
    );

    // 할인율 계산
    const discountRate = this.calculateDiscountRate(
      originalPrice,
      discountedPrice,
    );

    return {
      price: discountedPrice,
      originalPrice,
      discountRate,
      currency: "KRW",
    };
  }

  /**
   * 첫구매 배지 확인
   *
   * @param priceData 가격 정보 객체
   * @returns 첫구매 배지 여부
   */
  private isFirstPurchaseBadge(priceData: ProductPrice | undefined): boolean {
    const badge = priceData?.display_final_price?.final_price_additional?.badge;
    if (!badge?.text) return false;

    return ZIGZAG_CONSTANTS.FIRST_PURCHASE_BADGE_KEYWORDS.some((keyword) =>
      badge.text.includes(keyword),
    );
  }

  /**
   * 할인가 계산 (첫구매 조건부)
   *
   * @param priceData 가격 정보 객체
   * @param originalPrice 정가 (fallback용)
   * @returns 할인가
   */
  private calculateDiscountedPrice(
    priceData: ProductPrice | undefined,
    originalPrice: number,
  ): number {
    if (!priceData) return originalPrice;

    const isFirstPurchase = this.isFirstPurchaseBadge(priceData);

    if (isFirstPurchase) {
      // 첫구매 제외 가격 = display_final_price.final_price.price
      return priceData.display_final_price?.final_price?.price || originalPrice;
    }

    // 일반 할인가 = final_discount_info.discount_price
    return priceData.final_discount_info?.discount_price || originalPrice;
  }

  /**
   * 할인율 계산
   *
   * @param originalPrice 정가
   * @param discountedPrice 할인가
   * @returns 할인율 (0-100)
   */
  private calculateDiscountRate(
    originalPrice: number,
    discountedPrice: number,
  ): number {
    if (originalPrice <= 0 || discountedPrice >= originalPrice) {
      return 0;
    }

    return Math.round(
      ((originalPrice - discountedPrice) / originalPrice) * 100,
    );
  }
}

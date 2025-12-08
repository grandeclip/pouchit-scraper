/**
 * MusinsaPriceExtractor
 *
 * 목적: 무신사 가격 정보 추출 (API 기반)
 * 패턴: Strategy Pattern
 * 입력: MusinsaApiResponse (HTTP API JSON)
 */

import type { IPriceExtractor, PriceData } from "@/extractors/base";

/**
 * 무신사 API 응답 타입 (가격 관련)
 */
export interface MusinsaApiResponse {
  meta: {
    result: string;
    errorCode: string;
    message: string;
  };
  data: {
    goodsNo: number;
    goodsNm: string;
    thumbnailImageUrl: string;
    goodsSaleType: "SALE" | "SOLDOUT" | "STOP_SALE";
    goodsPrice: {
      normalPrice: number;
      salePrice: number;
      couponPrice: number;
      couponDiscount: boolean;
    };
  };
}

/**
 * 무신사 가격 추출기 (API 기반)
 *
 * 전략:
 * - API response에서 직접 가격 데이터 추출
 * - normalPrice(정가), salePrice(할인가), couponPrice(쿠폰가) 활용
 * - couponDiscount 플래그로 최종 가격 결정
 * - 할인율 자동 계산
 *
 * @implements {IPriceExtractor<MusinsaApiResponse>} HTTP API 기반 추출
 */
export class MusinsaPriceExtractor
  implements IPriceExtractor<MusinsaApiResponse>
{
  /**
   * 가격 정보 추출
   *
   * 로직:
   * 1. couponDiscount === true → couponPrice 사용
   * 2. couponDiscount === false → salePrice 사용
   * 3. 할인율 계산 (정가 대비)
   *
   * @param response 무신사 API 응답 객체
   * @returns 추출된 가격 데이터
   */
  async extract(response: MusinsaApiResponse): Promise<PriceData> {
    const { goodsPrice } = response.data;

    // 최종 가격 결정: 쿠폰 할인 여부에 따라
    const finalPrice = this.decideFinalPrice(goodsPrice);

    // 할인율 계산 (정가가 최종가보다 클 때만)
    const discountRate = this.calculateDiscountRate(
      finalPrice,
      goodsPrice.normalPrice,
    );

    return {
      price: finalPrice,
      originalPrice:
        goodsPrice.normalPrice > 0 ? goodsPrice.normalPrice : undefined,
      discountRate,
      currency: "KRW",
    };
  }

  /**
   * 최종 가격 결정
   *
   * 전략:
   * - couponDiscount === true → couponPrice
   * - couponDiscount === false → salePrice
   *
   * @param goodsPrice 상품 가격 정보
   * @returns 최종 판매 가격
   */
  private decideFinalPrice(goodsPrice: {
    normalPrice: number;
    salePrice: number;
    couponPrice: number;
    couponDiscount: boolean;
  }): number {
    return goodsPrice.couponDiscount
      ? goodsPrice.couponPrice
      : goodsPrice.salePrice;
  }

  /**
   * 할인율 계산
   *
   * @param price 판매가
   * @param originalPrice 정가
   * @returns 할인율(%) 또는 undefined
   */
  private calculateDiscountRate(
    price: number,
    originalPrice: number,
  ): number | undefined {
    // 정가가 없거나 판매가보다 작으면 할인 없음
    if (!originalPrice || originalPrice <= price) {
      return undefined;
    }

    // 할인율 = (정가 - 판매가) / 정가 * 100
    const rate = ((originalPrice - price) / originalPrice) * 100;
    return Math.round(rate); // 소수점 반올림
  }
}

/**
 * HwahaePriceExtractor
 *
 * 목적: 화해 가격 정보 추출 (API 기반)
 * 패턴: Strategy Pattern
 * 입력: HwahaeApiResponse (HTTP API JSON)
 */

import type { IPriceExtractor, PriceData } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

/**
 * 화해 가격 추출기 (API 기반)
 *
 * 전략:
 * - API response에서 직접 가격 데이터 추출
 * - consumer_price(정가), price(판매가) 활용
 * - 할인율 자동 계산
 *
 * @implements {IPriceExtractor<HwahaeApiResponse>} HTTP API 기반 추출
 */
export class HwahaePriceExtractor
  implements IPriceExtractor<HwahaeApiResponse>
{
  /**
   * 가격 정보 추출
   *
   * @param response 화해 API 응답 객체
   * @returns 추출된 가격 데이터
   */
  async extract(response: HwahaeApiResponse): Promise<PriceData> {
    const price = response.price;
    const originalPrice = response.consumer_price;

    // 할인율 계산 (정가가 판매가보다 클 때만)
    const discountRate = this.calculateDiscountRate(price, originalPrice);

    return {
      price,
      originalPrice: originalPrice > 0 ? originalPrice : undefined,
      discountRate,
      currency: "KRW",
    };
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

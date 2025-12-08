/**
 * ZigzagPriceExtractor Test
 *
 * 목적: ZigZag 가격 추출 로직 검증 (GraphQL 기반)
 * 핵심: 첫구매 배지 조건부 가격 선택
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ZigzagPriceExtractor } from "@/extractors/zigzag/ZigzagPriceExtractor";
import type { PriceData } from "@/extractors/base";
import type { ZigzagGraphQLResponse } from "@/extractors/zigzag/ZigzagPriceExtractor";

describe("ZigzagPriceExtractor", () => {
  let extractor: ZigzagPriceExtractor;

  beforeEach(() => {
    extractor = new ZigzagPriceExtractor();
  });

  /**
   * Mock GraphQL 응답 생성 헬퍼
   */
  const createMockResponse = (
    priceOverrides: Partial<{
      maxPrice: number;
      discountPrice: number;
      finalPrice: number;
      additionalPrice: number;
      badgeText: string | null;
    }> = {},
  ): ZigzagGraphQLResponse => {
    const {
      maxPrice = 50000,
      discountPrice = 40000,
      finalPrice = 35000,
      additionalPrice = 30000,
      badgeText = null,
    } = priceOverrides;

    return {
      data: {
        pdp_option_info: {
          catalog_product: {
            id: "12345",
            name: "테스트 상품",
            shop_name: "테스트 브랜드",
            product_price: {
              max_price_info: { price: maxPrice },
              final_discount_info: { discount_price: discountPrice },
              display_final_price: {
                final_price: {
                  price: finalPrice,
                  badge: null,
                },
                final_price_additional: badgeText
                  ? {
                      price: additionalPrice,
                      badge: { text: badgeText },
                    }
                  : null,
              },
            },
            matched_item_list: [
              { sales_status: "ON_SALE", display_status: "VISIBLE" },
            ],
            product_image_list: [
              {
                image_type: "MAIN",
                pdp_thumbnail_url: "https://img.zigzag.kr/main.jpg",
              },
            ],
          },
        },
      },
    };
  };

  describe("extract() - 가격 추출", () => {
    it("일반 할인 상품 (첫구매 아님)의 가격을 추출해야 함", async () => {
      const mockResponse = createMockResponse({
        maxPrice: 50000,
        discountPrice: 40000, // 일반 할인가
        finalPrice: 35000,
        badgeText: null,
      });

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(40000); // final_discount_info.discount_price
      expect(result.originalPrice).toBe(50000);
      expect(result.discountRate).toBe(20); // (50000-40000)/50000*100
      expect(result.currency).toBe("KRW");
    });

    it("첫구매 할인 상품 (badge=첫구매)의 가격을 추출해야 함", async () => {
      const mockResponse = createMockResponse({
        maxPrice: 50000,
        discountPrice: 30000, // 첫구매 포함 가격 (사용 안함)
        finalPrice: 40000, // 첫구매 제외가 (사용)
        additionalPrice: 30000,
        badgeText: "첫구매 -10,000원",
      });

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(40000); // display_final_price.final_price.price
      expect(result.originalPrice).toBe(50000);
      expect(result.discountRate).toBe(20);
      expect(result.currency).toBe("KRW");
    });

    it("첫 구매 (공백 포함) 배지도 인식해야 함", async () => {
      const mockResponse = createMockResponse({
        maxPrice: 40000,
        discountPrice: 25000,
        finalPrice: 30000,
        badgeText: "첫 구매 혜택",
      });

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(30000); // final_price (첫구매 제외가)
    });

    it("할인 없는 상품은 discountRate가 0이어야 함", async () => {
      const mockResponse = createMockResponse({
        maxPrice: 30000,
        discountPrice: 30000,
        finalPrice: 30000,
      });

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(30000);
      expect(result.originalPrice).toBe(30000);
      expect(result.discountRate).toBe(0);
    });

    it("상품 데이터 없으면 에러를 던져야 함", async () => {
      const mockResponse: ZigzagGraphQLResponse = {
        data: {
          pdp_option_info: {
            catalog_product: null,
          },
        },
      };

      await expect(extractor.extract(mockResponse)).rejects.toThrow(
        "Product not found",
      );
    });
  });

  describe("할인율 계산 로직", () => {
    it("할인율은 소수점 반올림해야 함", async () => {
      const mockResponse = createMockResponse({
        maxPrice: 30000,
        discountPrice: 20000, // 33.33%
      });

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.discountRate).toBe(33); // 33.33% → 33
    });

    it("정가가 0이면 할인율은 0이어야 함", async () => {
      const mockResponse = createMockResponse({
        maxPrice: 0,
        discountPrice: 10000,
      });

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.discountRate).toBe(0);
    });
  });
});

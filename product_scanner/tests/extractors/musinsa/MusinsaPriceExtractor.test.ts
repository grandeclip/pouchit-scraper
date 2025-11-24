/**
 * MusinsaPriceExtractor Test
 *
 * 목적: 무신사 가격 추출 로직 검증 (API 기반)
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { MusinsaPriceExtractor } from "@/extractors/musinsa/MusinsaPriceExtractor";
import type { PriceData } from "@/extractors/base";
import type { MusinsaApiResponse } from "@/extractors/musinsa/MusinsaPriceExtractor";

describe("MusinsaPriceExtractor", () => {
  let extractor: MusinsaPriceExtractor;

  beforeEach(() => {
    extractor = new MusinsaPriceExtractor();
  });

  describe("extract() - 가격 추출", () => {
    it("쿠폰 할인 적용 상품 (couponDiscount=true)의 가격 정보를 추출해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 12345,
          goodsNm: "쿠폰 할인 상품",
          thumbnailImageUrl: "/thumbnails/test.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 50000, // 정가
            salePrice: 40000, // 할인가
            couponPrice: 35000, // 쿠폰가 (최종가)
            couponDiscount: true, // 쿠폰 할인 활성화
          },
        },
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(35000); // couponPrice
      expect(result.originalPrice).toBe(50000);
      expect(result.discountRate).toBe(30); // (50000-35000)/50000*100
      expect(result.currency).toBe("KRW");
    });

    it("일반 할인 상품 (couponDiscount=false)의 가격 정보를 추출해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 23456,
          goodsNm: "일반 할인 상품",
          thumbnailImageUrl: "/thumbnails/test2.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 30000,
            salePrice: 24000, // 최종가 (20% 할인)
            couponPrice: 22000,
            couponDiscount: false, // 쿠폰 미적용
          },
        },
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(24000); // salePrice
      expect(result.originalPrice).toBe(30000);
      expect(result.discountRate).toBe(20);
      expect(result.currency).toBe("KRW");
    });

    it("할인 없는 상품은 discountRate가 undefined여야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 34567,
          goodsNm: "할인 없는 상품",
          thumbnailImageUrl: "/thumbnails/test3.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 20000,
            salePrice: 20000, // 정가=판매가
            couponPrice: 20000,
            couponDiscount: false,
          },
        },
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(20000);
      expect(result.originalPrice).toBe(20000);
      expect(result.discountRate).toBeUndefined();
      expect(result.currency).toBe("KRW");
    });

    it("정가가 0원이면 originalPrice는 undefined여야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 45678,
          goodsNm: "정가 없는 상품",
          thumbnailImageUrl: "/thumbnails/test4.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 0,
            salePrice: 15000,
            couponPrice: 15000,
            couponDiscount: false,
          },
        },
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(15000);
      expect(result.originalPrice).toBeUndefined();
      expect(result.discountRate).toBeUndefined();
    });
  });

  describe("할인율 계산 로직", () => {
    it("할인율은 소수점 반올림해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 56789,
          goodsNm: "33.33% 할인 상품",
          thumbnailImageUrl: "/thumbnails/test5.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 30000,
            salePrice: 20000, // 33.33%
            couponPrice: 20000,
            couponDiscount: false,
          },
        },
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.discountRate).toBe(33); // 33.33% → 33
    });
  });
});

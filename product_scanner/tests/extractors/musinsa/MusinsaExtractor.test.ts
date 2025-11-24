/**
 * MusinsaExtractor Test
 *
 * 목적: 무신사 통합 Extractor 검증 (Facade Pattern)
 * 패턴: Facade Pattern - Price, SaleStatus, Metadata 통합
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { MusinsaExtractor } from "@/extractors/musinsa/MusinsaExtractor";
import { SaleStatus } from "@/extractors/base";
import type { ProductData } from "@/extractors/base";
import type { MusinsaApiResponse } from "@/extractors/musinsa/MusinsaPriceExtractor";

describe("MusinsaExtractor", () => {
  let extractor: MusinsaExtractor;

  beforeEach(() => {
    extractor = new MusinsaExtractor();
  });

  describe("extract() - 통합 추출", () => {
    it("모든 정보를 통합 추출해야 함 (쿠폰 할인 적용)", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 123456,
          goodsNm: "무신사 테스트 상품명",
          thumbnailImageUrl: "/thumbnails/test.jpg",
          goodsSaleType: "SALE", // 판매중
          goodsPrice: {
            normalPrice: 50000, // 정가
            salePrice: 40000, // 할인가
            couponPrice: 35000, // 쿠폰가 (최종가)
            couponDiscount: true, // 쿠폰 할인 활성화
          },
        },
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // Metadata 검증
      expect(result.metadata.productName).toBe("무신사 테스트 상품명");
      expect(result.metadata.brand).toBeUndefined();
      expect(result.metadata.thumbnail).toBe(
        "https://image.msscdn.net/thumbnails/test.jpg",
      );
      expect(result.metadata.images).toEqual([
        "https://image.msscdn.net/thumbnails/test.jpg",
      ]);

      // Price 검증 (쿠폰 할인 적용)
      expect(result.price.price).toBe(35000); // couponPrice
      expect(result.price.originalPrice).toBe(50000);
      expect(result.price.discountRate).toBe(30); // (50000-35000)/50000*100
      expect(result.price.currency).toBe("KRW");

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
      expect(result.saleStatus.isAvailable).toBe(true);
    });

    it("품절 상품도 정상 추출해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 789012,
          goodsNm: "품절 상품",
          thumbnailImageUrl: "/soldout.jpg",
          goodsSaleType: "SOLDOUT", // 품절
          goodsPrice: {
            normalPrice: 15000,
            salePrice: 15000,
            couponPrice: 15000,
            couponDiscount: false,
          },
        },
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.saleStatus.isAvailable).toBe(false);

      // Price 검증 (할인 없음)
      expect(result.price.price).toBe(15000);
      expect(result.price.discountRate).toBeUndefined();

      // Metadata 검증
      expect(result.metadata.productName).toBe("품절 상품");
    });

    it("각 Extractor가 독립적으로 동작해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 111,
          goodsNm: "독립성 테스트",
          thumbnailImageUrl: "/test.jpg",
          goodsSaleType: "STOP_SALE", // 판매중지
          goodsPrice: {
            normalPrice: 10000,
            salePrice: 10000,
            couponPrice: 10000,
            couponDiscount: false,
          },
        },
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // 3개 전문 Extractor의 결과가 모두 포함
      expect(result.metadata).toBeDefined();
      expect(result.metadata.productName).toBe("독립성 테스트");

      expect(result.price).toBeDefined();
      expect(result.price.price).toBe(10000);

      expect(result.saleStatus).toBeDefined();
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.Discontinued);
    });
  });

  describe("Facade Pattern 검증", () => {
    it("3개 전문 Extractor를 조합해야 함", () => {
      // Private 필드이므로 동작으로 검증
      expect(extractor).toHaveProperty("extract");
      expect(typeof extractor.extract).toBe("function");
    });

    it("extract 메서드는 ProductData를 반환해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 999,
          goodsNm: "반환 타입 검증",
          thumbnailImageUrl: "/test.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 5000,
            salePrice: 5000,
            couponPrice: 5000,
            couponDiscount: false,
          },
        },
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // ProductData 구조 검증
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("saleStatus");
    });
  });
});

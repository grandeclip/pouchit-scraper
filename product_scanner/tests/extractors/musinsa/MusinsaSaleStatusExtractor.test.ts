/**
 * MusinsaSaleStatusExtractor Test
 *
 * 목적: 무신사 판매 상태 추출 로직 검증 (API 기반)
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { MusinsaSaleStatusExtractor } from "@/extractors/musinsa/MusinsaSaleStatusExtractor";
import { SaleStatus } from "@/extractors/base";
import type { SaleStatusData } from "@/extractors/base";
import type { MusinsaApiResponse } from "@/extractors/musinsa/MusinsaPriceExtractor";

describe("MusinsaSaleStatusExtractor", () => {
  let extractor: MusinsaSaleStatusExtractor;

  beforeEach(() => {
    extractor = new MusinsaSaleStatusExtractor();
  });

  describe("extract() - 판매 상태 추출", () => {
    it("SALE → InStock으로 변환해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 123,
          goodsNm: "판매중 상품",
          thumbnailImageUrl: "/thumbnails/test.jpg",
          goodsSaleType: "SALE", // 판매중
          goodsPrice: {
            normalPrice: 15000,
            salePrice: 15000,
            couponPrice: 15000,
            couponDiscount: false,
          },
        },
      };

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it("SOLDOUT → SoldOut으로 변환해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 456,
          goodsNm: "품절 상품",
          thumbnailImageUrl: "/thumbnails/test2.jpg",
          goodsSaleType: "SOLDOUT", // 품절
          goodsPrice: {
            normalPrice: 20000,
            salePrice: 20000,
            couponPrice: 20000,
            couponDiscount: false,
          },
        },
      };

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.isAvailable).toBe(false);
    });

    it("STOP_SALE → Discontinued로 변환해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 789,
          goodsNm: "판매중지 상품",
          thumbnailImageUrl: "/thumbnails/test3.jpg",
          goodsSaleType: "STOP_SALE", // 판매중지
          goodsPrice: {
            normalPrice: 25000,
            salePrice: 25000,
            couponPrice: 25000,
            couponDiscount: false,
          },
        },
      };

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });
  });

  describe("isAvailable 플래그", () => {
    it("InStock일 때만 isAvailable=true여야 함", async () => {
      const inStockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 1,
          goodsNm: "판매중",
          thumbnailImageUrl: "/thumbnails/test.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 10000,
            salePrice: 10000,
            couponPrice: 10000,
            couponDiscount: false,
          },
        },
      };

      const soldOutResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 2,
          goodsNm: "품절",
          thumbnailImageUrl: "/thumbnails/test2.jpg",
          goodsSaleType: "SOLDOUT",
          goodsPrice: {
            normalPrice: 10000,
            salePrice: 10000,
            couponPrice: 10000,
            couponDiscount: false,
          },
        },
      };

      const discontinuedResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 3,
          goodsNm: "판매중지",
          thumbnailImageUrl: "/thumbnails/test3.jpg",
          goodsSaleType: "STOP_SALE",
          goodsPrice: {
            normalPrice: 10000,
            salePrice: 10000,
            couponPrice: 10000,
            couponDiscount: false,
          },
        },
      };

      const inStockResult = await extractor.extract(inStockResponse);
      const soldOutResult = await extractor.extract(soldOutResponse);
      const discontinuedResult = await extractor.extract(discontinuedResponse);

      expect(inStockResult.isAvailable).toBe(true);
      expect(soldOutResult.isAvailable).toBe(false);
      expect(discontinuedResult.isAvailable).toBe(false);
    });
  });
});

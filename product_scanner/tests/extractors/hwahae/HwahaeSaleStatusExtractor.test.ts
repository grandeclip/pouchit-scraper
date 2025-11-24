/**
 * HwahaeSaleStatusExtractor Test
 *
 * 목적: 화해 판매 상태 추출 로직 검증 (API 기반)
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { HwahaeSaleStatusExtractor } from "@/extractors/hwahae/HwahaeSaleStatusExtractor";
import { SaleStatus } from "@/extractors/base";
import type { SaleStatusData } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

describe("HwahaeSaleStatusExtractor", () => {
  let extractor: HwahaeSaleStatusExtractor;

  beforeEach(() => {
    extractor = new HwahaeSaleStatusExtractor();
  });

  describe("extract() - 판매 상태 추출", () => {
    it("SELNG → InStock으로 변환해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 123,
        name: "판매중 상품",
        title_images: [],
        consumer_price: 15000,
        price: 15000,
        sale_status: "SELNG", // 판매중
      };

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it("SLDOT → SoldOut으로 변환해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 456,
        name: "품절 상품",
        title_images: [],
        consumer_price: 15000,
        price: 15000,
        sale_status: "SLDOT", // 품절
      };

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.isAvailable).toBe(false);
    });

    it("STSEL → Discontinued로 변환해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 789,
        name: "판매중지 상품",
        title_images: [],
        consumer_price: 15000,
        price: 15000,
        sale_status: "STSEL", // 판매중지
      };

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });
  });

  describe("isAvailable 플래그", () => {
    it("InStock일 때만 isAvailable=true여야 함", async () => {
      const inStockResponse: HwahaeApiResponse = {
        id: 1,
        name: "판매중",
        title_images: [],
        consumer_price: 10000,
        price: 10000,
        sale_status: "SELNG",
      };

      const soldOutResponse: HwahaeApiResponse = {
        id: 2,
        name: "품절",
        title_images: [],
        consumer_price: 10000,
        price: 10000,
        sale_status: "SLDOT",
      };

      const discontinuedResponse: HwahaeApiResponse = {
        id: 3,
        name: "판매중지",
        title_images: [],
        consumer_price: 10000,
        price: 10000,
        sale_status: "STSEL",
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

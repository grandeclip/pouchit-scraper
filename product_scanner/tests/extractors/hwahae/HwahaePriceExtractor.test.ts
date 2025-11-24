/**
 * HwahaePriceExtractor Test
 *
 * 목적: 화해 가격 추출 로직 검증 (API 기반)
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { HwahaePriceExtractor } from "@/extractors/hwahae/HwahaePriceExtractor";
import type { PriceData } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

describe("HwahaePriceExtractor", () => {
  let extractor: HwahaePriceExtractor;

  beforeEach(() => {
    extractor = new HwahaePriceExtractor();
  });

  describe("extract() - 가격 추출", () => {
    it("할인 상품의 가격 정보를 추출해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 123,
        name: "테스트 상품",
        title_images: [],
        consumer_price: 20000, // 정가
        price: 16000, // 판매가 (20% 할인)
        sale_status: "SELNG",
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(16000);
      expect(result.originalPrice).toBe(20000);
      expect(result.discountRate).toBe(20); // (20000-16000)/20000*100
      expect(result.currency).toBe("KRW");
    });

    it("할인 없는 상품은 discountRate가 undefined여야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 456,
        name: "할인없는 상품",
        title_images: [],
        consumer_price: 15000,
        price: 15000, // 정가=판매가
        sale_status: "SELNG",
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(15000);
      expect(result.originalPrice).toBe(15000);
      expect(result.discountRate).toBeUndefined();
      expect(result.currency).toBe("KRW");
    });

    it("정가가 0원이면 originalPrice는 undefined여야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 789,
        name: "정가 없는 상품",
        title_images: [],
        consumer_price: 0,
        price: 10000,
        sale_status: "SELNG",
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.price).toBe(10000);
      expect(result.originalPrice).toBeUndefined();
      expect(result.discountRate).toBeUndefined();
    });
  });

  describe("할인율 계산 로직", () => {
    it("정가보다 판매가가 높으면 discountRate는 undefined", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 100,
        name: "가격 역전 상품",
        title_images: [],
        consumer_price: 10000,
        price: 15000, // 판매가 > 정가
        sale_status: "SELNG",
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.discountRate).toBeUndefined();
    });

    it("할인율은 소수점 반올림해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 200,
        name: "33.33% 할인 상품",
        title_images: [],
        consumer_price: 30000,
        price: 20000, // 33.33%
        sale_status: "SELNG",
      };

      const result: PriceData = await extractor.extract(mockResponse);

      expect(result.discountRate).toBe(33); // 33.33% → 33
    });
  });
});

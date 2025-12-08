/**
 * KurlyPriceExtractor Test
 *
 * 목적: 마켓컬리 가격 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { KurlyPriceExtractor } from "@/extractors/kurly/KurlyPriceExtractor";
import type { PriceData } from "@/extractors/base";

describe("KurlyPriceExtractor", () => {
  let extractor: KurlyPriceExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new KurlyPriceExtractor();
    mockPage = {
      evaluate: jest.fn(),
      url: jest.fn().mockReturnValue("https://www.kurly.com/goods/1000284986"),
    } as any;
  });

  describe("extract() - SSR 데이터에서 가격 추출", () => {
    it("할인 상품: discountedPrice와 retailPrice 모두 추출", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        retailPrice: 14000,
        basePrice: 11900,
        discountedPrice: 9800,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(9800);
      expect(result.originalPrice).toBe(14000);
      expect(result.currency).toBe("KRW");
    });

    it("일반 상품: discountedPrice가 null이면 basePrice 사용", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        retailPrice: 20800,
        basePrice: 20800,
        discountedPrice: null,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(20800);
      expect(result.originalPrice).toBeUndefined(); // 정가 = 판매가
      expect(result.currency).toBe("KRW");
    });

    it("정가와 판매가가 같으면 originalPrice는 undefined", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        retailPrice: 15000,
        basePrice: 15000,
        discountedPrice: 15000,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(15000);
      expect(result.originalPrice).toBeUndefined();
    });

    it("retailPrice가 null이면 basePrice를 정가로 사용", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        retailPrice: null,
        basePrice: 12000,
        discountedPrice: 10000,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(10000);
      expect(result.originalPrice).toBe(12000);
    });

    it("SSR 데이터가 없으면 빈 가격 반환", async () => {
      (mockPage.evaluate as any).mockResolvedValue(null);

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(0);
      expect(result.currency).toBe("KRW");
    });

    it("SSR 파싱 에러 시 빈 가격 반환", async () => {
      (mockPage.evaluate as any).mockRejectedValue(
        new Error("SSR parsing error"),
      );

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(0);
      expect(result.currency).toBe("KRW");
    });

    it("모든 가격이 0이면 price는 0", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        retailPrice: 0,
        basePrice: 0,
        discountedPrice: null,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(0);
      expect(result.originalPrice).toBeUndefined();
    });

    it("discountedPrice만 있는 경우", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        retailPrice: null,
        basePrice: 0,
        discountedPrice: 8000,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(8000);
      expect(result.originalPrice).toBeUndefined(); // basePrice가 0이면 정가 없음
    });
  });
});

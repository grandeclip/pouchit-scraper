/**
 * AblyPriceExtractor Test
 *
 * 목적: 에이블리 가격 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { AblyPriceExtractor } from "@/extractors/ably/AblyPriceExtractor";
import type { PriceData } from "@/extractors/base";

describe("AblyPriceExtractor", () => {
  let extractor: AblyPriceExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new AblyPriceExtractor();
    mockPage = {
      evaluate: jest.fn(),
      url: jest.fn().mockReturnValue("https://m.a-bly.com/goods/12345"),
    } as any;
  });

  describe("extract() - SSR 데이터에서 가격 추출", () => {
    it("SSR 데이터에서 정가/판매가를 추출해야 함", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        consumer: 30000,
        thumbnail_price: 24000,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(24000);
      expect(result.originalPrice).toBe(30000);
      expect(result.currency).toBe("KRW");
    });

    it("SSR에 판매가만 있으면 판매가를 price로 사용", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        consumer: 0,
        thumbnail_price: 15000,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(15000);
      expect(result.originalPrice).toBeUndefined();
      expect(result.currency).toBe("KRW");
    });

    it("SSR에 정가만 있으면 정가를 price로 사용", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        consumer: 20000,
        thumbnail_price: 0,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(20000);
      expect(result.originalPrice).toBeUndefined();
      expect(result.currency).toBe("KRW");
    });

    it("정가와 판매가가 같으면 originalPrice 없이 반환", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        consumer: 18000,
        thumbnail_price: 18000,
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(18000);
      expect(result.originalPrice).toBeUndefined();
      expect(result.currency).toBe("KRW");
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

    it("가격이 문자열이면 숫자로 변환", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        consumer: "25000",
        thumbnail_price: "20000",
      });

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(20000);
      expect(result.originalPrice).toBe(25000);
    });
  });
});

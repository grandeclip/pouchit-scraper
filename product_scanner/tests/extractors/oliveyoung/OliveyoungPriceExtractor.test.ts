/**
 * OliveyoungPriceExtractor Test
 *
 * 목적: 올리브영 가격 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { OliveyoungPriceExtractor } from "@/extractors/oliveyoung/OliveyoungPriceExtractor";
import type { PriceData } from "@/extractors/base";
import { ConfigLoader } from "@/config/ConfigLoader";
import type { OliveyoungConfig } from "@/core/domain/OliveyoungConfig";

describe("OliveyoungPriceExtractor", () => {
  let extractor: OliveyoungPriceExtractor;
  let mockPage: Page;

  beforeEach(() => {
    // Load from YAML
    const config = ConfigLoader.getInstance().loadConfig(
      "oliveyoung",
    ) as OliveyoungConfig;
    extractor = new OliveyoungPriceExtractor(config.selectors?.price);
    mockPage = {
      $eval: jest.fn(),
      $$eval: jest.fn(),
    } as any;
  });

  describe("extract() - 가격 추출", () => {
    it("할인 없는 단일 가격을 추출해야 함", async () => {
      (mockPage.$eval as any).mockResolvedValue("15,000원");

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(15000);
      expect(result.originalPrice).toBeUndefined();
      expect(result.discountRate).toBeUndefined();
      expect(result.currency).toBe("KRW");
    });

    it("할인 있는 가격을 정가/판매가로 분리해야 함", async () => {
      (mockPage.$eval as any).mockResolvedValue("30% 20,000원 14,000원");

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(14000);
      expect(result.originalPrice).toBe(20000);
      expect(result.discountRate).toBe(30);
      expect(result.currency).toBe("KRW");
    });

    it("할인율 없으면 첫번째 숫자만 사용", async () => {
      (mockPage.$eval as any).mockResolvedValue("25,000원 20,000원"); // % 없음

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(25000); // % 없으면 첫번째만
      expect(result.originalPrice).toBeUndefined();
      expect(result.discountRate).toBeUndefined();
      expect(result.currency).toBe("KRW");
    });

    it("Mobile selector 우선 시도해야 함", async () => {
      (mockPage.$eval as any)
        .mockRejectedValueOnce(new Error("Not found")) // .info-group__price
        .mockResolvedValueOnce("15,000원"); // .prd_price

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(15000);
      expect(mockPage.$eval).toHaveBeenCalledTimes(2);
    });

    it("가격을 찾지 못하면 0원 반환", async () => {
      (mockPage.$eval as any).mockRejectedValue(new Error("Not found"));

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(0);
      expect(result.currency).toBe("KRW");
    });

    it("숫자가 3개 이상이면 첫번째=정가, 마지막=판매가", async () => {
      // "30% 배송비 3,000원 정가 20,000원 판매가 15,000원" 케이스
      (mockPage.$eval as any).mockResolvedValue("30% 3,000 20,000 15,000");

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.originalPrice).toBe(3000); // 첫번째
      expect(result.price).toBe(15000); // 마지막
      expect(result.discountRate).toBe(30);
    });

    it("할인율이 명시된 경우 우선 사용", async () => {
      (mockPage.$eval as any).mockResolvedValue("25% 20,000원 15,000원");

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.discountRate).toBe(25); // 명시된 25% 사용
    });

    it("쉼표 없는 4자리 숫자도 가격으로 인식", async () => {
      (mockPage.$eval as any).mockResolvedValue("9900원");

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.price).toBe(9900);
    });

    it("% 기호만 있고 할인율 숫자 없으면 discountRate는 undefined", async () => {
      (mockPage.$eval as any).mockResolvedValue("SALE% 18,000원 12,000원");

      const result: PriceData = await extractor.extract(mockPage);

      expect(result.originalPrice).toBe(18000);
      expect(result.price).toBe(12000);
      expect(result.discountRate).toBeUndefined(); // % 있지만 숫자 없음
    });
  });

  describe("selector 우선순위 (oliveyoung.yaml L350-353)", () => {
    it("1순위: .info-group__price (Mobile)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__price")
          return Promise.resolve("10,000원");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.price).toBe(10000);
      expect(mockPage.$eval).toHaveBeenCalledWith(
        ".info-group__price",
        expect.any(Function),
      );
    });

    it("2순위: .price (Desktop)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".price") return Promise.resolve("12,000원");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        ".price",
        expect.any(Function),
      );
    });

    it('3순위: [class*="price"]', async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === '[class*="price"]') return Promise.resolve("14,000원");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        '[class*="price"]',
        expect.any(Function),
      );
    });

    it("4순위: .prd_price", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".prd_price") return Promise.resolve("16,000원");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        ".prd_price",
        expect.any(Function),
      );
    });
  });

  describe("Edge Cases", () => {
    it("빈 문자열이면 0원 반환", async () => {
      (mockPage.$eval as any).mockResolvedValue("");

      const result = await extractor.extract(mockPage);

      expect(result.price).toBe(0);
    });

    it("null이면 0원 반환", async () => {
      (mockPage.$eval as any).mockResolvedValue(null);

      const result = await extractor.extract(mockPage);

      expect(result.price).toBe(0);
    });

    it("숫자가 1개만 있으면 단일 가격으로 처리", async () => {
      (mockPage.$eval as any).mockResolvedValue("8,500원");

      const result = await extractor.extract(mockPage);

      expect(result.price).toBe(8500);
      expect(result.originalPrice).toBeUndefined();
    });

    it("% 없으면 숫자 2개여도 단일 가격으로 처리", async () => {
      (mockPage.$eval as any).mockResolvedValue("10,000원 12,000원"); // % 없음

      const result = await extractor.extract(mockPage);

      expect(result.price).toBe(10000); // 첫번째만 사용
      expect(result.originalPrice).toBeUndefined();
      expect(result.discountRate).toBeUndefined();
    });
  });
});

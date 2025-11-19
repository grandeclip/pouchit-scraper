/**
 * IPriceExtractor Interface Test
 *
 * 목적: PriceData 인터페이스 구조 검증
 * TDD: RED 단계
 */

import { describe, it, expect } from "@jest/globals";
import type {
  IPriceExtractor,
  PriceData,
} from "@/extractors/base/IPriceExtractor";

describe("IPriceExtractor Interface", () => {
  describe("PriceData 타입 검증", () => {
    it("필수 필드를 포함해야 함", () => {
      const validData: PriceData = {
        price: 10000,
        currency: "KRW",
      };

      expect(validData.price).toBe(10000);
      expect(validData.currency).toBe("KRW");
    });

    it("할인 정보를 포함할 수 있음", () => {
      const dataWithDiscount: PriceData = {
        price: 8000,
        originalPrice: 10000,
        discountRate: 20,
        currency: "KRW",
      };

      expect(dataWithDiscount.originalPrice).toBe(10000);
      expect(dataWithDiscount.discountRate).toBe(20);
    });

    it("originalPrice 없이 price만 있을 수 있음", () => {
      const dataWithoutDiscount: PriceData = {
        price: 10000,
        currency: "KRW",
      };

      expect(dataWithoutDiscount.originalPrice).toBeUndefined();
      expect(dataWithoutDiscount.discountRate).toBeUndefined();
    });

    it("타입 안전성을 보장해야 함", () => {
      // 컴파일 타임 체크 - 이 코드가 타입 에러 없이 컴파일되어야 함
      const checkTypesSafety = (data: PriceData): void => {
        const _price: number = data.price;
        const _currency: string = data.currency;
        const _originalPrice: number | undefined = data.originalPrice;
        const _discountRate: number | undefined = data.discountRate;
      };

      expect(checkTypesSafety).toBeDefined();
    });
  });

  describe("IPriceExtractor 구현 검증", () => {
    it("extract 메서드를 구현해야 함", async () => {
      // Mock implementation for testing
      const mockExtractor: IPriceExtractor = {
        extract: async () => ({
          price: 10000,
          currency: "KRW",
        }),
      };

      const result = await mockExtractor.extract({} as any);
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("currency");
    });

    it("Promise<PriceData>를 반환해야 함", async () => {
      const mockExtractor: IPriceExtractor = {
        extract: async () => ({
          price: 15000,
          originalPrice: 20000,
          discountRate: 25,
          currency: "KRW",
        }),
      };

      const result = await mockExtractor.extract({} as any);
      expect(result).toMatchObject({
        price: 15000,
        originalPrice: 20000,
        discountRate: 25,
        currency: "KRW",
      });
    });
  });
});

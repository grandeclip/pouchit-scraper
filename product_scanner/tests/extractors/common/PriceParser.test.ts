/**
 * PriceParser Utility Test
 *
 * 목적: 가격 텍스트 파싱 유틸리티 검증
 * TDD: RED 단계
 */

import { describe, it, expect } from "@jest/globals";
import { PriceParser } from "@/extractors/common/PriceParser";

describe("PriceParser", () => {
  describe("extractNumbers - 가격 숫자 추출", () => {
    it("한국 가격 형식을 파싱해야 함", () => {
      const text = "15,000원";
      const result = PriceParser.extractNumbers(text);

      expect(result).toEqual(["15,000"]);
    });

    it("여러 가격을 추출해야 함", () => {
      const text = "20,000원 15,000원";
      const result = PriceParser.extractNumbers(text);

      expect(result).toEqual(["20,000", "15,000"]);
    });

    it("할인율 포함 텍스트에서 가격만 추출해야 함", () => {
      const text = "20% 20,000원 15,000원";
      const result = PriceParser.extractNumbers(text);

      expect(result).toEqual(["20,000", "15,000"]);
    });

    it("숫자가 없으면 빈 배열을 반환해야 함", () => {
      const text = "가격 정보 없음";
      const result = PriceParser.extractNumbers(text);

      expect(result).toEqual([]);
    });

    it("공백과 특수문자가 섞인 텍스트를 처리해야 함", () => {
      const text = "  정가: 20,000원\n판매가: 15,000원  ";
      const result = PriceParser.extractNumbers(text);

      expect(result).toEqual(["20,000", "15,000"]);
    });
  });

  describe("parse - 가격 숫자로 변환", () => {
    it("쉼표 포함 문자열을 숫자로 변환해야 함", () => {
      const price = PriceParser.parse("15,000");

      expect(price).toBe(15000);
    });

    it("원화 기호가 있어도 파싱해야 함", () => {
      const price = PriceParser.parse("15,000원");

      expect(price).toBe(15000);
    });

    it("null을 0으로 반환해야 함", () => {
      const price = PriceParser.parse(null);

      expect(price).toBe(0);
    });

    it("undefined를 0으로 반환해야 함", () => {
      const price = PriceParser.parse(undefined);

      expect(price).toBe(0);
    });

    it("빈 문자열을 0으로 반환해야 함", () => {
      const price = PriceParser.parse("");

      expect(price).toBe(0);
    });

    it("공백만 있는 문자열을 0으로 반환해야 함", () => {
      const price = PriceParser.parse("   ");

      expect(price).toBe(0);
    });

    it("숫자가 없는 문자열을 0으로 반환해야 함", () => {
      const price = PriceParser.parse("가격 없음");

      expect(price).toBe(0);
    });

    it("큰 숫자도 처리해야 함", () => {
      const price = PriceParser.parse("1,234,567");

      expect(price).toBe(1234567);
    });

    it("소수점이 있어도 정수로 변환해야 함", () => {
      const price = PriceParser.parse("15,000.99");

      expect(price).toBe(15000);
    });
  });

  describe("parseWithCurrency - 통화 포함 파싱", () => {
    it("KRW 통화 정보를 포함해야 함", () => {
      const result = PriceParser.parseWithCurrency("15,000원");

      expect(result).toEqual({
        amount: 15000,
        currency: "KRW",
      });
    });

    it("null을 처리해야 함", () => {
      const result = PriceParser.parseWithCurrency(null);

      expect(result).toEqual({
        amount: 0,
        currency: "KRW",
      });
    });
  });

  describe("calculateDiscountRate - 할인율 계산", () => {
    it("할인율을 정확히 계산해야 함", () => {
      const rate = PriceParser.calculateDiscountRate(15000, 20000);

      expect(rate).toBe(25);
    });

    it("소수점을 반올림해야 함", () => {
      const rate = PriceParser.calculateDiscountRate(16666, 20000);

      expect(rate).toBe(17); // 16.67 → 17
    });

    it("할인이 없으면 0을 반환해야 함", () => {
      const rate = PriceParser.calculateDiscountRate(20000, 20000);

      expect(rate).toBe(0);
    });

    it("원가가 0이면 0을 반환해야 함", () => {
      const rate = PriceParser.calculateDiscountRate(15000, 0);

      expect(rate).toBe(0);
    });

    it("판매가가 더 크면 0을 반환해야 함", () => {
      const rate = PriceParser.calculateDiscountRate(25000, 20000);

      expect(rate).toBe(0);
    });
  });
});

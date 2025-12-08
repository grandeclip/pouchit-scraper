/**
 * KurlyExtractor Test
 *
 * 목적: 마켓컬리 통합 Extractor (Facade) 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { Page } from "playwright";
import { KurlyExtractor } from "@/extractors/kurly/KurlyExtractor";
import { SaleStatus } from "@/extractors/base";

// DOMHelper mock
jest.mock("@/extractors/common/DOMHelper", () => ({
  DOMHelper: {
    safeAttribute: jest.fn(),
  },
}));

describe("KurlyExtractor", () => {
  let extractor: KurlyExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new KurlyExtractor();
    mockPage = {
      evaluate: jest.fn(),
      url: jest.fn().mockReturnValue("https://www.kurly.com/goods/1000284986"),
      $: jest.fn(),
    } as any;

    jest.clearAllMocks();
  });

  describe("extract() - 통합 추출", () => {
    it("모든 데이터를 병렬로 추출해야 함", async () => {
      // SSR 응답 시뮬레이션 (순서: metadata → price → saleStatus)
      (mockPage.evaluate as any)
        // Metadata extractor
        .mockResolvedValueOnce({
          name: "[클리오] 벨벳 립 펜슬 12종",
          mainImageUrl: "https://product-image.kurly.com/image.png",
          brand: "클리오",
        })
        // Price extractor
        .mockResolvedValueOnce({
          retailPrice: 14000,
          basePrice: 11900,
          discountedPrice: 9800,
        })
        // SaleStatus extractor
        .mockResolvedValueOnce({
          isSoldOut: false,
          found: true,
        });

      const result = await extractor.extract(mockPage);

      // Price 검증
      expect(result.price.price).toBe(9800);
      expect(result.price.originalPrice).toBe(14000);
      expect(result.price.currency).toBe("KRW");

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);

      // Metadata 검증
      expect(result.metadata.productName).toBe("[클리오] 벨벳 립 펜슬 12종");
      expect(result.metadata.brand).toBe("클리오");
      expect(result.metadata.thumbnail).toBe(
        "https://product-image.kurly.com/image.png",
      );
    });

    it("품절 상품도 정상 추출해야 함", async () => {
      // 순서: metadata → price → saleStatus
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({
          name: "품절 상품",
          mainImageUrl: "https://kurly.com/soldout.png",
          brand: undefined,
        })
        .mockResolvedValueOnce({
          retailPrice: 20000,
          basePrice: 20000,
          discountedPrice: null,
        })
        .mockResolvedValueOnce({
          isSoldOut: true,
          found: true,
        });

      const result = await extractor.extract(mockPage);

      expect(result.price.price).toBe(20000);
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.metadata.productName).toBe("품절 상품");
    });

    it("SSR 데이터가 없어도 기본값 반환", async () => {
      // 순서: metadata → price → saleStatus
      (mockPage.evaluate as any)
        .mockResolvedValueOnce(null) // Metadata (triggers meta fallback)
        .mockResolvedValueOnce(null) // Price
        .mockResolvedValueOnce(null); // SaleStatus

      // Meta tag fallback mock
      const { DOMHelper } = require("@/extractors/common/DOMHelper");
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("Meta 상품명")
        .mockResolvedValueOnce("https://kurly.com/meta.jpg");

      const result = await extractor.extract(mockPage);

      expect(result.price.price).toBe(0);
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.metadata.productName).toBe("Meta 상품명");
    });

    it("INFO_CHANGED 상태 처리 (isSoldOut=null)", async () => {
      // 순서: metadata → price → saleStatus
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({
          name: "정보 변경 상품",
          mainImageUrl: "https://kurly.com/changed.png",
          brand: undefined,
        })
        .mockResolvedValueOnce({
          retailPrice: 15000,
          basePrice: 15000,
          discountedPrice: 15000,
        })
        .mockResolvedValueOnce({
          isSoldOut: null,
          found: true,
        });

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus.saleStatus).toBe(SaleStatus.Discontinued);
    });

    it("부분 에러 시에도 나머지 데이터 추출", async () => {
      // 순서: metadata → price → saleStatus
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({
          name: "부분 에러 상품",
          mainImageUrl: "https://kurly.com/partial.png",
          brand: "브랜드",
        })
        .mockRejectedValueOnce(new Error("Price error")) // Price 실패
        .mockResolvedValueOnce({
          isSoldOut: false,
          found: true,
        });

      const result = await extractor.extract(mockPage);

      // Price는 기본값
      expect(result.price.price).toBe(0);
      // SaleStatus, Metadata는 정상
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
      expect(result.metadata.productName).toBe("부분 에러 상품");
    });
  });

  describe("결과 구조 검증", () => {
    it("결과 객체에 price, saleStatus, metadata 필드가 있어야 함", async () => {
      // 순서: metadata → price → saleStatus
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({
          name: "테스트 상품",
          mainImageUrl: "https://kurly.com/test.png",
          brand: undefined,
        })
        .mockResolvedValueOnce({
          retailPrice: 10000,
          basePrice: 10000,
          discountedPrice: 10000,
        })
        .mockResolvedValueOnce({
          isSoldOut: false,
          found: true,
        });

      const result = await extractor.extract(mockPage);

      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("saleStatus");
      expect(result).toHaveProperty("metadata");

      expect(result.price).toHaveProperty("price");
      expect(result.price).toHaveProperty("currency");
      expect(result.saleStatus).toHaveProperty("saleStatus");
      expect(result.metadata).toHaveProperty("productName");
      expect(result.metadata).toHaveProperty("images");
    });
  });

  describe("URL 정규화", () => {
    it("썸네일 URL에서 쿼리 파라미터 제거", async () => {
      // 순서: metadata → price → saleStatus
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({
          name: "상품",
          mainImageUrl: "https://product-image.kurly.com/image.png?w=720&h=936",
          brand: undefined,
        })
        .mockResolvedValueOnce({
          retailPrice: 10000,
          basePrice: 10000,
          discountedPrice: 10000,
        })
        .mockResolvedValueOnce({
          isSoldOut: false,
          found: true,
        });

      const result = await extractor.extract(mockPage);

      expect(result.metadata.thumbnail).toBe(
        "https://product-image.kurly.com/image.png",
      );
    });
  });
});

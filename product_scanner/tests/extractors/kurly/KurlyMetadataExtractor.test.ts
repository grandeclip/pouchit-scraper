/**
 * KurlyMetadataExtractor Test
 *
 * 목적: 마켓컬리 메타데이터 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { Page } from "playwright";
import { KurlyMetadataExtractor } from "@/extractors/kurly/KurlyMetadataExtractor";
import type { MetadataData } from "@/extractors/base";

// DOMHelper mock
jest.mock("@/extractors/common/DOMHelper", () => ({
  DOMHelper: {
    safeAttribute: jest.fn(),
  },
}));

import { DOMHelper } from "@/extractors/common/DOMHelper";

describe("KurlyMetadataExtractor", () => {
  let extractor: KurlyMetadataExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new KurlyMetadataExtractor();
    mockPage = {
      evaluate: jest.fn(),
      url: jest.fn().mockReturnValue("https://www.kurly.com/goods/1000284986"),
      $: jest.fn(),
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("extract() - SSR 데이터에서 메타데이터 추출", () => {
    it("SSR 데이터에서 완전한 메타데이터를 추출해야 함", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "[클리오] 벨벳 립 펜슬 샤프너 증정 기획 12종",
        mainImageUrl:
          "https://product-image.kurly.com/product/image/f207b48a.png?size=720",
        brand: "클리오",
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe(
        "[클리오] 벨벳 립 펜슬 샤프너 증정 기획 12종",
      );
      expect(result.brand).toBe("클리오");
      // URL 정규화 검증 (쿼리 파라미터 제거)
      expect(result.thumbnail).toBe(
        "https://product-image.kurly.com/product/image/f207b48a.png",
      );
      expect(result.images).toEqual([]);
    });

    it("SSR에서 브랜드가 없으면 undefined", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "노브랜드 상품",
        mainImageUrl: "https://product-image.kurly.com/image.png",
        brand: undefined,
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("노브랜드 상품");
      expect(result.brand).toBeUndefined();
      expect(result.thumbnail).toBe(
        "https://product-image.kurly.com/image.png",
      );
    });

    it("SSR에서 이미지가 없으면 thumbnail은 undefined", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "이미지 없는 상품",
        mainImageUrl: "",
        brand: "브랜드A",
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("이미지 없는 상품");
      expect(result.thumbnail).toBeUndefined();
    });

    it("SSR 데이터가 없으면 Meta tag fallback 시도", async () => {
      (mockPage.evaluate as any).mockResolvedValue(null);
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("마켓컬리 상품명")
        .mockResolvedValueOnce("https://kurly.com/meta-image.jpg?w=100");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("마켓컬리 상품명");
      // URL 정규화
      expect(result.thumbnail).toBe("https://kurly.com/meta-image.jpg");
      expect(result.brand).toBeUndefined();
    });
  });

  describe("Meta tag fallback", () => {
    beforeEach(() => {
      (mockPage.evaluate as any).mockResolvedValue(null); // SSR 없음
    });

    it("og:title에서 상품명을 추출해야 함", async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("컬리 상품명")
        .mockResolvedValueOnce("");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("컬리 상품명");
    });

    it("og:title이 없으면 빈 문자열", async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("")
        .mockResolvedValueOnce("https://kurly.com/image.jpg");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("");
    });

    it("og:image가 없으면 thumbnail은 undefined", async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("상품명")
        .mockResolvedValueOnce("");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.thumbnail).toBeUndefined();
    });

    it("Meta tag로부터 추출 시 images는 빈 배열", async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("상품명")
        .mockResolvedValueOnce("https://kurly.com/image.jpg");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.images).toEqual([]);
    });

    it("SSR 파싱 에러 시 Meta tag fallback으로 전환", async () => {
      (mockPage.evaluate as any).mockRejectedValue(new Error("SSR error"));
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("Fallback 상품")
        .mockResolvedValueOnce("https://kurly.com/fallback.jpg");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("Fallback 상품");
      expect(result.thumbnail).toBe("https://kurly.com/fallback.jpg");
    });
  });

  describe("우선순위 검증", () => {
    it("SSR이 있으면 Meta tag를 확인하지 않음", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "SSR 상품",
        mainImageUrl: "https://kurly.com/ssr.jpg",
        brand: "SSR 브랜드",
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("SSR 상품");
      expect(DOMHelper.safeAttribute).not.toHaveBeenCalled();
    });
  });

  describe("URL 정규화", () => {
    it("쿼리 파라미터가 있는 URL에서 제거해야 함", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "상품",
        mainImageUrl:
          "https://product-image.kurly.com/image.png?w=720&h=936&quality=85",
        brand: undefined,
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://product-image.kurly.com/image.png",
      );
    });

    it("쿼리 파라미터가 없는 URL은 그대로 유지", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "상품",
        mainImageUrl: "https://product-image.kurly.com/image.png",
        brand: undefined,
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://product-image.kurly.com/image.png",
      );
    });
  });
});

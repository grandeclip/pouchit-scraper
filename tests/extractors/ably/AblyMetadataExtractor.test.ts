/**
 * AblyMetadataExtractor Test
 *
 * 목적: 에이블리 메타데이터 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { Page } from "playwright";
import { AblyMetadataExtractor } from "@/extractors/ably/AblyMetadataExtractor";
import type { MetadataData } from "@/extractors/base";

// DOMHelper mock
jest.mock("@/extractors/common/DOMHelper", () => ({
  DOMHelper: {
    safeAttribute: jest.fn(),
  },
}));

import { DOMHelper } from "@/extractors/common/DOMHelper";

describe("AblyMetadataExtractor", () => {
  let extractor: AblyMetadataExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new AblyMetadataExtractor();
    mockPage = {
      evaluate: jest.fn(),
      url: jest.fn().mockReturnValue("https://m.a-bly.com/goods/12345"),
      $: jest.fn(), // DOMHelper.safeAttribute 용
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("extract() - SSR 데이터에서 메타데이터 추출", () => {
    it("SSR 데이터에서 완전한 메타데이터를 추출해야 함", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "에이블리 원피스",
        brand: "브랜드A",
        coverImages: [
          "https://ably.com/image1.jpg",
          "https://ably.com/image2.jpg",
          "https://ably.com/image3.jpg",
        ],
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("에이블리 원피스");
      expect(result.brand).toBe("브랜드A");
      expect(result.thumbnail).toBe("https://ably.com/image1.jpg");
      expect(result.images).toEqual([
        "https://ably.com/image2.jpg",
        "https://ably.com/image3.jpg",
      ]);
    });

    it("SSR에서 브랜드가 없으면 undefined", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "노브랜드 상품",
        brand: "",
        coverImages: ["https://ably.com/image1.jpg"],
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("노브랜드 상품");
      expect(result.brand).toBeUndefined();
      expect(result.thumbnail).toBe("https://ably.com/image1.jpg");
    });

    it("SSR에서 이미지가 1개만 있으면 images는 빈 배열", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "단일 이미지 상품",
        brand: "브랜드B",
        coverImages: ["https://ably.com/single.jpg"],
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe("https://ably.com/single.jpg");
      expect(result.images).toEqual([]);
    });

    it("SSR 데이터가 없으면 Meta tag fallback 시도", async () => {
      (mockPage.evaluate as any).mockResolvedValue(null);
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("상품명 - 에이블리 스토어") // og:title
        .mockResolvedValueOnce("https://ably.com/meta-image.jpg"); // og:image

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("상품명"); // "- 에이블리" 제거됨
      expect(result.thumbnail).toBe("https://ably.com/meta-image.jpg");
      expect(result.brand).toBeUndefined();
    });
  });

  describe("Meta tag fallback", () => {
    beforeEach(() => {
      (mockPage.evaluate as any).mockResolvedValue(null); // SSR 없음
    });

    it('og:title에서 "- 에이블리" 부분을 제거해야 함', async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("멋진 상품 - 에이블리 스토어")
        .mockResolvedValueOnce("");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("멋진 상품");
    });

    it("og:title이 없으면 빈 문자열", async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("") // og:title 없음
        .mockResolvedValueOnce("https://ably.com/image.jpg");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("");
    });

    it("og:image가 없으면 thumbnail은 undefined", async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("상품명")
        .mockResolvedValueOnce(""); // og:image 없음

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.thumbnail).toBeUndefined();
    });

    it("Meta tag로부터 추출 시 images는 빈 배열", async () => {
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("상품명")
        .mockResolvedValueOnce("https://ably.com/image.jpg");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.images).toEqual([]);
    });

    it("SSR 파싱 에러 시 Meta tag fallback으로 전환", async () => {
      (mockPage.evaluate as any).mockRejectedValue(new Error("SSR error"));
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("Fallback 상품")
        .mockResolvedValueOnce("https://ably.com/fallback.jpg");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("Fallback 상품");
      expect(result.thumbnail).toBe("https://ably.com/fallback.jpg");
    });
  });

  describe("우선순위 검증", () => {
    it("SSR이 있으면 Meta tag를 확인하지 않음", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        name: "SSR 상품",
        brand: "SSR 브랜드",
        coverImages: ["https://ably.com/ssr.jpg"],
      });

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("SSR 상품");
      expect(DOMHelper.safeAttribute).not.toHaveBeenCalled();
    });
  });
});

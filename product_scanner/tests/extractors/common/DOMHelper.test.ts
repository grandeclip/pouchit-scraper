/**
 * DOMHelper Utility Test
 *
 * 목적: Playwright Page DOM 접근 헬퍼 검증
 * TDD: RED 단계
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { DOMHelper } from "@/extractors/common/DOMHelper";
import type { Page } from "playwright";

describe("DOMHelper", () => {
  let mockPage: any;

  beforeEach(() => {
    // Mock Page 객체 초기화
    mockPage = {
      $eval: jest.fn(),
      locator: jest.fn(),
    };
  });

  describe("safeText - 안전한 텍스트 추출", () => {
    it("요소가 있으면 텍스트를 반환해야 함", async () => {
      (mockPage.$eval as any).mockResolvedValue("상품명");

      const result = await DOMHelper.safeText(mockPage, ".product-name");

      expect(result).toBe("상품명");
      expect(mockPage.$eval).toHaveBeenCalledWith(
        ".product-name",
        expect.any(Function),
      );
    });

    it("요소가 없으면 기본값을 반환해야 함", async () => {
      (mockPage.$eval as any).mockRejectedValue(new Error("Element not found"));

      const result = await DOMHelper.safeText(mockPage, ".missing", "기본값");

      expect(result).toBe("기본값");
    });

    it("기본값이 없으면 빈 문자열을 반환해야 함", async () => {
      (mockPage.$eval as any).mockRejectedValue(new Error("Element not found"));

      const result = await DOMHelper.safeText(mockPage, ".missing");

      expect(result).toBe("");
    });

    it("null 텍스트를 빈 문자열로 변환해야 함", async () => {
      (mockPage.$eval as any).mockResolvedValue(null);

      const result = await DOMHelper.safeText(mockPage, ".null-text");

      expect(result).toBe("");
    });

    it("앞뒤 공백을 제거해야 함", async () => {
      (mockPage.$eval as any).mockResolvedValue("  상품명  ");

      const result = await DOMHelper.safeText(mockPage, ".product-name");

      expect(result).toBe("상품명");
    });
  });

  describe("querySelectorMobile - Mobile 우선 selector", () => {
    it("Mobile selector가 있으면 Mobile 텍스트를 반환해야 함", async () => {
      (mockPage.$eval as any)
        .mockResolvedValueOnce("모바일 텍스트") // mobile
        .mockResolvedValueOnce("데스크탑 텍스트"); // desktop (호출 안됨)

      const result = await DOMHelper.querySelectorMobile(
        mockPage,
        ".mobile",
        ".desktop",
      );

      expect(result).toBe("모바일 텍스트");
      expect(mockPage.$eval).toHaveBeenCalledTimes(1);
    });

    it("Mobile selector가 없으면 Desktop selector로 fallback 해야 함", async () => {
      (mockPage.$eval as any)
        .mockRejectedValueOnce(new Error("Not found")) // mobile
        .mockResolvedValueOnce("데스크탑 텍스트"); // desktop

      const result = await DOMHelper.querySelectorMobile(
        mockPage,
        ".mobile",
        ".desktop",
      );

      expect(result).toBe("데스크탑 텍스트");
      expect(mockPage.$eval).toHaveBeenCalledTimes(2);
    });

    it("둘 다 없으면 빈 문자열을 반환해야 함", async () => {
      (mockPage.$eval as any).mockRejectedValue(new Error("Not found"));

      const result = await DOMHelper.querySelectorMobile(
        mockPage,
        ".mobile",
        ".desktop",
      );

      expect(result).toBe("");
      expect(mockPage.$eval).toHaveBeenCalledTimes(2);
    });
  });

  describe("safeAttribute - 안전한 속성 추출", () => {
    it("속성이 있으면 값을 반환해야 함", async () => {
      (mockPage.$eval as any).mockResolvedValue(
        "https://example.com/image.jpg",
      );

      const result = await DOMHelper.safeAttribute(
        mockPage,
        "img.thumbnail",
        "src",
      );

      expect(result).toBe("https://example.com/image.jpg");
    });

    it("속성이 없으면 기본값을 반환해야 함", async () => {
      (mockPage.$eval as any).mockResolvedValue(null);

      const result = await DOMHelper.safeAttribute(
        mockPage,
        "img.missing",
        "src",
        "default.jpg",
      );

      expect(result).toBe("default.jpg");
    });

    it("요소가 없으면 빈 문자열을 반환해야 함", async () => {
      (mockPage.$eval as any).mockRejectedValue(new Error("Element not found"));

      const result = await DOMHelper.safeAttribute(
        mockPage,
        ".missing",
        "href",
      );

      expect(result).toBe("");
    });
  });

  describe("hasElement - 요소 존재 여부 확인", () => {
    it("요소가 있으면 true를 반환해야 함", async () => {
      const mockLocator = {
        count: (jest.fn() as any).mockResolvedValue(1),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);

      const result = await DOMHelper.hasElement(mockPage, ".exists");

      expect(result).toBe(true);
    });

    it("요소가 없으면 false를 반환해야 함", async () => {
      const mockLocator = {
        count: (jest.fn() as any).mockResolvedValue(0),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);

      const result = await DOMHelper.hasElement(mockPage, ".missing");

      expect(result).toBe(false);
    });
  });
});

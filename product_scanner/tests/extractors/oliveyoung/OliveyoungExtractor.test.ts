/**
 * OliveyoungExtractor Test
 *
 * 목적: 올리브영 통합 Extractor 검증 (Facade Pattern)
 * 패턴: Facade Pattern - Price, SaleStatus, Metadata 통합
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { OliveyoungExtractor } from "@/extractors/oliveyoung/OliveyoungExtractor";
import type { ProductData } from "@/extractors/base";

describe("OliveyoungExtractor", () => {
  let extractor: OliveyoungExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new OliveyoungExtractor();
    mockPage = {
      $eval: jest.fn(),
      $$eval: jest.fn(),
      locator: jest.fn(),
    } as any;
  });

  describe("extract() - 통합 추출", () => {
    it("모든 정보를 통합 추출해야 함", async () => {
      // Mock setup: metadata, price, saleStatus 통합
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        // Metadata
        if (selector === ".info-group__title")
          return Promise.resolve("에스트라 크림");
        if (selector === ".top-utils__brand-link")
          return Promise.resolve("아모레퍼시픽");
        if (selector === ".swiper-slide-active img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
          );

        // Price
        if (selector === ".info-group__price")
          return Promise.resolve("30% 20,000원 14,000원");

        // SaleStatus - Mobile 버튼 텍스트
        if (selector === "#publBtnBuy") return Promise.resolve("바로구매");

        return Promise.reject(new Error("Not found"));
      });

      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);

      // SaleStatus - 요소 존재 체크
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValueOnce(0) // .error_title 없음
        .mockResolvedValueOnce(1); // #publBtnBuy 있음

      const result: ProductData = await extractor.extract(mockPage);

      // Metadata 검증
      expect(result.metadata.productName).toBe("에스트라 크림");
      expect(result.metadata.brand).toBe("아모레퍼시픽");
      expect(result.metadata.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );

      // Price 검증
      expect(result.price.price).toBe(14000);
      expect(result.price.originalPrice).toBe(20000);
      expect(result.price.discountRate).toBe(30);

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe("InStock");
      expect(result.saleStatus.isAvailable).toBe(true);
    });

    it("병렬 추출로 성능 최적화해야 함", async () => {
      // Mock setup
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".info-group__price")
          return Promise.resolve("15,000원");
        if (selector === "#publBtnBuy") return Promise.resolve("바로구매");
        return Promise.reject(new Error("Not found"));
      });

      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name
        .mockResolvedValueOnce(0) // .error_title
        .mockResolvedValueOnce(1); // #publBtnBuy

      const startTime = Date.now();
      await extractor.extract(mockPage);
      const duration = Date.now() - startTime;

      // 병렬 처리로 100ms 이내 완료 (순차 처리보다 빠름)
      expect(duration).toBeLessThan(100);
    });
  });

  describe("Facade Pattern 구조", () => {
    it("PriceExtractor, SaleStatusExtractor, MetadataExtractor를 조합해야 함", async () => {
      // Mock setup
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".info-group__price")
          return Promise.resolve("10,000원");
        return Promise.reject(new Error("Not found"));
      });

      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      (mockPage.$eval as any).mockResolvedValueOnce("바로구매");

      const result = await extractor.extract(mockPage);

      // 3가지 Extractor 결과 통합 확인
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("saleStatus");
    });

    it("각 Extractor는 독립적으로 동작해야 함", async () => {
      // 메타데이터만 성공, 나머지 실패
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        return Promise.reject(new Error("Not found"));
      });

      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any).mockResolvedValue(0); // 모든 SaleStatus 체크 실패

      const result = await extractor.extract(mockPage);

      // Metadata 성공
      expect(result.metadata.productName).toBe("상품명");

      // Price 실패 (0원)
      expect(result.price.price).toBe(0);

      // SaleStatus 실패 (Discontinued)
      expect(result.saleStatus.saleStatus).toBe("Discontinued");
    });
  });

  describe("Edge Cases", () => {
    it("모든 추출 실패 시에도 기본 구조 반환", async () => {
      (mockPage.$eval as any).mockRejectedValue(new Error("Not found"));

      const mockLocator = {
        count: jest.fn().mockResolvedValue(0),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);

      const result = await extractor.extract(mockPage);

      expect(result.metadata.productName).toBe("");
      expect(result.price.price).toBe(0);
      expect(result.saleStatus.saleStatus).toBe("Discontinued");
    });

    it("부분 성공 시에도 정상 동작", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".info-group__price")
          return Promise.resolve("15,000원");
        return Promise.reject(new Error("Not found"));
      });

      const mockLocator = {
        count: jest.fn().mockResolvedValue(0),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);

      const result = await extractor.extract(mockPage);

      // 성공한 부분
      expect(result.metadata.productName).toBe("상품명");
      expect(result.price.price).toBe(15000);

      // 실패한 부분 (기본값)
      expect(result.saleStatus.saleStatus).toBe("Discontinued");
    });
  });

  describe("ProductData 타입 검증", () => {
    it("ProductData 인터페이스를 준수해야 함", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".info-group__price")
          return Promise.resolve("10,000원");
        return Promise.reject(new Error("Not found"));
      });

      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      (mockPage.$eval as any).mockResolvedValueOnce("바로구매");

      const result: ProductData = await extractor.extract(mockPage);

      // TypeScript 타입 체크
      expect(result).toMatchObject({
        metadata: expect.objectContaining({
          productName: expect.any(String),
        }),
        price: expect.objectContaining({
          price: expect.any(Number),
          currency: expect.any(String),
        }),
        saleStatus: expect.objectContaining({
          saleStatus: expect.any(String),
          isAvailable: expect.any(Boolean),
        }),
      });
    });
  });
});

/**
 * AblyExtractor Test
 *
 * 목적: 에이블리 통합 Extractor 검증 (Facade Pattern)
 * 패턴: Facade Pattern - Price, SaleStatus, Metadata 통합
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { Page } from "playwright";
import { AblyExtractor } from "@/extractors/ably/AblyExtractor";
import type { ProductData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";

// DOMHelper mock
jest.mock("@/extractors/common/DOMHelper", () => ({
  DOMHelper: {
    safeAttribute: jest.fn(),
  },
}));

import { DOMHelper } from "@/extractors/common/DOMHelper";

describe("AblyExtractor", () => {
  let extractor: AblyExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new AblyExtractor();
    mockPage = {
      evaluate: jest.fn(),
      textContent: jest.fn(),
      url: jest.fn(() => "https://m.a-bly.com/goods/12345"),
    } as any;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("extract() - SSR 데이터에서 통합 추출", () => {
    it("SSR 데이터에서 모든 정보를 통합 추출해야 함", async () => {
      // Mock SSR 데이터 - Promise.all 병렬 실행 대응
      (mockPage.evaluate as any).mockImplementation((fn: Function) => {
        const fnStr = fn.toString();

        // PriceExtractor 감지: price_info 체크
        if (fnStr.includes("price_info")) {
          return Promise.resolve({
            consumer: 30000,
            thumbnail_price: 24000,
          });
        }

        // MetadataExtractor 감지: goods.name 체크
        if (fnStr.includes("goods.name")) {
          return Promise.resolve({
            name: "에이블리 원피스",
            brand: "브랜드A",
            coverImages: [
              "https://m.a-bly.com/image1.jpg",
              "https://m.a-bly.com/image2.jpg",
            ],
          });
        }

        // SaleStatusExtractor 감지: sale_type 체크
        if (fnStr.includes("sale_type")) {
          return Promise.resolve("ON_SALE");
        }

        return Promise.resolve(null);
      });

      const result: ProductData = await extractor.extract(mockPage);

      // Price 검증
      expect(result.price.price).toBe(24000);
      expect(result.price.originalPrice).toBe(30000);
      expect(result.price.currency).toBe("KRW");

      // Metadata 검증
      expect(result.metadata.productName).toBe("에이블리 원피스");
      expect(result.metadata.brand).toBe("브랜드A");
      expect(result.metadata.thumbnail).toBe("https://m.a-bly.com/image1.jpg");
      expect(result.metadata.images).toEqual([
        "https://m.a-bly.com/image2.jpg",
      ]);

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
      expect(result.saleStatus.isAvailable).toBe(true);
    });

    it("병렬 추출로 성능 최적화해야 함", async () => {
      // Mock SSR 데이터
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({
          consumer: 20000,
          thumbnail_price: 18000,
        })
        .mockResolvedValueOnce({
          name: "상품명",
          brand: "브랜드",
          coverImages: ["https://m.a-bly.com/img.jpg"],
        })
        .mockResolvedValueOnce("ON_SALE");

      const startTime = Date.now();
      await extractor.extract(mockPage);
      const duration = Date.now() - startTime;

      // 병렬 처리로 100ms 이내 완료
      expect(duration).toBeLessThan(100);
    });
  });

  describe("Facade Pattern 구조", () => {
    it("PriceExtractor, SaleStatusExtractor, MetadataExtractor를 조합해야 함", async () => {
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({ consumer: 15000, thumbnail_price: 12000 })
        .mockResolvedValueOnce({
          name: "상품",
          brand: "브랜드",
          coverImages: ["https://m.a-bly.com/1.jpg"],
        })
        .mockResolvedValueOnce("ON_SALE");

      const result = await extractor.extract(mockPage);

      // 3가지 Extractor 결과 통합 확인
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("saleStatus");
    });

    it("각 Extractor는 독립적으로 동작해야 함", async () => {
      // Metadata만 성공, 나머지는 fallback
      (mockPage.evaluate as any).mockImplementation((fn: Function) => {
        const fnStr = fn.toString();

        // PriceExtractor: SSR 실패
        if (fnStr.includes("price_info")) {
          return Promise.resolve(null);
        }

        // MetadataExtractor: SSR 성공
        if (fnStr.includes("goods.name")) {
          return Promise.resolve({
            name: "상품명",
            brand: "브랜드",
            coverImages: ["https://m.a-bly.com/img.jpg"],
          });
        }

        // SaleStatusExtractor: SSR 실패
        if (fnStr.includes("sale_type")) {
          return Promise.resolve(null);
        }

        return Promise.resolve(null);
      });

      (mockPage.textContent as any).mockResolvedValue("정상 페이지");

      const result = await extractor.extract(mockPage);

      // Metadata 성공
      expect(result.metadata.productName).toBe("상품명");

      // Price fallback (0원)
      expect(result.price.price).toBe(0);

      // SaleStatus fallback (InStock)
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
    });
  });

  describe("Meta tag fallback", () => {
    it("SSR 실패 시 Meta tag로 fallback해야 함", async () => {
      // 모든 SSR 데이터 실패
      (mockPage.evaluate as any).mockResolvedValue(null);

      // Meta tag fallback
      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("상품명 - 에이블리 스토어") // og:title
        .mockResolvedValueOnce("https://m.a-bly.com/meta.jpg"); // og:image

      (mockPage.textContent as any).mockResolvedValue("정상 페이지");

      const result = await extractor.extract(mockPage);

      // Meta tag 추출 성공
      expect(result.metadata.productName).toBe("상품명"); // "- 에이블리" 제거됨
      expect(result.metadata.thumbnail).toBe("https://m.a-bly.com/meta.jpg");
      expect(result.metadata.brand).toBeUndefined();

      // Price는 0원
      expect(result.price.price).toBe(0);

      // SaleStatus는 InStock (기본값)
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
    });
  });

  describe("Edge Cases", () => {
    it("모든 추출 실패 시에도 기본 구조 반환", async () => {
      (mockPage.evaluate as any).mockRejectedValue(new Error("SSR error"));
      (DOMHelper.safeAttribute as any).mockResolvedValue("");
      (mockPage.textContent as any).mockResolvedValue(null);

      const result = await extractor.extract(mockPage);

      expect(result.metadata.productName).toBe("");
      expect(result.price.price).toBe(0);
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.Discontinued);
    });

    it("부분 성공 시에도 정상 동작", async () => {
      (mockPage.evaluate as any).mockImplementation((fn: Function) => {
        const fnStr = fn.toString();

        // PriceExtractor: SSR 성공
        if (fnStr.includes("price_info")) {
          return Promise.resolve({ consumer: 10000, thumbnail_price: 8000 });
        }

        // MetadataExtractor: SSR 실패 (Meta tag fallback)
        if (fnStr.includes("goods.name")) {
          return Promise.resolve(null);
        }

        // SaleStatusExtractor: SSR 성공
        if (fnStr.includes("sale_type")) {
          return Promise.resolve("SOLD_OUT");
        }

        return Promise.resolve(null);
      });

      (DOMHelper.safeAttribute as any)
        .mockResolvedValueOnce("Fallback 상품")
        .mockResolvedValueOnce("");

      const result = await extractor.extract(mockPage);

      // 성공한 부분
      expect(result.price.price).toBe(8000);
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.SoldOut);

      // Fallback으로 성공한 부분
      expect(result.metadata.productName).toBe("Fallback 상품");
    });
  });

  describe("ProductData 타입 검증", () => {
    it("ProductData 인터페이스를 준수해야 함", async () => {
      (mockPage.evaluate as any)
        .mockResolvedValueOnce({ consumer: 15000, thumbnail_price: 12000 })
        .mockResolvedValueOnce({
          name: "상품",
          brand: "브랜드",
          coverImages: ["https://m.a-bly.com/1.jpg"],
        })
        .mockResolvedValueOnce("ON_SALE");

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
          saleStatus: expect.any(Number), // Numeric enum
          isAvailable: expect.any(Boolean),
        }),
      });
    });
  });
});

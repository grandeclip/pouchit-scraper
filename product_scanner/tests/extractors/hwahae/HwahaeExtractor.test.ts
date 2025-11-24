/**
 * HwahaeExtractor Test
 *
 * 목적: 화해 통합 Extractor 검증 (Facade Pattern)
 * 패턴: Facade Pattern - Price, SaleStatus, Metadata 통합
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { HwahaeExtractor } from "@/extractors/hwahae/HwahaeExtractor";
import { SaleStatus } from "@/extractors/base";
import type { ProductData } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

describe("HwahaeExtractor", () => {
  let extractor: HwahaeExtractor;

  beforeEach(() => {
    extractor = new HwahaeExtractor();
  });

  describe("extract() - 통합 추출", () => {
    it("모든 정보를 통합 추출해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 123456,
        name: "테스트 상품명",
        title_images: [
          "https://example.com/image1.jpg",
          "https://example.com/image2.jpg",
        ],
        consumer_price: 20000, // 정가
        price: 16000, // 판매가 (20% 할인)
        sale_status: "SELNG", // 판매중
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // Metadata 검증
      expect(result.metadata.productName).toBe("테스트 상품명");
      expect(result.metadata.brand).toBeUndefined();
      expect(result.metadata.thumbnail).toBe("https://example.com/image1.jpg");
      expect(result.metadata.images).toEqual([
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg",
      ]);

      // Price 검증
      expect(result.price.price).toBe(16000);
      expect(result.price.originalPrice).toBe(20000);
      expect(result.price.discountRate).toBe(20);
      expect(result.price.currency).toBe("KRW");

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
      expect(result.saleStatus.isAvailable).toBe(true);
    });

    it("품절 상품도 정상 추출해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 789012,
        name: "품절 상품",
        title_images: ["https://example.com/soldout.jpg"],
        consumer_price: 15000,
        price: 15000,
        sale_status: "SLDOT", // 품절
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.saleStatus.isAvailable).toBe(false);

      // Price 검증 (할인 없음)
      expect(result.price.price).toBe(15000);
      expect(result.price.discountRate).toBeUndefined();

      // Metadata 검증
      expect(result.metadata.productName).toBe("품절 상품");
    });

    it("각 Extractor가 독립적으로 동작해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 111,
        name: "독립성 테스트",
        title_images: [],
        consumer_price: 10000,
        price: 10000,
        sale_status: "STSEL", // 판매중지
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // 3개 전문 Extractor의 결과가 모두 포함
      expect(result.metadata).toBeDefined();
      expect(result.metadata.productName).toBe("독립성 테스트");

      expect(result.price).toBeDefined();
      expect(result.price.price).toBe(10000);

      expect(result.saleStatus).toBeDefined();
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.Discontinued);
    });
  });

  describe("Facade Pattern 검증", () => {
    it("3개 전문 Extractor를 조합해야 함", () => {
      // Private 필드이므로 동작으로 검증
      expect(extractor).toHaveProperty("extract");
      expect(typeof extractor.extract).toBe("function");
    });

    it("extract 메서드는 ProductData를 반환해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 999,
        name: "반환 타입 검증",
        title_images: [],
        consumer_price: 5000,
        price: 5000,
        sale_status: "SELNG",
      };

      const result: ProductData = await extractor.extract(mockResponse);

      // ProductData 구조 검증
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("saleStatus");
    });
  });
});

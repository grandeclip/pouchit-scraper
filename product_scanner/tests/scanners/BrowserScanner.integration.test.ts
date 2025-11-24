/**
 * BrowserScanner Integration Test
 *
 * 목적: ExtractorRegistry + YAML 연동 검증
 * 범위: BrowserScanner.extractFromPage() + ExtractorRegistry + OliveyoungExtractor
 * 패턴: Integration Test (Unit Test 아님)
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { Page } from "playwright";
import { ExtractorRegistry } from "@/extractors/ExtractorRegistry";
import type { ProductData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";

describe("BrowserScanner Integration - ExtractorRegistry 연동", () => {
  let mockPage: Page;
  let registry: ExtractorRegistry;

  beforeEach(() => {
    // Mock Page 설정
    mockPage = {
      $eval: jest.fn(),
      $$: jest.fn(() => Promise.resolve([])),
      locator: jest.fn(),
      url: jest.fn(
        () =>
          "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000231509",
      ),
      textContent: jest.fn(() => Promise.resolve("정상 페이지")),
      evaluate: jest.fn() as any,
    } as any;

    // evaluate mock 설정
    (mockPage.evaluate as any).mockResolvedValue({
      // detectPageType용 mock 응답
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)",
      isMobileUA: true,
      pathname: "/m/goods/getGoodsDetail.do",
      isMobilePath: true,
      url: "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000231509",
      viewport: { width: 430, height: 932 },
      hasMobileLayout: true,
      hasDesktopLayout: false,
    });

    // ExtractorRegistry 인스턴스
    registry = ExtractorRegistry.getInstance();
  });

  describe("ExtractorRegistry.get() 호출", () => {
    it("oliveyoung extractor를 정상 조회해야 함", () => {
      const extractor = registry.get("oliveyoung");

      expect(extractor).toBeDefined();
      expect(extractor).toHaveProperty("extract");
      expect(typeof extractor.extract).toBe("function");
    });

    it("존재하지 않는 extractor 조회 시 에러", () => {
      expect(() => {
        registry.get("non-existent-platform");
      }).toThrow(/Extractor not found: non-existent-platform/);
    });
  });

  describe("Extractor.extract() 실행 (YAML extractor: 'oliveyoung')", () => {
    it("올리브영 상품 데이터를 정상 추출해야 함", async () => {
      // Mock setup: selector 기반 routing
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        // Metadata
        if (selector === ".info-group__title")
          return Promise.resolve("라로슈포제 시카플라스트 밤 B5");
        if (selector === ".top-utils__brand-link")
          return Promise.resolve("LA ROCHE POSAY");
        if (selector === ".swiper-slide-active img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/A00000012345678ko.jpg",
          );

        // Price
        if (selector === ".info-group__price")
          return Promise.resolve("20% 25,000원 20,000원");

        // SaleStatus
        if (selector === "#publBtnBuy") return Promise.resolve("바로구매");

        return Promise.reject(new Error("Not found"));
      });

      // Mock button elements
      const mockButton = {
        textContent: jest.fn(() => Promise.resolve("바로구매")),
        isVisible: jest.fn(() => Promise.resolve(true)),
      };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const mockLocator = { count: jest.fn() };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValueOnce(0); // .error_title 없음

      // Extractor 조회 및 실행
      const extractor = registry.get("oliveyoung");
      const result: ProductData = await extractor.extract(mockPage);

      // 검증: ProductData 구조
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("saleStatus");

      // Metadata 검증
      expect(result.metadata.productName).toBe("라로슈포제 시카플라스트 밤 B5");
      expect(result.metadata.brand).toBe("LA ROCHE POSAY");
      expect(result.metadata.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000012345678ko.jpg",
      );

      // Price 검증
      expect(result.price.price).toBe(20000);
      expect(result.price.originalPrice).toBe(25000);
      expect(result.price.discountRate).toBe(20);
      expect(result.price.currency).toBe("KRW");

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
      expect(result.saleStatus.isAvailable).toBe(true);
    });

    it("부분 실패 시 기본값 반환 (Graceful Degradation)", async () => {
      // Mock setup: Metadata만 성공, 나머지 실패
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        return Promise.reject(new Error("Not found"));
      });

      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any).mockResolvedValue(0);

      const extractor = registry.get("oliveyoung");
      const result: ProductData = await extractor.extract(mockPage);

      // Metadata 성공
      expect(result.metadata.productName).toBe("상품명");

      // Price 실패 (기본값)
      expect(result.price.price).toBe(0);

      // SaleStatus 실패 (기본값)
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.saleStatus.isAvailable).toBe(false);
    });
  });

  describe("YAML 설정 시나리오", () => {
    it("extraction.extractor: 'oliveyoung' 설정 시 정상 동작", async () => {
      // YAML: extraction.extractor = "oliveyoung"
      const extractorId = "oliveyoung";

      // Mock setup
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("테스트");
        if (selector === ".info-group__price")
          return Promise.resolve("10,000원");
        if (selector === "#publBtnBuy") return Promise.resolve("바로구매");
        return Promise.reject(new Error("Not found"));
      });

      const mockButton = {
        textContent: jest.fn(() => Promise.resolve("바로구매")),
        isVisible: jest.fn(() => Promise.resolve(true)),
      };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const mockLocator = { count: jest.fn() };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      // BrowserScanner가 수행할 동작 시뮬레이션
      const extractor = registry.get(extractorId);
      const result = await extractor.extract(mockPage);

      expect(result.metadata.productName).toBe("테스트");
      expect(result.price.price).toBe(10000);
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
    });

    it("잘못된 extractor ID 시 에러 발생", () => {
      // YAML: extraction.extractor = "invalid-platform"
      const extractorId = "invalid-platform";

      expect(() => {
        registry.get(extractorId);
      }).toThrow(/Extractor not found: invalid-platform/);
      expect(() => {
        registry.get(extractorId);
      }).toThrow(/Available:/);
    });
  });

  describe("Facade Pattern 검증", () => {
    it("3가지 Extractor 병렬 실행 확인", async () => {
      // Mock setup
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".info-group__price")
          return Promise.resolve("15,000원");
        if (selector === "#publBtnBuy") return Promise.resolve("바로구매");
        return Promise.reject(new Error("Not found"));
      });

      const mockButton = {
        textContent: jest.fn(() => Promise.resolve("바로구매")),
        isVisible: jest.fn(() => Promise.resolve(true)),
      };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const mockLocator = { count: jest.fn() };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      const startTime = Date.now();
      const extractor = registry.get("oliveyoung");
      await extractor.extract(mockPage);
      const duration = Date.now() - startTime;

      // 병렬 처리로 100ms 이내 완료
      expect(duration).toBeLessThan(100);
    });
  });
});

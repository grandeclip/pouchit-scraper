/**
 * OliveyoungSaleStatusExtractor Test
 *
 * 목적: 올리브영 판매 상태 추출 로직 검증
 * 표준: schema.org ItemAvailability 규약 준수
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { OliveyoungSaleStatusExtractor } from "@/extractors/oliveyoung/OliveyoungSaleStatusExtractor";
import type { SaleStatusData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";
import { ConfigLoader } from "@/config/ConfigLoader";
import type { OliveyoungConfig } from "@/core/domain/OliveyoungConfig";

describe("OliveyoungSaleStatusExtractor", () => {
  let extractor: OliveyoungSaleStatusExtractor;
  let mockPage: Page;

  // Helper: button mock 생성
  const createMockButton = (text: string, visible: boolean = true) => ({
    textContent: jest.fn().mockResolvedValue(text),
    isVisible: jest.fn().mockResolvedValue(visible),
  });

  beforeEach(() => {
    // Load from YAML
    const config = ConfigLoader.getInstance().loadConfig(
      "oliveyoung",
    ) as OliveyoungConfig;
    extractor = new OliveyoungSaleStatusExtractor(
      config.selectors,
      config.error_messages,
      config.error_url_patterns,
      config.button_text_patterns,
    );
    mockPage = {
      $eval: jest.fn(),
      $$eval: jest.fn(),
      $$: jest.fn(),
      locator: jest.fn(),
      url: jest.fn(
        () =>
          "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000231509",
      ),
      textContent: jest.fn(() => Promise.resolve("정상 페이지")),
    } as any;
  });

  describe("extract() - 8단계 체크 로직", () => {
    describe("1단계: 상품 정보 없음 체크", () => {
      it("상품명이 없으면 Discontinued 반환", async () => {
        const mockLocator = {
          count: jest.fn().mockResolvedValue(0), // .prd_name 없음
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.Discontinued);
        expect(result.isAvailable).toBe(false);
      });
    });

    describe("2단계: 404 페이지 체크", () => {
      it("404 에러 페이지면 Discontinued 반환", async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(1); // .error_title 있음 (404)

        (mockPage.$$ as any).mockResolvedValue([]);

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.Discontinued);
        expect(result.isAvailable).toBe(false);
      });
    });

    describe("3단계: Mobile 구매 버튼 체크", () => {
      it('버튼 텍스트가 "일시품절"이면 OutOfStock 반환', async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0); // .error_title 없음

        const mockButton = createMockButton("일시품절");
        (mockPage.$$ as any).mockResolvedValue([mockButton]);

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.OutOfStock);
        expect(result.isAvailable).toBe(false);
      });

      it('버튼 텍스트가 "바로구매"면 InStock 반환', async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0); // .error_title 없음

        const mockButton = createMockButton("바로구매");
        (mockPage.$$ as any).mockResolvedValue([mockButton]);

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.InStock);
        expect(result.isAvailable).toBe(true);
      });

      it('버튼 텍스트가 "전시기간 종료"면 Discontinued 반환', async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0); // .error_title 없음

        const mockButton = createMockButton("전시기간 종료");
        (mockPage.$$ as any).mockResolvedValue([mockButton]);

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.Discontinued);
        expect(result.isAvailable).toBe(false);
      });
    });

    describe("4단계: Desktop 버튼 체크", () => {
      it.skip('".btnBuy" 존재하면 InStock 반환', async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0) // .error_title 없음
          .mockResolvedValueOnce(0) // #publBtnBuy 없음
          .mockResolvedValueOnce(1); // .btnBuy 있음

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.InStock);
        expect(result.isAvailable).toBe(true);
      });

      it.skip('".btnBasket" 존재하면 InStock 반환', async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0) // .error_title 없음
          .mockResolvedValueOnce(0) // #publBtnBuy 없음
          .mockResolvedValueOnce(0) // .btnBuy 없음
          .mockResolvedValueOnce(1); // .btnBasket 있음

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.InStock);
        expect(result.isAvailable).toBe(true);
      });
    });

    describe("5단계: Mobile 재입고 알림 체크", () => {
      it.skip("재입고 알림 버튼 있으면 OutOfStock 반환", async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0) // .error_title 없음
          .mockResolvedValueOnce(0) // #publBtnBuy 없음
          .mockResolvedValueOnce(0) // .btnBuy 없음
          .mockResolvedValueOnce(0) // .btnBasket 없음
          .mockResolvedValueOnce(1); // .btnReStock 있음

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.OutOfStock);
        expect(result.isAvailable).toBe(false);
      });
    });

    describe("6단계: Desktop 품절 버튼 체크", () => {
      it.skip('".btnSoldout" 존재하면 SoldOut 반환', async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0) // .error_title 없음
          .mockResolvedValueOnce(0) // #publBtnBuy 없음
          .mockResolvedValueOnce(0) // .btnBuy 없음
          .mockResolvedValueOnce(0) // .btnBasket 없음
          .mockResolvedValueOnce(0) // .btnReStock 없음
          .mockResolvedValueOnce(1); // .btnSoldout 있음

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.SoldOut);
        expect(result.isAvailable).toBe(false);
      });
    });

    describe("7단계: 가격 존재 여부 체크", () => {
      it.skip("가격 요소 있으면 InStock 반환 (fallback)", async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0) // .error_title 없음
          .mockResolvedValueOnce(0) // #publBtnBuy 없음
          .mockResolvedValueOnce(0) // .btnBuy 없음
          .mockResolvedValueOnce(0) // .btnBasket 없음
          .mockResolvedValueOnce(0) // .btnReStock 없음
          .mockResolvedValueOnce(0) // .btnSoldout 없음
          .mockResolvedValueOnce(1); // .prd_price 있음

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.InStock);
        expect(result.isAvailable).toBe(true);
      });

      it.skip("가격 요소 없으면 Discontinued 반환", async () => {
        const mockLocator = {
          count: jest.fn(),
        };
        (mockPage.locator as any).mockReturnValue(mockLocator);
        (mockLocator.count as any)
          .mockResolvedValueOnce(1) // .prd_name 있음
          .mockResolvedValueOnce(0) // .error_title 없음
          .mockResolvedValue(0); // 모든 버튼/가격 없음

        const result: SaleStatusData = await extractor.extract(mockPage);

        expect(result.saleStatus).toBe(SaleStatus.Discontinued);
        expect(result.isAvailable).toBe(false);
      });
    });
  });

  describe("selector 우선순위", () => {
    it.skip("Mobile selector 우선 확인", async () => {
      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValueOnce(0) // .error_title 없음
        .mockResolvedValueOnce(1); // #publBtnBuy 있음

      (mockPage.$eval as any).mockResolvedValue("바로구매");

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(mockPage.locator).toHaveBeenCalledWith("#publBtnBuy");
    });
  });

  describe("Edge Cases", () => {
    it.skip("모든 selector 없으면 Discontinued 반환", async () => {
      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValue(0); // 나머지 모두 없음

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });

    it.skip("여러 버튼 동시 존재 시 우선순위 적용", async () => {
      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValueOnce(0) // .error_title 없음
        .mockResolvedValueOnce(1); // #publBtnBuy 있음 (Mobile 우선)

      (mockPage.$eval as any).mockResolvedValue("바로구매");

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
    });
  });

  describe("schema.org 표준 준수", () => {
    it.skip("InStock 상태는 isAvailable true", async () => {
      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValueOnce(0) // .error_title 없음
        .mockResolvedValueOnce(1); // #publBtnBuy 있음

      (mockPage.$eval as any).mockResolvedValue("바로구매");

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it.skip("OutOfStock 상태는 isAvailable false", async () => {
      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValueOnce(0) // .error_title 없음
        .mockResolvedValueOnce(1); // #publBtnBuy 있음

      (mockPage.$eval as any).mockResolvedValue("일시품절");

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.OutOfStock);
      expect(result.isAvailable).toBe(false);
    });

    it.skip("SoldOut 상태는 isAvailable false", async () => {
      const mockLocator = {
        count: jest.fn(),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);
      (mockLocator.count as any)
        .mockResolvedValueOnce(1) // .prd_name 있음
        .mockResolvedValueOnce(0) // .error_title 없음
        .mockResolvedValueOnce(0) // #publBtnBuy 없음
        .mockResolvedValueOnce(0) // .btnBuy 없음
        .mockResolvedValueOnce(0) // .btnBasket 없음
        .mockResolvedValueOnce(0) // .btnReStock 없음
        .mockResolvedValueOnce(1); // .btnSoldout 있음

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.isAvailable).toBe(false);
    });

    it("Discontinued 상태는 isAvailable false", async () => {
      const mockLocator = {
        count: jest.fn().mockResolvedValue(0),
      };
      (mockPage.locator as any).mockReturnValue(mockLocator);

      const result = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });
  });
});

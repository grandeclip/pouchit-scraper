/**
 * AblySaleStatusExtractor Test
 *
 * 목적: 에이블리 판매 상태 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { AblySaleStatusExtractor } from "@/extractors/ably/AblySaleStatusExtractor";
import { SaleStatus } from "@/extractors/base";
import type { SaleStatusData } from "@/extractors/base";

describe("AblySaleStatusExtractor", () => {
  let extractor: AblySaleStatusExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new AblySaleStatusExtractor();
    mockPage = {
      evaluate: jest.fn(),
      textContent: jest.fn(),
      url: jest.fn(() => "https://m.a-bly.com/goods/12345"), // Default URL
    } as any;
  });

  describe("extract() - SSR 데이터에서 판매 상태 추출", () => {
    it('SSR에서 "ON_SALE"을 InStock으로 매핑해야 함', async () => {
      (mockPage.evaluate as any).mockResolvedValue("ON_SALE");

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it('SSR에서 "SOLD_OUT"을 SoldOut으로 매핑해야 함', async () => {
      (mockPage.evaluate as any).mockResolvedValue("SOLD_OUT");

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.isAvailable).toBe(false);
    });

    it("SSR에서 기타 상태는 Discontinued로 매핑해야 함", async () => {
      (mockPage.evaluate as any).mockResolvedValue("UNKNOWN_STATUS");

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });

    it("SSR 데이터가 없으면 Body text fallback 시도", async () => {
      (mockPage.evaluate as any).mockResolvedValue(null);
      (mockPage.textContent as any).mockResolvedValue("구매하기 버튼");

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
    });
  });

  describe("Body text fallback", () => {
    beforeEach(() => {
      (mockPage.evaluate as any).mockResolvedValue(null); // SSR 없음
    });

    it('"품절" 텍스트가 있으면 SoldOut', async () => {
      (mockPage.textContent as any).mockResolvedValue(
        "이 상품은 현재 품절 상태입니다",
      );

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.isAvailable).toBe(false);
    });

    it('"재입고" 텍스트가 있으면 SoldOut', async () => {
      (mockPage.textContent as any).mockResolvedValue("재입고 알림 신청하기");

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
    });

    it('"판매 중인 상품이 아닙니다" 텍스트가 있으면 Discontinued', async () => {
      (mockPage.textContent as any).mockResolvedValue(
        "죄송합니다. 판매 중인 상품이 아닙니다.",
      );

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });

    it("특별한 텍스트가 없으면 InStock", async () => {
      (mockPage.textContent as any).mockResolvedValue("일반 상품 설명 페이지");

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it("Body text가 없으면 Discontinued", async () => {
      (mockPage.textContent as any).mockResolvedValue(null);

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });

    it("Body text 조회 에러 시 Discontinued", async () => {
      (mockPage.textContent as any).mockRejectedValue(
        new Error("Body text error"),
      );

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });
  });

  describe("우선순위 검증", () => {
    it("SSR이 있으면 Body text를 확인하지 않음", async () => {
      (mockPage.evaluate as any).mockResolvedValue("ON_SALE");
      (mockPage.textContent as any).mockResolvedValue("품절"); // 무시되어야 함

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock); // SSR 우선
      expect(mockPage.textContent).not.toHaveBeenCalled();
    });
  });
});

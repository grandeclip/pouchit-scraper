/**
 * KurlySaleStatusExtractor Test
 *
 * 목적: 마켓컬리 판매 상태 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { KurlySaleStatusExtractor } from "@/extractors/kurly/KurlySaleStatusExtractor";
import type { SaleStatusData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";

describe("KurlySaleStatusExtractor", () => {
  let extractor: KurlySaleStatusExtractor;
  let mockPage: Page;

  beforeEach(() => {
    extractor = new KurlySaleStatusExtractor();
    mockPage = {
      evaluate: jest.fn(),
      url: jest.fn().mockReturnValue("https://www.kurly.com/goods/1000284986"),
    } as any;
  });

  describe("extract() - SSR 데이터에서 판매 상태 추출", () => {
    it("isSoldOut이 false면 InStock 반환", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        isSoldOut: false,
        found: true,
      });

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
    });

    it("isSoldOut이 true면 SoldOut 반환", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        isSoldOut: true,
        found: true,
      });

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
    });

    it("isSoldOut이 null이면 Discontinued 반환 (INFO_CHANGED)", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        isSoldOut: null,
        found: true,
      });

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });

    it("isSoldOut이 undefined면 Discontinued 반환", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        isSoldOut: undefined,
        found: true,
      });

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });

    it("SSR 데이터가 없으면 Discontinued 반환", async () => {
      (mockPage.evaluate as any).mockResolvedValue(null);

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });

    it("product 객체가 없으면 Discontinued 반환", async () => {
      (mockPage.evaluate as any).mockResolvedValue(null);

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });

    it("SSR 파싱 에러 시 Discontinued 반환", async () => {
      (mockPage.evaluate as any).mockRejectedValue(
        new Error("SSR parsing error"),
      );

      const result: SaleStatusData = await extractor.extract(mockPage);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });
  });

  describe("상태 매핑 검증", () => {
    it("판매중 상품: isSoldOut=false → InStock", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        isSoldOut: false,
        found: true,
      });

      const result = await extractor.extract(mockPage);
      expect(result.saleStatus).toBe(SaleStatus.InStock);
    });

    it("품절 상품: isSoldOut=true → SoldOut (시스템에서 off_sale로 변환)", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        isSoldOut: true,
        found: true,
      });

      const result = await extractor.extract(mockPage);
      // SoldOut enum 값은 saleStatusMapper에서 off_sale로 변환됨
      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
    });

    it("상품정보 변경: isSoldOut=null → Discontinued", async () => {
      (mockPage.evaluate as any).mockResolvedValue({
        isSoldOut: null,
        found: true,
      });

      const result = await extractor.extract(mockPage);
      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
    });
  });
});

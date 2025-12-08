/**
 * ZigzagSaleStatusExtractor Test
 *
 * 목적: ZigZag 판매 상태 추출 로직 검증
 * 핵심:
 * 1. 상품 레벨 sales_status 우선 (catalog_product.sales_status)
 * 2. Fallback: matched_item_list 복합 상태 처리
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ZigzagSaleStatusExtractor } from "@/extractors/zigzag/ZigzagSaleStatusExtractor";
import { SaleStatus } from "@/extractors/base";
import type { SaleStatusData } from "@/extractors/base";
import type {
  ZigzagGraphQLResponse,
  MatchedItem,
  ZigzagSalesStatus,
} from "@/extractors/zigzag/ZigzagPriceExtractor";

describe("ZigzagSaleStatusExtractor", () => {
  let extractor: ZigzagSaleStatusExtractor;

  beforeEach(() => {
    extractor = new ZigzagSaleStatusExtractor();
  });

  /**
   * Mock GraphQL 응답 생성 헬퍼 (상품 레벨 필드 포함)
   */
  const createMockResponse = (
    matchedItems: MatchedItem[],
    productLevelStatus?: {
      sales_status?: ZigzagSalesStatus;
      is_purchasable?: boolean;
    },
  ): ZigzagGraphQLResponse => {
    return {
      data: {
        pdp_option_info: {
          catalog_product: {
            id: "12345",
            name: "테스트 상품",
            shop_name: "테스트 브랜드",
            product_price: {
              max_price_info: { price: 50000 },
              final_discount_info: { discount_price: 40000 },
              display_final_price: {
                final_price: { price: 40000, badge: null },
                final_price_additional: null,
              },
            },
            matched_item_list: matchedItems,
            product_image_list: [
              {
                image_type: "MAIN",
                pdp_thumbnail_url: "https://img.zigzag.kr/main.jpg",
              },
            ],
            // 상품 레벨 상태 필드
            sales_status: productLevelStatus?.sales_status,
            is_purchasable: productLevelStatus?.is_purchasable,
          },
        },
      },
    };
  };

  describe("상품 레벨 sales_status 우선 처리", () => {
    it("상품 레벨 SUSPENDED면 matched_item_list에 ON_SALE 있어도 Discontinued", async () => {
      // 실제 버그 케이스: matched_item_list에 ON_SALE이 있지만 상품은 판매중단
      const mockResponse = createMockResponse(
        [
          { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
          { sales_status: "ON_SALE", display_status: "VISIBLE" }, // ON_SALE 있음
          { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
        ],
        { sales_status: "SUSPENDED", is_purchasable: false },
      );

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });

    it("상품 레벨 ON_SALE + is_purchasable=true면 InStock", async () => {
      const mockResponse = createMockResponse(
        [{ sales_status: "ON_SALE", display_status: "VISIBLE" }],
        { sales_status: "ON_SALE", is_purchasable: true },
      );

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it("상품 레벨 SOLD_OUT이면 SoldOut", async () => {
      const mockResponse = createMockResponse(
        [{ sales_status: "SOLD_OUT", display_status: "VISIBLE" }],
        { sales_status: "SOLD_OUT", is_purchasable: false },
      );

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.isAvailable).toBe(false);
    });

    it("상품 레벨 is_purchasable=false면 isAvailable=false", async () => {
      const mockResponse = createMockResponse(
        [{ sales_status: "ON_SALE", display_status: "VISIBLE" }],
        { sales_status: "ON_SALE", is_purchasable: false },
      );

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(false); // is_purchasable가 false
    });
  });

  describe("Fallback: matched_item_list 기반 (상품 레벨 필드 없을 때)", () => {
    it("모든 아이템이 ON_SALE이면 InStock이어야 함", async () => {
      const mockResponse = createMockResponse([
        { sales_status: "ON_SALE", display_status: "VISIBLE" },
        { sales_status: "ON_SALE", display_status: "VISIBLE" },
      ]);

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it("하나라도 ON_SALE이면 InStock이어야 함", async () => {
      const mockResponse = createMockResponse([
        { sales_status: "ON_SALE", display_status: "VISIBLE" },
        { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
        { sales_status: "SUSPENDED", display_status: "HIDDEN" },
      ]);

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(true);
    });

    it("모든 아이템이 SOLD_OUT이면 SoldOut이어야 함", async () => {
      const mockResponse = createMockResponse([
        { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
        { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
      ]);

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.isAvailable).toBe(false);
    });

    it("ON_SALE 없고 혼합 상태면 첫 번째 아이템 상태를 따라야 함", async () => {
      const mockResponse = createMockResponse([
        { sales_status: "SUSPENDED", display_status: "HIDDEN" },
        { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
      ]);

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued); // SUSPENDED → Discontinued
      expect(result.isAvailable).toBe(false);
    });

    it("빈 matched_item_list면 Discontinued (SUSPENDED 기본값)", async () => {
      const mockResponse = createMockResponse([]);

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.isAvailable).toBe(false);
    });
  });

  describe("display_status 처리 (Fallback 경로)", () => {
    it("ON_SALE이지만 HIDDEN이면 isAvailable=false", async () => {
      const mockResponse = createMockResponse([
        { sales_status: "ON_SALE", display_status: "HIDDEN" },
      ]);

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.saleStatus).toBe(SaleStatus.InStock);
      expect(result.isAvailable).toBe(false); // HIDDEN이라 구매 불가
    });

    it("하나라도 VISIBLE이면 노출 중으로 판단", async () => {
      const mockResponse = createMockResponse([
        { sales_status: "ON_SALE", display_status: "HIDDEN" },
        { sales_status: "ON_SALE", display_status: "VISIBLE" },
      ]);

      const result: SaleStatusData = await extractor.extract(mockResponse);

      expect(result.isAvailable).toBe(true); // 하나라도 VISIBLE
    });
  });

  describe("에러 처리", () => {
    it("상품 데이터 없으면 에러를 던져야 함", async () => {
      const mockResponse: ZigzagGraphQLResponse = {
        data: {
          pdp_option_info: {
            catalog_product: null,
          },
        },
      };

      await expect(extractor.extract(mockResponse)).rejects.toThrow(
        "Product not found",
      );
    });
  });
});

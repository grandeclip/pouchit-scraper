/**
 * ZigzagExtractor Integration Test
 *
 * 목적: ZigZag 통합 Extractor (Facade) 검증
 * 핵심: 3개 sub-extractor 병렬 조합, GraphQL 에러 처리
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ZigzagExtractor } from "@/extractors/zigzag/ZigzagExtractor";
import { SaleStatus } from "@/extractors/base";
import type { ProductData } from "@/extractors/base";
import type {
  ZigzagGraphQLResponse,
  MatchedItem,
} from "@/extractors/zigzag/ZigzagPriceExtractor";

describe("ZigzagExtractor (Integration)", () => {
  let extractor: ZigzagExtractor;

  beforeEach(() => {
    extractor = new ZigzagExtractor();
  });

  /**
   * 완전한 Mock GraphQL 응답 생성 헬퍼
   */
  const createFullMockResponse = (
    overrides: Partial<{
      id: string;
      name: string;
      shopName: string;
      maxPrice: number;
      discountPrice: number;
      finalPrice: number;
      badgeText: string | null;
      matchedItems: MatchedItem[];
      imageList: Array<{ image_type: string; pdp_thumbnail_url: string }>;
    }> = {},
  ): ZigzagGraphQLResponse => {
    const {
      id = "12345",
      name = "테스트 상품",
      shopName = "테스트 브랜드",
      maxPrice = 50000,
      discountPrice = 40000,
      finalPrice = 35000,
      badgeText = null,
      matchedItems = [
        { sales_status: "ON_SALE", display_status: "VISIBLE" },
      ] as MatchedItem[],
      imageList = [
        {
          image_type: "MAIN",
          pdp_thumbnail_url: "https://img.zigzag.kr/main.jpg",
        },
      ],
    } = overrides;

    return {
      data: {
        pdp_option_info: {
          catalog_product: {
            id,
            name,
            shop_name: shopName,
            product_price: {
              max_price_info: { price: maxPrice },
              final_discount_info: { discount_price: discountPrice },
              display_final_price: {
                final_price: { price: finalPrice, badge: null },
                final_price_additional: badgeText
                  ? {
                      price: discountPrice - 5000,
                      badge: { text: badgeText },
                    }
                  : null,
              },
            },
            matched_item_list: matchedItems,
            product_image_list: imageList,
          },
        },
      },
    };
  };

  describe("extract() - 통합 추출", () => {
    it("정상 상품의 전체 데이터를 추출해야 함", async () => {
      const mockResponse = createFullMockResponse({
        name: "여성 니트 가디건",
        shopName: "밀크바이밀크",
        maxPrice: 59000,
        discountPrice: 47200,
        matchedItems: [
          { sales_status: "ON_SALE", display_status: "VISIBLE" },
        ] as MatchedItem[],
        imageList: [
          {
            image_type: "MAIN",
            pdp_thumbnail_url: "https://img.zigzag.kr/product/main.jpg",
          },
        ],
      });

      const result: ProductData = await extractor.extract(mockResponse);

      // Metadata 검증
      expect(result.metadata.productName).toBe("여성 니트 가디건");
      expect(result.metadata.brand).toBe("밀크바이밀크");
      expect(result.metadata.thumbnail).toBe(
        "https://img.zigzag.kr/product/main.jpg",
      );

      // Price 검증
      expect(result.price.originalPrice).toBe(59000);
      expect(result.price.price).toBe(47200);
      expect(result.price.currency).toBe("KRW");

      // SaleStatus 검증
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
      expect(result.saleStatus.isAvailable).toBe(true);
    });

    it("품절 상품 처리", async () => {
      const mockResponse = createFullMockResponse({
        matchedItems: [
          { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
          { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
        ] as MatchedItem[],
      });

      const result: ProductData = await extractor.extract(mockResponse);

      expect(result.saleStatus.saleStatus).toBe(SaleStatus.SoldOut);
      expect(result.saleStatus.isAvailable).toBe(false);
    });

    it("첫구매 할인 상품은 첫구매 제외 가격 사용", async () => {
      const mockResponse = createFullMockResponse({
        maxPrice: 50000,
        discountPrice: 30000, // 첫구매 포함 (사용 안함)
        finalPrice: 40000, // 첫구매 제외 (사용)
        badgeText: "첫구매 -10,000원",
      });

      const result: ProductData = await extractor.extract(mockResponse);

      expect(result.price.price).toBe(40000);
      expect(result.price.originalPrice).toBe(50000);
    });

    it("복합 상태 처리 (일부 품절, 일부 판매중)", async () => {
      const mockResponse = createFullMockResponse({
        matchedItems: [
          { sales_status: "SOLD_OUT", display_status: "VISIBLE" },
          { sales_status: "ON_SALE", display_status: "VISIBLE" },
          { sales_status: "SOLD_OUT", display_status: "HIDDEN" },
        ] as MatchedItem[],
      });

      const result: ProductData = await extractor.extract(mockResponse);

      // 하나라도 ON_SALE이면 InStock
      expect(result.saleStatus.saleStatus).toBe(SaleStatus.InStock);
      expect(result.saleStatus.isAvailable).toBe(true);
    });
  });

  describe("GraphQL 에러 처리", () => {
    it("GraphQL 에러가 있으면 에러를 던져야 함", async () => {
      const mockResponse: ZigzagGraphQLResponse = {
        data: null,
        errors: [
          { message: "Product not found" },
          { message: "Invalid product ID" },
        ],
      };

      await expect(extractor.extract(mockResponse)).rejects.toThrow(
        "GraphQL Error: Product not found, Invalid product ID",
      );
    });

    it("pdp_option_info가 없으면 에러를 던져야 함", async () => {
      const mockResponse: ZigzagGraphQLResponse = {
        data: {
          pdp_option_info: null,
        },
      };

      await expect(extractor.extract(mockResponse)).rejects.toThrow(
        "Product not found (no data returned)",
      );
    });

    it("catalog_product가 null이면 에러를 던져야 함", async () => {
      const mockResponse: ZigzagGraphQLResponse = {
        data: {
          pdp_option_info: {
            catalog_product: null,
          },
        },
      };

      await expect(extractor.extract(mockResponse)).rejects.toThrow(
        "Product not found (catalog_product is null)",
      );
    });
  });

  describe("병렬 추출 검증", () => {
    it("3개 Extractor 결과가 모두 포함되어야 함", async () => {
      const mockResponse = createFullMockResponse();

      const result: ProductData = await extractor.extract(mockResponse);

      // 3개 키 존재 확인
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("saleStatus");

      // 각 데이터 유효성
      expect(result.metadata.productName).toBeTruthy();
      expect(result.price.price).toBeGreaterThan(0);
      expect(result.saleStatus.saleStatus).toBeDefined();
    });
  });

  describe("실제 시나리오 테스트", () => {
    it("판매중단(SUSPENDED) 상품 처리", async () => {
      const mockResponse = createFullMockResponse({
        matchedItems: [
          { sales_status: "SUSPENDED", display_status: "HIDDEN" },
        ] as MatchedItem[],
      });

      const result: ProductData = await extractor.extract(mockResponse);

      expect(result.saleStatus.saleStatus).toBe(SaleStatus.Discontinued);
      expect(result.saleStatus.isAvailable).toBe(false);
    });

    it("다수 이미지 상품 처리", async () => {
      const mockResponse = createFullMockResponse({
        imageList: [
          {
            image_type: "MAIN",
            pdp_thumbnail_url: "https://img.zigzag.kr/1.jpg",
          },
          {
            image_type: "SUB",
            pdp_thumbnail_url: "https://img.zigzag.kr/2.jpg",
          },
          {
            image_type: "SUB",
            pdp_thumbnail_url: "https://img.zigzag.kr/3.jpg",
          },
          {
            image_type: "DETAIL",
            pdp_thumbnail_url: "https://img.zigzag.kr/4.jpg",
          },
        ],
      });

      const result: ProductData = await extractor.extract(mockResponse);

      expect(result.metadata.thumbnail).toBe("https://img.zigzag.kr/1.jpg");
      expect(result.metadata.images).toHaveLength(4);
    });
  });
});

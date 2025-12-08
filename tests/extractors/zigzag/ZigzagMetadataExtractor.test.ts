/**
 * ZigzagMetadataExtractor Test
 *
 * 목적: ZigZag 메타데이터 추출 로직 검증
 * 핵심: MAIN 이미지 필터링, shop_name 브랜드 추출
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ZigzagMetadataExtractor } from "@/extractors/zigzag/ZigzagMetadataExtractor";
import type { MetadataData } from "@/extractors/base";
import type { ZigzagGraphQLResponse } from "@/extractors/zigzag/ZigzagPriceExtractor";

describe("ZigzagMetadataExtractor", () => {
  let extractor: ZigzagMetadataExtractor;

  beforeEach(() => {
    extractor = new ZigzagMetadataExtractor();
  });

  /**
   * Mock GraphQL 응답 생성 헬퍼
   */
  const createMockResponse = (
    overrides: Partial<{
      name: string;
      shopName: string;
      imageList: Array<{ image_type: string; pdp_thumbnail_url: string }>;
    }> = {},
  ): ZigzagGraphQLResponse => {
    const {
      name = "테스트 상품",
      shopName = "테스트 브랜드",
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
            id: "12345",
            name,
            shop_name: shopName,
            product_price: {
              max_price_info: { price: 50000 },
              final_discount_info: { discount_price: 40000 },
              display_final_price: {
                final_price: { price: 40000, badge: null },
                final_price_additional: null,
              },
            },
            matched_item_list: [
              { sales_status: "ON_SALE", display_status: "VISIBLE" },
            ],
            product_image_list: imageList,
          },
        },
      },
    };
  };

  describe("extract() - 메타데이터 추출", () => {
    it("상품명을 정확히 추출해야 함", async () => {
      const mockResponse = createMockResponse({
        name: "여성 니트 가디건",
      });

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.productName).toBe("여성 니트 가디건");
    });

    it("브랜드(shop_name)를 정확히 추출해야 함", async () => {
      const mockResponse = createMockResponse({
        shopName: "밀크바이밀크",
      });

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.brand).toBe("밀크바이밀크");
    });

    it("MAIN 이미지만 thumbnail로 추출해야 함", async () => {
      const mockResponse = createMockResponse({
        imageList: [
          {
            image_type: "DETAIL",
            pdp_thumbnail_url: "https://img.zigzag.kr/detail.jpg",
          },
          {
            image_type: "MAIN",
            pdp_thumbnail_url: "https://img.zigzag.kr/main.jpg",
          },
          {
            image_type: "SUB",
            pdp_thumbnail_url: "https://img.zigzag.kr/sub.jpg",
          },
        ],
      });

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe("https://img.zigzag.kr/main.jpg");
    });

    it("모든 이미지 URL을 images 배열로 추출해야 함", async () => {
      const mockResponse = createMockResponse({
        imageList: [
          {
            image_type: "MAIN",
            pdp_thumbnail_url: "https://img.zigzag.kr/main.jpg",
          },
          {
            image_type: "SUB",
            pdp_thumbnail_url: "https://img.zigzag.kr/sub1.jpg",
          },
          {
            image_type: "SUB",
            pdp_thumbnail_url: "https://img.zigzag.kr/sub2.jpg",
          },
        ],
      });

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.images).toEqual([
        "https://img.zigzag.kr/main.jpg",
        "https://img.zigzag.kr/sub1.jpg",
        "https://img.zigzag.kr/sub2.jpg",
      ]);
    });
  });

  describe("이미지 추출 엣지 케이스", () => {
    it("MAIN 이미지 없으면 빈 문자열 반환", async () => {
      const mockResponse = createMockResponse({
        imageList: [
          {
            image_type: "DETAIL",
            pdp_thumbnail_url: "https://img.zigzag.kr/detail.jpg",
          },
        ],
      });

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe("");
    });

    it("빈 이미지 목록이면 thumbnail은 빈 문자열", async () => {
      const mockResponse = createMockResponse({
        imageList: [],
      });

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe("");
      expect(result.images).toBeUndefined();
    });

    it("빈 URL은 images에서 필터링됨", async () => {
      const mockResponse = createMockResponse({
        imageList: [
          {
            image_type: "MAIN",
            pdp_thumbnail_url: "https://img.zigzag.kr/main.jpg",
          },
          { image_type: "SUB", pdp_thumbnail_url: "" },
          {
            image_type: "SUB",
            pdp_thumbnail_url: "https://img.zigzag.kr/sub.jpg",
          },
        ],
      });

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.images).toEqual([
        "https://img.zigzag.kr/main.jpg",
        "https://img.zigzag.kr/sub.jpg",
      ]);
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

    it("pdp_option_info가 null이면 에러를 던져야 함", async () => {
      const mockResponse: ZigzagGraphQLResponse = {
        data: {
          pdp_option_info: null,
        },
      };

      await expect(extractor.extract(mockResponse)).rejects.toThrow(
        "Product not found",
      );
    });
  });
});

/**
 * MusinsaMetadataExtractor Test
 *
 * 목적: 무신사 메타데이터 추출 로직 검증 (API 기반)
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { MusinsaMetadataExtractor } from "@/extractors/musinsa/MusinsaMetadataExtractor";
import { MUSINSA_IMAGE_CDN_BASE_URL } from "@/extractors/musinsa/MusinsaConstants";
import type { MetadataData } from "@/extractors/base";
import type { MusinsaApiResponse } from "@/extractors/musinsa/MusinsaPriceExtractor";

describe("MusinsaMetadataExtractor", () => {
  let extractor: MusinsaMetadataExtractor;

  beforeEach(() => {
    extractor = new MusinsaMetadataExtractor(MUSINSA_IMAGE_CDN_BASE_URL);
  });

  describe("extract() - 메타데이터 추출", () => {
    it("상품명을 추출해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 123,
          goodsNm: "무신사 테스트 상품명",
          thumbnailImageUrl: "/thumbnails/test.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 15000,
            salePrice: 15000,
            couponPrice: 15000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.productName).toBe("무신사 테스트 상품명");
    });

    it("브랜드는 항상 undefined여야 함 (무신사 API 미제공)", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 456,
          goodsNm: "상품",
          thumbnailImageUrl: "/thumbnails/test2.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 10000,
            salePrice: 10000,
            couponPrice: 10000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.brand).toBeUndefined();
    });

    it("썸네일 URL을 IMAGE_PREFIX와 함께 빌드해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 789,
          goodsNm: "이미지 상품",
          thumbnailImageUrl: "/thumbnails/images/goods_img/test.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 20000,
            salePrice: 20000,
            couponPrice: 20000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe(
        "https://image.msscdn.net/thumbnails/images/goods_img/test.jpg",
      );
    });

    it("썸네일을 images 배열의 첫 번째 요소로 설정해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 100,
          goodsNm: "이미지 배열 상품",
          thumbnailImageUrl: "/thumbnails/test.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 30000,
            salePrice: 30000,
            couponPrice: 30000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.images).toEqual([
        "https://image.msscdn.net/thumbnails/test.jpg",
      ]);
      expect(result.images?.[0]).toBe(result.thumbnail);
    });
  });

  describe("썸네일 URL 빌드 로직", () => {
    it("상대 경로에 IMAGE_PREFIX를 추가해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 200,
          goodsNm: "상대 경로 테스트",
          thumbnailImageUrl: "/goods/12345.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 15000,
            salePrice: 15000,
            couponPrice: 15000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe("https://image.msscdn.net/goods/12345.jpg");
    });

    it("빈 썸네일 경로도 IMAGE_PREFIX와 결합되어야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 300,
          goodsNm: "빈 경로 테스트",
          thumbnailImageUrl: "",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 12000,
            salePrice: 12000,
            couponPrice: 12000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe("https://image.msscdn.net");
    });

    it("슬래시로 시작하는 경로를 올바르게 처리해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 400,
          goodsNm: "슬래시 테스트",
          thumbnailImageUrl: "/path/to/image.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 10000,
            salePrice: 10000,
            couponPrice: 10000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe(
        "https://image.msscdn.net/path/to/image.jpg",
      );
    });

    it("중첩된 경로도 올바르게 처리해야 함", async () => {
      const mockResponse: MusinsaApiResponse = {
        meta: { result: "success", errorCode: "", message: "" },
        data: {
          goodsNo: 500,
          goodsNm: "중첩 경로 테스트",
          thumbnailImageUrl: "/a/b/c/d/e/image.jpg",
          goodsSaleType: "SALE",
          goodsPrice: {
            normalPrice: 25000,
            salePrice: 25000,
            couponPrice: 25000,
            couponDiscount: false,
          },
        },
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe(
        "https://image.msscdn.net/a/b/c/d/e/image.jpg",
      );
    });
  });
});

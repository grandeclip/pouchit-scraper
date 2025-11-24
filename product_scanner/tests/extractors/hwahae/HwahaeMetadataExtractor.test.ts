/**
 * HwahaeMetadataExtractor Test
 *
 * 목적: 화해 메타데이터 추출 로직 검증 (API 기반)
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { HwahaeMetadataExtractor } from "@/extractors/hwahae/HwahaeMetadataExtractor";
import type { MetadataData } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

describe("HwahaeMetadataExtractor", () => {
  let extractor: HwahaeMetadataExtractor;

  beforeEach(() => {
    extractor = new HwahaeMetadataExtractor();
  });

  describe("extract() - 메타데이터 추출", () => {
    it("상품명을 추출해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 123,
        name: "테스트 상품명",
        title_images: ["https://example.com/image.jpg"],
        consumer_price: 15000,
        price: 15000,
        sale_status: "SELNG",
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.productName).toBe("테스트 상품명");
    });

    it("브랜드는 항상 undefined여야 함 (화해 API 미제공)", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 456,
        name: "상품",
        title_images: [],
        consumer_price: 10000,
        price: 10000,
        sale_status: "SELNG",
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.brand).toBeUndefined();
    });

    it("첫 번째 이미지를 썸네일로 설정해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 789,
        name: "이미지 상품",
        title_images: [
          "https://example.com/image1.jpg",
          "https://example.com/image2.jpg",
        ],
        consumer_price: 20000,
        price: 20000,
        sale_status: "SELNG",
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBe("https://example.com/image1.jpg");
    });

    it("모든 이미지를 images 배열로 설정해야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 100,
        name: "다중 이미지 상품",
        title_images: [
          "https://example.com/img1.jpg",
          "https://example.com/img2.jpg",
          "https://example.com/img3.jpg",
        ],
        consumer_price: 30000,
        price: 30000,
        sale_status: "SELNG",
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.images).toEqual([
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
        "https://example.com/img3.jpg",
      ]);
    });
  });

  describe("빈 이미지 처리", () => {
    it("이미지가 없으면 thumbnail과 images는 undefined여야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 200,
        name: "이미지 없는 상품",
        title_images: [],
        consumer_price: 15000,
        price: 15000,
        sale_status: "SELNG",
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBeUndefined();
      expect(result.images).toBeUndefined();
    });

    it("빈 문자열 이미지는 필터링되어야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 300,
        name: "빈 문자열 이미지 상품",
        title_images: ["", "  ", "https://example.com/valid.jpg", ""],
        consumer_price: 12000,
        price: 12000,
        sale_status: "SELNG",
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.images).toEqual(["https://example.com/valid.jpg"]);
    });

    it("모든 이미지가 빈 문자열이면 undefined여야 함", async () => {
      const mockResponse: HwahaeApiResponse = {
        id: 400,
        name: "전부 빈 이미지",
        title_images: ["", "  ", "   "],
        consumer_price: 10000,
        price: 10000,
        sale_status: "SELNG",
      };

      const result: MetadataData = await extractor.extract(mockResponse);

      expect(result.thumbnail).toBeUndefined();
      expect(result.images).toBeUndefined();
    });
  });
});

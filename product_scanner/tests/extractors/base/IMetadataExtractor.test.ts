/**
 * IMetadataExtractor Interface Test
 *
 * 목적: MetadataData 인터페이스 구조 검증
 * TDD: RED 단계
 */

import { describe, it, expect } from "@jest/globals";
import type {
  IMetadataExtractor,
  MetadataData,
} from "@/extractors/base/IMetadataExtractor";

describe("IMetadataExtractor Interface", () => {
  describe("MetadataData 타입 검증", () => {
    it("필수 필드를 포함해야 함", () => {
      const validData: MetadataData = {
        productName: "테스트 상품명",
      };

      expect(validData.productName).toBe("테스트 상품명");
    });

    it("브랜드 정보를 포함할 수 있음", () => {
      const dataWithBrand: MetadataData = {
        productName: "테스트 상품명",
        brand: "테스트 브랜드",
      };

      expect(dataWithBrand.brand).toBe("테스트 브랜드");
    });

    it("썸네일 이미지를 포함할 수 있음", () => {
      const dataWithThumbnail: MetadataData = {
        productName: "테스트 상품명",
        thumbnail: "https://example.com/thumbnail.jpg",
      };

      expect(dataWithThumbnail.thumbnail).toBe(
        "https://example.com/thumbnail.jpg",
      );
    });

    it("여러 이미지를 포함할 수 있음", () => {
      const dataWithImages: MetadataData = {
        productName: "테스트 상품명",
        images: [
          "https://example.com/image1.jpg",
          "https://example.com/image2.jpg",
          "https://example.com/image3.jpg",
        ],
      };

      expect(dataWithImages.images).toHaveLength(3);
    });

    it("모든 필드를 포함할 수 있음", () => {
      const fullData: MetadataData = {
        productName: "테스트 상품명",
        brand: "테스트 브랜드",
        thumbnail: "https://example.com/thumbnail.jpg",
        images: [
          "https://example.com/image1.jpg",
          "https://example.com/image2.jpg",
        ],
      };

      expect(fullData).toMatchObject({
        productName: "테스트 상품명",
        brand: "테스트 브랜드",
        thumbnail: "https://example.com/thumbnail.jpg",
        images: expect.arrayContaining([
          "https://example.com/image1.jpg",
          "https://example.com/image2.jpg",
        ]),
      });
    });

    it("선택 필드 없이 최소 필드만 있을 수 있음", () => {
      const minimalData: MetadataData = {
        productName: "최소 데이터",
      };

      expect(minimalData.brand).toBeUndefined();
      expect(minimalData.thumbnail).toBeUndefined();
      expect(minimalData.images).toBeUndefined();
    });
  });

  describe("IMetadataExtractor 구현 검증", () => {
    it("extract 메서드를 구현해야 함", async () => {
      const mockExtractor: IMetadataExtractor = {
        extract: async () => ({
          productName: "Mock 상품",
        }),
      };

      const result = await mockExtractor.extract({} as any);
      expect(result).toHaveProperty("productName");
    });

    it("Promise<MetadataData>를 반환해야 함", async () => {
      const mockExtractor: IMetadataExtractor = {
        extract: async () => ({
          productName: "Mock 상품",
          brand: "Mock 브랜드",
          thumbnail: "https://example.com/mock.jpg",
          images: ["https://example.com/1.jpg"],
        }),
      };

      const result = await mockExtractor.extract({} as any);
      expect(result).toMatchObject({
        productName: "Mock 상품",
        brand: "Mock 브랜드",
        thumbnail: "https://example.com/mock.jpg",
        images: expect.arrayContaining(["https://example.com/1.jpg"]),
      });
    });
  });
});

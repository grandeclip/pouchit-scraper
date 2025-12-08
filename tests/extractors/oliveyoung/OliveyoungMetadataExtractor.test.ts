/**
 * OliveyoungMetadataExtractor Test
 *
 * 목적: 올리브영 메타데이터 추출 로직 검증
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import type { Page } from "playwright";
import { OliveyoungMetadataExtractor } from "@/extractors/oliveyoung/OliveyoungMetadataExtractor";
import type { MetadataData } from "@/extractors/base";
import { ConfigLoader } from "@/config/ConfigLoader";
import type { OliveyoungConfig } from "@/core/domain/OliveyoungConfig";

describe("OliveyoungMetadataExtractor", () => {
  let extractor: OliveyoungMetadataExtractor;
  let mockPage: Page;

  beforeEach(() => {
    // Load from YAML
    const config = ConfigLoader.getInstance().loadConfig(
      "oliveyoung",
    ) as OliveyoungConfig;
    extractor = new OliveyoungMetadataExtractor(
      config.selectors,
      config.error_messages,
      config.thumbnail_exclusions,
      config.product_number_pattern,
    );
    mockPage = {
      $eval: jest.fn(),
      $$eval: jest.fn(),
    } as any;
  });

  describe("extract() - 메타데이터 추출", () => {
    it("모든 필드를 추출해야 함", async () => {
      (mockPage.$eval as any)
        .mockResolvedValueOnce("에스트라 아토베리어365 크림") // productName
        .mockResolvedValueOnce("아모레퍼시픽") // brand
        .mockResolvedValueOnce(
          "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
        ); // thumbnail (상품번호 포함)

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("에스트라 아토베리어365 크림");
      expect(result.brand).toBe("아모레퍼시픽");
      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
    });

    it("상품명만 필수이고 나머지는 선택 필드임", async () => {
      (mockPage.$eval as any)
        .mockResolvedValueOnce("에스트라 크림") // productName
        .mockRejectedValueOnce(new Error("Not found")) // brand
        .mockRejectedValueOnce(new Error("Not found")); // thumbnail

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("에스트라 크림");
      expect(result.brand).toBeUndefined();
      expect(result.thumbnail).toBeUndefined();
    });

    it("상품명이 없으면 빈 문자열 반환", async () => {
      (mockPage.$eval as any).mockRejectedValue(new Error("Not found"));

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("");
    });

    it("공백만 있는 상품명은 빈 문자열 처리", async () => {
      (mockPage.$eval as any).mockResolvedValue("   ");

      const result: MetadataData = await extractor.extract(mockPage);

      expect(result.productName).toBe("");
    });
  });

  describe("상품명 추출 (7개 selector 순차 시도)", () => {
    it("1순위: .info-group__title (Mobile)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title")
          return Promise.resolve("모바일 상품명");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.productName).toBe("모바일 상품명");
      expect(mockPage.$eval).toHaveBeenCalledWith(
        ".info-group__title",
        expect.any(Function),
      );
    });

    it("2순위: .prd_name (Desktop)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".prd_name") return Promise.resolve("데스크탑 상품명");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        ".prd_name",
        expect.any(Function),
      );
    });

    it('3순위: [class*="goods"][class*="name"]', async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === '[class*="goods"][class*="name"]')
          return Promise.resolve("굿즈 이름");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        '[class*="goods"][class*="name"]',
        expect.any(Function),
      );
    });

    it('4순위: [class*="product"][class*="name"]', async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === '[class*="product"][class*="name"]')
          return Promise.resolve("프로덕트 이름");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        '[class*="product"][class*="name"]',
        expect.any(Function),
      );
    });

    it('5순위: [class*="title"]', async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === '[class*="title"]')
          return Promise.resolve("타이틀 텍스트");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        '[class*="title"]',
        expect.any(Function),
      );
    });

    it("6순위: h1", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === "h1") return Promise.resolve("H1 상품명");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith("h1", expect.any(Function));
    });

    it("7순위: .goods_name", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".goods_name") return Promise.resolve("굿즈명");
        return Promise.reject(new Error("Not found"));
      });

      await extractor.extract(mockPage);

      expect(mockPage.$eval).toHaveBeenCalledWith(
        ".goods_name",
        expect.any(Function),
      );
    });

    it("3글자 미만은 무시하고 다음 selector 시도", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("AB"); // 2글자 (무시)
        if (selector === ".prd_name") return Promise.resolve("정상 상품명"); // 3글자 이상
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.productName).toBe("정상 상품명");
    });

    it("모든 selector에서 3글자 미만이면 빈 문자열", async () => {
      (mockPage.$eval as any).mockResolvedValue("AB");

      const result = await extractor.extract(mockPage);

      expect(result.productName).toBe("");
    });
  });

  describe("브랜드 추출 (4개 selector 순차 시도)", () => {
    it("1순위: .top-utils__brand-link (Mobile)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".top-utils__brand-link")
          return Promise.resolve("아모레퍼시픽");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.brand).toBe("아모레퍼시픽");
    });

    it("2순위: .prd_brand (Desktop)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".prd_brand") return Promise.resolve("LG생활건강");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.brand).toBe("LG생활건강");
    });

    it('3순위: [class*="brand"]', async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === '[class*="brand"]') return Promise.resolve("에스쁘아");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.brand).toBe("에스쁘아");
    });

    it("4순위: .brand-name", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".brand-name") return Promise.resolve("이니스프리");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.brand).toBe("이니스프리");
    });

    it("브랜드 없으면 undefined 반환", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.brand).toBeUndefined();
    });
  });

  describe("썸네일 추출 (5가지 전략 순차 시도)", () => {
    it("1순위: .swiper-slide-active img (Swiper 활성 슬라이드)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".swiper-slide-active img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/10/0000/0015/A00000015906254ko.jpg",
          );
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/10/0000/0015/A00000015906254ko.jpg",
      );
    });

    it("2순위: .swiper-slide img (Swiper 첫 슬라이드)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".swiper-slide img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/uploads/A00000015906254ko.jpg",
          );
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/uploads/A00000015906254ko.jpg",
      );
    });

    it("3순위: .prd_img img (Desktop 상품 이미지)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".prd_img img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
          );
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
    });

    it("4순위: #mainImg (Desktop 메인 이미지)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === "#mainImg")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/main/A00000015906254.jpg",
          );
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/main/A00000015906254.jpg",
      );
    });

    it("5순위: img (모든 이미지 중 fallback)", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === "img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
          );
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
    });

    it("상품번호(A로 시작하는 13자리) 포함 URL만 유효", async () => {
      (mockPage.$eval as any)
        .mockResolvedValueOnce("상품명")
        .mockRejectedValueOnce(new Error("Not found")) // brand
        .mockResolvedValueOnce(
          "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
        ); // 유효

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
      expect(result.thumbnail).toMatch(/A\d{12}/); // A + 12자리 숫자
    });

    it("상품번호 없는 URL은 제외하고 다음 시도", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".swiper-slide-active img")
          return Promise.resolve("https://image.oliveyoung.co.kr/banner.jpg"); // 상품번호 없음
        if (selector === ".swiper-slide img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
          ); // 상품번호 있음
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
    });

    it("모든 URL에 상품번호 없으면 undefined 반환", async () => {
      (mockPage.$eval as any)
        .mockResolvedValueOnce("상품명")
        .mockRejectedValueOnce(new Error("Not found")) // brand
        .mockResolvedValue("https://image.oliveyoung.co.kr/banner.jpg"); // 상품번호 없음

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBeUndefined();
    });

    it("썸네일 없으면 undefined 반환", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBeUndefined();
    });

    it("options/item 포함 URL은 제외", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".swiper-slide-active img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/options/item/A00000015906254.jpg",
          ); // options/item (제외)
        if (selector === ".swiper-slide img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
          ); // 유효
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
    });

    it("oliveyoung.co.kr 도메인만 허용", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve("상품명");
        if (selector === ".swiper-slide-active img")
          return Promise.resolve("https://external.com/A00000015906254.jpg"); // 외부 도메인 (제외)
        if (selector === ".swiper-slide img")
          return Promise.resolve(
            "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
          ); // 올리브영 도메인 (유효)
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
    });
  });

  describe("Edge Cases", () => {
    it("null 값은 빈 문자열/undefined로 처리", async () => {
      (mockPage.$eval as any).mockResolvedValue(null);

      const result = await extractor.extract(mockPage);

      expect(result.productName).toBe("");
      expect(result.brand).toBeUndefined();
      expect(result.thumbnail).toBeUndefined();
    });

    it("앞뒤 공백 제거", async () => {
      (mockPage.$eval as any)
        .mockResolvedValueOnce("  에스트라 크림  ") // productName (공백 제거)
        .mockResolvedValueOnce("  아모레퍼시픽  ") // brand (공백 제거)
        .mockResolvedValueOnce(
          "  https://image.oliveyoung.co.kr/A00000015906254ko.jpg  ",
        ); // thumbnail (공백 제거 + 상품번호)

      const result = await extractor.extract(mockPage);

      expect(result.productName).toBe("에스트라 크림");
      expect(result.brand).toBe("아모레퍼시픽");
      expect(result.thumbnail).toBe(
        "https://image.oliveyoung.co.kr/A00000015906254ko.jpg",
      );
    });

    it("빈 문자열은 다음 selector 시도", async () => {
      (mockPage.$eval as any).mockImplementation((selector: string) => {
        if (selector === ".info-group__title") return Promise.resolve(""); // 빈 문자열
        if (selector === ".prd_name") return Promise.resolve("정상 상품명");
        return Promise.reject(new Error("Not found"));
      });

      const result = await extractor.extract(mockPage);

      expect(result.productName).toBe("정상 상품명");
    });
  });
});

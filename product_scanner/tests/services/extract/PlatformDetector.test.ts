/**
 * PlatformDetector 단위 테스트
 */

import { describe, it, expect } from "@jest/globals";
import {
  PlatformDetector,
  SUPPORTED_PLATFORMS,
} from "@/services/extract/url/PlatformDetector";

describe("PlatformDetector", () => {
  describe("detectPlatform", () => {
    it("oliveyoung URL 감지", () => {
      const url =
        "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822";
      expect(PlatformDetector.detectPlatform(url)).toBe("oliveyoung");
    });

    it("hwahae URL 감지", () => {
      const url = "https://www.hwahae.co.kr/goods/21320";
      expect(PlatformDetector.detectPlatform(url)).toBe("hwahae");
    });

    it("musinsa URL 감지", () => {
      const url = "https://www.musinsa.com/products/4350236";
      expect(PlatformDetector.detectPlatform(url)).toBe("musinsa");
    });

    it("ably URL 감지", () => {
      const url = "https://m.a-bly.com/goods/32438971";
      expect(PlatformDetector.detectPlatform(url)).toBe("ably");
    });

    it("kurly URL 감지", () => {
      const url = "https://www.kurly.com/goods/1000284986";
      expect(PlatformDetector.detectPlatform(url)).toBe("kurly");
    });

    it("zigzag URL 감지", () => {
      const url = "https://zigzag.kr/catalog/products/157001205";
      expect(PlatformDetector.detectPlatform(url)).toBe("zigzag");
    });

    it("미지원 URL은 null 반환", () => {
      const url = "https://www.coupang.com/products/123456";
      expect(PlatformDetector.detectPlatform(url)).toBeNull();
    });
  });

  describe("extractProductId", () => {
    it("oliveyoung goodsNo 추출", () => {
      const url =
        "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822";
      expect(PlatformDetector.extractProductId(url)).toBe("A000000231822");
    });

    it("oliveyoung 쿼리 파라미터 포함 URL", () => {
      const url =
        "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822&srsltid=abc";
      expect(PlatformDetector.extractProductId(url)).toBe("A000000231822");
    });

    it("hwahae /goods/{id} 추출", () => {
      const url = "https://www.hwahae.co.kr/goods/21320";
      expect(PlatformDetector.extractProductId(url)).toBe("21320");
    });

    it("hwahae /products/{name}/{id} 추출", () => {
      const url = "https://www.hwahae.co.kr/products/상품명/2099549";
      expect(PlatformDetector.extractProductId(url)).toBe("2099549");
    });

    it("hwahae 쿼리 파라미터 포함 URL", () => {
      const url = "https://www.hwahae.co.kr/goods/66061?srsltid=abc";
      expect(PlatformDetector.extractProductId(url)).toBe("66061");
    });

    it("musinsa /products/{id} 추출", () => {
      const url = "https://www.musinsa.com/products/4350236";
      expect(PlatformDetector.extractProductId(url)).toBe("4350236");
    });

    it("musinsa 쿼리 파라미터 포함 URL", () => {
      const url = "https://www.musinsa.com/products/4350236?srsltid=abc";
      expect(PlatformDetector.extractProductId(url)).toBe("4350236");
    });

    it("ably /goods/{id} 추출", () => {
      const url = "https://m.a-bly.com/goods/32438971";
      expect(PlatformDetector.extractProductId(url)).toBe("32438971");
    });

    it("kurly /goods/{id} 추출", () => {
      const url = "https://www.kurly.com/goods/1000284986";
      expect(PlatformDetector.extractProductId(url)).toBe("1000284986");
    });

    it("zigzag /catalog/products/{id} 추출", () => {
      const url = "https://zigzag.kr/catalog/products/157001205";
      expect(PlatformDetector.extractProductId(url)).toBe("157001205");
    });

    it("미지원 URL은 null 반환", () => {
      const url = "https://www.coupang.com/products/123456";
      expect(PlatformDetector.extractProductId(url)).toBeNull();
    });
  });

  describe("detect", () => {
    it("올바른 URL에서 플랫폼 + 상품ID 동시 추출", () => {
      const url =
        "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822";
      const result = PlatformDetector.detect(url);

      expect(result.platform).toBe("oliveyoung");
      expect(result.productId).toBe("A000000231822");
    });

    it("미지원 URL은 모두 null 반환", () => {
      const url = "https://www.coupang.com/products/123456";
      const result = PlatformDetector.detect(url);

      expect(result.platform).toBeNull();
      expect(result.productId).toBeNull();
    });
  });

  describe("isSupported", () => {
    it("지원 플랫폼 확인", () => {
      expect(PlatformDetector.isSupported("oliveyoung")).toBe(true);
      expect(PlatformDetector.isSupported("hwahae")).toBe(true);
      expect(PlatformDetector.isSupported("musinsa")).toBe(true);
      expect(PlatformDetector.isSupported("ably")).toBe(true);
      expect(PlatformDetector.isSupported("kurly")).toBe(true);
      expect(PlatformDetector.isSupported("zigzag")).toBe(true);
    });

    it("미지원 플랫폼 확인", () => {
      expect(PlatformDetector.isSupported("coupang")).toBe(false);
      expect(PlatformDetector.isSupported("11st")).toBe(false);
    });
  });

  describe("SUPPORTED_PLATFORMS", () => {
    it("6개 플랫폼 지원", () => {
      expect(SUPPORTED_PLATFORMS).toHaveLength(6);
      expect(SUPPORTED_PLATFORMS).toContain("oliveyoung");
      expect(SUPPORTED_PLATFORMS).toContain("hwahae");
      expect(SUPPORTED_PLATFORMS).toContain("musinsa");
      expect(SUPPORTED_PLATFORMS).toContain("ably");
      expect(SUPPORTED_PLATFORMS).toContain("kurly");
      expect(SUPPORTED_PLATFORMS).toContain("zigzag");
    });
  });
});


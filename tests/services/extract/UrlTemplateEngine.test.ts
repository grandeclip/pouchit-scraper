/**
 * UrlTemplateEngine 단위 테스트
 */

import { describe, it, expect } from "@jest/globals";
import { UrlTemplateEngine } from "@/services/extract/url/UrlTemplateEngine";

describe("UrlTemplateEngine", () => {
  describe("render", () => {
    it("단일 변수 치환", () => {
      const template = "https://example.com/products/${productId}";
      const result = UrlTemplateEngine.render(template, { productId: "12345" });

      expect(result).toBe("https://example.com/products/12345");
    });

    it("다중 변수 치환", () => {
      const template = "https://${domain}/api/${version}/products/${productId}";
      const result = UrlTemplateEngine.render(template, {
        domain: "api.example.com",
        version: "v2",
        productId: "12345",
      });

      expect(result).toBe("https://api.example.com/api/v2/products/12345");
    });

    it("변수 없는 템플릿은 그대로 반환", () => {
      const template = "https://example.com/products/12345";
      const result = UrlTemplateEngine.render(template, {});

      expect(result).toBe("https://example.com/products/12345");
    });

    it("누락된 변수는 원본 유지", () => {
      const template = "https://example.com/products/${productId}";
      const result = UrlTemplateEngine.render(template, {});

      // 누락된 변수는 치환되지 않음
      expect(result).toBe("https://example.com/products/${productId}");
    });
  });

  describe("hasProductDetailTemplate", () => {
    it("oliveyoung 템플릿 존재 확인", () => {
      expect(UrlTemplateEngine.hasProductDetailTemplate("oliveyoung")).toBe(
        true
      );
    });

    it("hwahae 템플릿 존재 확인", () => {
      expect(UrlTemplateEngine.hasProductDetailTemplate("hwahae")).toBe(true);
    });

    it("musinsa 템플릿 존재 확인", () => {
      expect(UrlTemplateEngine.hasProductDetailTemplate("musinsa")).toBe(true);
    });

    it("ably 템플릿 존재 확인", () => {
      expect(UrlTemplateEngine.hasProductDetailTemplate("ably")).toBe(true);
    });

    it("kurly 템플릿 존재 확인", () => {
      expect(UrlTemplateEngine.hasProductDetailTemplate("kurly")).toBe(true);
    });

    it("zigzag 템플릿 존재 확인", () => {
      expect(UrlTemplateEngine.hasProductDetailTemplate("zigzag")).toBe(true);
    });

    it("미지원 플랫폼은 false 반환", () => {
      expect(UrlTemplateEngine.hasProductDetailTemplate("unknown")).toBe(false);
    });
  });

  describe("buildProductDetailUrl", () => {
    it("oliveyoung URL 생성", () => {
      const url = UrlTemplateEngine.buildProductDetailUrl(
        "oliveyoung",
        "A000000231822"
      );

      expect(url).toBe(
        "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000231822"
      );
    });

    it("hwahae URL 생성", () => {
      const url = UrlTemplateEngine.buildProductDetailUrl("hwahae", "21320");

      expect(url).toBe("https://www.hwahae.co.kr/goods/21320");
    });

    it("musinsa URL 생성", () => {
      const url = UrlTemplateEngine.buildProductDetailUrl("musinsa", "4350236");

      expect(url).toBe("https://www.musinsa.com/products/4350236");
    });

    it("ably URL 생성", () => {
      const url = UrlTemplateEngine.buildProductDetailUrl("ably", "32438971");

      expect(url).toBe("https://m.a-bly.com/goods/32438971");
    });

    it("kurly URL 생성", () => {
      const url = UrlTemplateEngine.buildProductDetailUrl(
        "kurly",
        "1000284986"
      );

      expect(url).toBe("https://www.kurly.com/goods/1000284986");
    });

    it("zigzag URL 생성", () => {
      const url = UrlTemplateEngine.buildProductDetailUrl("zigzag", "157001205");

      expect(url).toBe("https://zigzag.kr/catalog/products/157001205");
    });

    it("미지원 플랫폼은 에러 발생", () => {
      expect(() => {
        UrlTemplateEngine.buildProductDetailUrl("unknown", "12345");
      }).toThrow(); // ConfigLoader에서 파일 없음 또는 템플릿 없음 에러 발생
    });
  });

  describe("getAllTemplates", () => {
    it("모든 플랫폼의 템플릿 반환", () => {
      const templates = UrlTemplateEngine.getAllTemplates();

      expect(Object.keys(templates)).toContain("oliveyoung");
      expect(Object.keys(templates)).toContain("hwahae");
      expect(Object.keys(templates)).toContain("musinsa");
      expect(Object.keys(templates)).toContain("ably");
      expect(Object.keys(templates)).toContain("kurly");
      expect(Object.keys(templates)).toContain("zigzag");
    });

    it("각 플랫폼에 productDetail 템플릿 존재", () => {
      const templates = UrlTemplateEngine.getAllTemplates();

      for (const [platform, config] of Object.entries(templates)) {
        expect(config.productDetail).toBeDefined();
        expect(typeof config.productDetail).toBe("string");
      }
    });
  });
});


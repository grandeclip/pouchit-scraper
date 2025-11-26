/**
 * ScanProductNode 단위 테스트
 *
 * Phase 4 Step 4.3 검증
 * Note: 브라우저 의존성이 있어 validate() 및 기본 속성 중심 테스트
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ScanProductNode } from "@/strategies/validation/ScanProductNode";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";

// Mock ProductSetSearchResult
const createMockProduct = (
  id: string,
  overrides: Partial<ProductSetSearchResult> = {},
): ProductSetSearchResult => ({
  product_set_id: `ps-${id}`,
  product_id: `prod-${id}`,
  link_url: `https://oliveyoung.co.kr/goods/${id}`,
  product_name: `Test Product ${id}`,
  thumbnail: `https://example.com/img/${id}.jpg`,
  original_price: 10000,
  discounted_price: 8000,
  sale_status: "on_sale",
  ...overrides,
});

describe("ScanProductNode", () => {
  let node: ScanProductNode;

  beforeEach(() => {
    node = new ScanProductNode();
  });

  describe("기본 속성", () => {
    it("type이 'scan_product'", () => {
      expect(node.type).toBe("scan_product");
    });

    it("name이 'ScanProductNode'", () => {
      expect(node.name).toBe("ScanProductNode");
    });
  });

  describe("validate()", () => {
    it("products 배열 있으면 valid", () => {
      const result = node.validate({
        products: [createMockProduct("1")],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("products 없으면 invalid", () => {
      const result = node.validate(
        {} as { products: ProductSetSearchResult[] },
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_PRODUCTS");
    });

    it("products가 배열 아니면 invalid", () => {
      const result = node.validate({
        products: "not-array" as unknown as ProductSetSearchResult[],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_PRODUCTS");
    });

    it("products가 빈 배열이면 invalid", () => {
      const result = node.validate({ products: [] });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("EMPTY_PRODUCTS");
    });

    it("다중 상품 배열 valid", () => {
      const result = node.validate({
        products: [
          createMockProduct("1"),
          createMockProduct("2"),
          createMockProduct("3"),
        ],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("설정", () => {
    it("기본 설정 사용", () => {
      const defaultNode = new ScanProductNode();
      // validate를 통해 노드가 정상 초기화되었는지 확인
      expect(
        defaultNode.validate({ products: [createMockProduct("1")] }).valid,
      ).toBe(true);
    });

    it("커스텀 설정 적용", () => {
      const customNode = new ScanProductNode({
        default_concurrency: 3,
        max_concurrency: 5,
        default_wait_time_ms: 2000,
        page_rotation_interval: 5,
        context_rotation_interval: 20,
        max_consecutive_failures: 3,
      });
      // validate를 통해 노드가 정상 초기화되었는지 확인
      expect(
        customNode.validate({ products: [createMockProduct("1")] }).valid,
      ).toBe(true);
    });
  });

  describe("타입 정합성", () => {
    it("ITypedNodeStrategy 인터페이스 구현", () => {
      // ITypedNodeStrategy 필수 메서드/속성 확인
      expect(typeof node.type).toBe("string");
      expect(typeof node.name).toBe("string");
      expect(typeof node.execute).toBe("function");
      expect(typeof node.validate).toBe("function");
      expect(typeof node.rollback).toBe("function");
    });

    it("validate 반환 타입 검증", () => {
      const result = node.validate({ products: [createMockProduct("1")] });

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
      expect(typeof result.valid).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});

describe("ScanProductNode 엣지 케이스", () => {
  let node: ScanProductNode;

  beforeEach(() => {
    node = new ScanProductNode();
  });

  it("URL 없는 상품도 배열로 전달 가능", () => {
    const productWithoutUrl = createMockProduct("1", { link_url: null });
    const result = node.validate({ products: [productWithoutUrl] });

    // validate는 배열 유효성만 검사, URL 유무는 execute에서 처리
    expect(result.valid).toBe(true);
  });

  it("대량 상품 목록 validate 통과", () => {
    const manyProducts = Array.from({ length: 1000 }, (_, i) =>
      createMockProduct(String(i)),
    );

    const result = node.validate({ products: manyProducts });
    expect(result.valid).toBe(true);
  });
});

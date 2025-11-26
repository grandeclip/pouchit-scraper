/**
 * CompareProductNode 단위 테스트
 *
 * Phase 4 Step 4.5 검증
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { CompareProductNode } from "@/strategies/validation/CompareProductNode";
import { INodeContext } from "@/core/interfaces/INodeContext";
import {
  SingleScanResult,
  SingleValidationResult,
} from "@/strategies/validation/types";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";
import pino from "pino";

// Mock INodeContext
const createMockContext = (
  overrides: Partial<INodeContext> = {},
): INodeContext => ({
  job_id: "test-job-123",
  workflow_id: "test-workflow-456",
  node_id: "test-node-789",
  config: {},
  input: {},
  params: {},
  platform: "oliveyoung",
  logger: pino({ level: "silent" }),
  platformConfig: {
    platform: "oliveyoung",
    platform_id: "OLIVEYOUNG",
    base_url: "https://www.oliveyoung.co.kr",
    strategies: [],
    rate_limit: { requests_per_minute: 60, delay_between_requests_ms: 1000 },
  },
  sharedState: new Map<string, unknown>(),
  ...overrides,
});

// Mock ProductSetSearchResult (DB 원본)
const createMockDbProduct = (
  id: string,
  overrides: Partial<ProductSetSearchResult> = {},
): ProductSetSearchResult => ({
  product_set_id: `ps-${id}`,
  product_id: `prod-${id}`,
  link_url: `https://example.com/product/${id}`,
  product_name: `DB Product ${id}`,
  thumbnail: `https://example.com/img/${id}.jpg`,
  original_price: 10000,
  discounted_price: 8000,
  sale_status: "on_sale",
  ...overrides,
});

// Mock SingleScanResult
const createMockScanResult = (
  id: string,
  scannedData: SingleScanResult["scanned_data"],
  success = true,
): SingleScanResult => ({
  product_set_id: `ps-${id}`,
  product_id: `prod-${id}`,
  success,
  scanned_data: scannedData,
  url: `https://example.com/product/${id}`,
  scanned_at: "2024-01-01T00:00:00+09:00",
  ...(success ? {} : { error: "Scan failed" }),
});

// Mock SingleValidationResult
const createMockValidationResult = (
  id: string,
  scanResult: SingleScanResult,
  isValid = true,
): SingleValidationResult => ({
  product_set_id: `ps-${id}`,
  product_id: `prod-${id}`,
  scan_result: scanResult,
  is_valid: isValid,
  checks: [],
  validated_at: "2024-01-01T00:00:00+09:00",
});

describe("CompareProductNode", () => {
  let node: CompareProductNode;

  beforeEach(() => {
    node = new CompareProductNode();
  });

  describe("기본 속성", () => {
    it("type이 'compare_product'", () => {
      expect(node.type).toBe("compare_product");
    });

    it("name이 'CompareProductNode'", () => {
      expect(node.name).toBe("CompareProductNode");
    });
  });

  describe("validate()", () => {
    it("모든 필드 있으면 valid", () => {
      const result = node.validate({
        results: [],
        original_products: [],
      });
      expect(result.valid).toBe(true);
    });

    it("results 없으면 invalid", () => {
      const result = node.validate({
        original_products: [],
      } as unknown as {
        results: SingleValidationResult[];
        original_products: ProductSetSearchResult[];
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_RESULTS");
    });

    it("original_products 없으면 invalid", () => {
      const result = node.validate({
        results: [],
      } as unknown as {
        results: SingleValidationResult[];
        original_products: ProductSetSearchResult[];
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_ORIGINAL_PRODUCTS");
    });
  });

  describe("execute() - 일치 케이스", () => {
    it("완전 일치", async () => {
      const dbProduct = createMockDbProduct("1");
      const scanResult = createMockScanResult("1", {
        product_name: "DB Product 1",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 8000,
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.match_count).toBe(1);
      expect(result.data.mismatch_count).toBe(0);
      expect(result.data.results[0].is_match).toBe(true);
      expect(result.data.results[0].status).toBe("success");
    });

    it("빈 배열 처리", async () => {
      const context = createMockContext();
      const input = { results: [], original_products: [] };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.match_count).toBe(0);
      expect(result.data.results).toHaveLength(0);
    });
  });

  describe("execute() - 불일치 케이스", () => {
    it("상품명 불일치", async () => {
      const dbProduct = createMockDbProduct("1", { product_name: "DB Name" });
      const scanResult = createMockScanResult("1", {
        product_name: "Different Name",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 8000,
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await node.execute(input, context);

      expect(result.data.mismatch_count).toBe(1);
      expect(result.data.results[0].is_match).toBe(false);
      expect(result.data.results[0].comparison.product_name).toBe(false);
    });

    it("가격 불일치", async () => {
      const dbProduct = createMockDbProduct("1", { discounted_price: 8000 });
      const scanResult = createMockScanResult("1", {
        product_name: "DB Product 1",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 7000, // 다른 가격
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await node.execute(input, context);

      expect(result.data.results[0].is_match).toBe(false);
      expect(result.data.results[0].comparison.discounted_price).toBe(false);
    });

    it("판매상태 불일치", async () => {
      const dbProduct = createMockDbProduct("1", { sale_status: "on_sale" });
      const scanResult = createMockScanResult("1", {
        product_name: "DB Product 1",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 8000,
        sale_status: "sold_out", // 다른 상태
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await node.execute(input, context);

      expect(result.data.results[0].is_match).toBe(false);
      expect(result.data.results[0].comparison.sale_status).toBe(false);
    });
  });

  describe("execute() - 실패 케이스", () => {
    it("원본 상품 없음 (not_found)", async () => {
      const scanResult = createMockScanResult("1", {
        product_name: "Scanned Product",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 8000,
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [], // 원본 없음
      };

      const result = await node.execute(input, context);

      expect(result.data.failure_count).toBe(1);
      expect(result.data.results[0].status).toBe("not_found");
    });

    it("스캔 실패 (failed)", async () => {
      const dbProduct = createMockDbProduct("1");
      const scanResult = createMockScanResult("1", undefined, false);
      const validationResult = createMockValidationResult(
        "1",
        scanResult,
        false,
      );

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await node.execute(input, context);

      expect(result.data.failure_count).toBe(1);
      expect(result.data.results[0].status).toBe("failed");
    });
  });

  describe("execute() - sharedState에서 원본 조회", () => {
    it("input에 없으면 sharedState에서 가져옴", async () => {
      const dbProduct = createMockDbProduct("1");
      const scanResult = createMockScanResult("1", {
        product_name: "DB Product 1",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 8000,
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const sharedState = new Map<string, unknown>();
      sharedState.set("original_products", [dbProduct]);

      const context = createMockContext({ sharedState });
      const input = {
        results: [validationResult],
        original_products: [], // 빈 배열
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.match_count).toBe(1);
    });
  });

  describe("price_tolerance_percent", () => {
    it("허용 오차 내 가격 차이는 일치로 처리", async () => {
      const tolerantNode = new CompareProductNode({
        price_tolerance_percent: 10, // 10% 허용
      });

      const dbProduct = createMockDbProduct("1", { discounted_price: 10000 });
      const scanResult = createMockScanResult("1", {
        product_name: "DB Product 1",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 9500, // 5% 차이
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await tolerantNode.execute(input, context);

      expect(result.data.results[0].comparison.discounted_price).toBe(true);
    });

    it("허용 오차 초과 가격 차이는 불일치", async () => {
      const tolerantNode = new CompareProductNode({
        price_tolerance_percent: 5, // 5% 허용
      });

      const dbProduct = createMockDbProduct("1", { discounted_price: 10000 });
      const scanResult = createMockScanResult("1", {
        product_name: "DB Product 1",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 8000, // 20% 차이
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await tolerantNode.execute(input, context);

      expect(result.data.results[0].comparison.discounted_price).toBe(false);
    });
  });

  describe("compare_fields 설정", () => {
    it("특정 필드만 비교", async () => {
      const selectiveNode = new CompareProductNode({
        compare_fields: ["sale_status"], // 판매상태만 비교
      });

      const dbProduct = createMockDbProduct("1", {
        product_name: "DB Name",
        discounted_price: 8000,
      });
      const scanResult = createMockScanResult("1", {
        product_name: "Different Name", // 다름
        thumbnail: "https://different.com/img.jpg", // 다름
        original_price: 10000,
        discounted_price: 5000, // 다름
        sale_status: "on_sale", // 같음
      });
      const validationResult = createMockValidationResult("1", scanResult);

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await selectiveNode.execute(input, context);

      // sale_status만 비교하므로 일치
      expect(result.data.results[0].is_match).toBe(true);
    });
  });

  describe("include_invalid 설정", () => {
    it("include_invalid=false면 검증 실패 결과 제외", async () => {
      const strictNode = new CompareProductNode({
        include_invalid: false,
      });

      const dbProduct = createMockDbProduct("1");
      const scanResult = createMockScanResult("1", {
        product_name: "DB Product 1",
        thumbnail: "https://example.com/img/1.jpg",
        original_price: 10000,
        discounted_price: 8000,
        sale_status: "on_sale",
      });
      const validationResult = createMockValidationResult(
        "1",
        scanResult,
        false,
      ); // is_valid = false

      const context = createMockContext();
      const input = {
        results: [validationResult],
        original_products: [dbProduct],
      };

      const result = await strictNode.execute(input, context);

      expect(result.data.results).toHaveLength(0);
    });
  });

  describe("타입 정합성", () => {
    it("ITypedNodeStrategy 인터페이스 구현", () => {
      expect(typeof node.type).toBe("string");
      expect(typeof node.name).toBe("string");
      expect(typeof node.execute).toBe("function");
      expect(typeof node.validate).toBe("function");
      expect(typeof node.rollback).toBe("function");
    });

    it("출력 타입 검증", async () => {
      const context = createMockContext();
      const input = { results: [], original_products: [] };

      const result = await node.execute(input, context);

      expect(result.data).toHaveProperty("results");
      expect(result.data).toHaveProperty("match_count");
      expect(result.data).toHaveProperty("mismatch_count");
      expect(result.data).toHaveProperty("failure_count");
    });
  });
});

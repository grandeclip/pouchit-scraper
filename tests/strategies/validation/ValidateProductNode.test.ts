/**
 * ValidateProductNode 단위 테스트
 *
 * Phase 4 Step 4.4 검증
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ValidateProductNode } from "@/strategies/validation/ValidateProductNode";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { SingleScanResult } from "@/strategies/validation/types";
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

// Mock SingleScanResult (성공)
const createSuccessScanResult = (
  id: string,
  overrides: Partial<SingleScanResult["scanned_data"]> = {},
): SingleScanResult => ({
  product_set_id: `ps-${id}`,
  product_id: `prod-${id}`,
  success: true,
  scanned_data: {
    product_name: `Test Product ${id}`,
    thumbnail: `https://example.com/img/${id}.jpg`,
    original_price: 10000,
    discounted_price: 8000,
    sale_status: "on_sale",
    ...overrides,
  },
  url: `https://example.com/product/${id}`,
  scanned_at: "2024-01-01T00:00:00+09:00",
});

// Mock SingleScanResult (실패)
const createFailedScanResult = (
  id: string,
  error: string,
): SingleScanResult => ({
  product_set_id: `ps-${id}`,
  product_id: `prod-${id}`,
  success: false,
  error,
  url: `https://example.com/product/${id}`,
  scanned_at: "2024-01-01T00:00:00+09:00",
});

describe("ValidateProductNode", () => {
  let node: ValidateProductNode;

  beforeEach(() => {
    node = new ValidateProductNode();
  });

  describe("기본 속성", () => {
    it("type이 'validate_product'", () => {
      expect(node.type).toBe("validate_product");
    });

    it("name이 'ValidateProductNode'", () => {
      expect(node.name).toBe("ValidateProductNode");
    });
  });

  describe("validate()", () => {
    it("results 배열 있으면 valid", () => {
      const result = node.validate({ results: [] });
      expect(result.valid).toBe(true);
    });

    it("results 없으면 invalid", () => {
      const result = node.validate({} as { results: SingleScanResult[] });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_RESULTS");
    });

    it("results가 배열 아니면 invalid", () => {
      const result = node.validate({
        results: "not-array" as unknown as SingleScanResult[],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("execute() - 성공 케이스", () => {
    it("정상 스캔 결과 검증 통과", async () => {
      const context = createMockContext();
      const input = {
        results: [createSuccessScanResult("1")],
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.valid_count).toBe(1);
      expect(result.data.invalid_count).toBe(0);
      expect(result.data.results[0].is_valid).toBe(true);
    });

    it("다수 상품 검증", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1"),
          createSuccessScanResult("2"),
          createSuccessScanResult("3"),
        ],
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.valid_count).toBe(3);
      expect(result.data.results).toHaveLength(3);
    });

    it("빈 배열 처리", async () => {
      const context = createMockContext();
      const input = { results: [] };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.valid_count).toBe(0);
      expect(result.data.invalid_count).toBe(0);
    });
  });

  describe("execute() - 스캔 실패 처리", () => {
    it("스캔 실패 결과는 검증 실패", async () => {
      const context = createMockContext();
      const input = {
        results: [createFailedScanResult("1", "Page timeout")],
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.invalid_count).toBe(1);
      expect(result.data.results[0].is_valid).toBe(false);
      expect(result.data.results[0].checks[0].field).toBe("scan_status");
    });

    it("혼합 결과 처리 (성공 + 실패)", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1"),
          createFailedScanResult("2", "Network error"),
          createSuccessScanResult("3"),
        ],
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.valid_count).toBe(2);
      expect(result.data.invalid_count).toBe(1);
    });
  });

  describe("execute() - 필드 검증", () => {
    it("product_name 없으면 invalid", async () => {
      const context = createMockContext();
      const input = {
        results: [createSuccessScanResult("1", { product_name: "" })],
      };

      const result = await node.execute(input, context);

      expect(result.data.results[0].is_valid).toBe(false);
      const nameCheck = result.data.results[0].checks.find(
        (c) => c.field === "product_name",
      );
      expect(nameCheck?.valid).toBe(false);
    });

    it("음수 가격은 invalid", async () => {
      const context = createMockContext();
      const input = {
        results: [createSuccessScanResult("1", { original_price: -100 })],
      };

      const result = await node.execute(input, context);

      expect(result.data.results[0].is_valid).toBe(false);
      const priceCheck = result.data.results[0].checks.find(
        (c) => c.field === "original_price" && !c.valid,
      );
      expect(priceCheck).toBeDefined();
    });

    it("discounted > original 가격 불일치", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1", {
            original_price: 5000,
            discounted_price: 10000,
          }),
        ],
      };

      const result = await node.execute(input, context);

      expect(result.data.results[0].is_valid).toBe(false);
      const consistencyCheck = result.data.results[0].checks.find(
        (c) => c.field === "price_consistency",
      );
      expect(consistencyCheck?.valid).toBe(false);
    });

    it("잘못된 sale_status", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1", {
            sale_status: "invalid_status",
          }),
        ],
      };

      const result = await node.execute(input, context);

      expect(result.data.results[0].is_valid).toBe(false);
      const statusCheck = result.data.results[0].checks.find(
        (c) => c.field === "sale_status_valid",
      );
      expect(statusCheck?.valid).toBe(false);
    });
  });

  describe("execute() - 경고 처리", () => {
    it("0원 상품 경고 (valid는 true)", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1", {
            discounted_price: 0,
            sale_status: "on_sale",
          }),
        ],
      };

      const result = await node.execute(input, context);

      // 기본 모드에서 경고는 valid
      expect(result.data.results[0].is_valid).toBe(true);
      const zeroCheck = result.data.results[0].checks.find(
        (c) => c.field === "zero_price",
      );
      expect(zeroCheck?.message).toContain("Warning");
    });

    it("높은 할인율 경고", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1", {
            original_price: 100000,
            discounted_price: 5000, // 95% 할인
          }),
        ],
      };

      const result = await node.execute(input, context);

      const discountCheck = result.data.results[0].checks.find(
        (c) => c.field === "discount_rate",
      );
      expect(discountCheck?.message).toContain("Warning");
    });
  });

  describe("strict_mode", () => {
    it("strict_mode에서 경고도 실패 처리", async () => {
      const strictNode = new ValidateProductNode({ strict_mode: true });
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1", {
            discounted_price: 0,
            sale_status: "on_sale",
          }),
        ],
      };

      const result = await strictNode.execute(input, context);

      // strict 모드에서 경고는 invalid
      expect(result.data.results[0].is_valid).toBe(false);
    });
  });

  describe("커스텀 설정", () => {
    it("required_fields 커스텀", async () => {
      const customNode = new ValidateProductNode({
        required_fields: ["product_name", "thumbnail"],
      });
      const context = createMockContext();
      const input = {
        results: [createSuccessScanResult("1", { thumbnail: "" })],
      };

      const result = await customNode.execute(input, context);

      expect(result.data.results[0].is_valid).toBe(false);
    });

    it("max_discount_rate_warning 커스텀", async () => {
      const customNode = new ValidateProductNode({
        max_discount_rate_warning: 50,
      });
      const context = createMockContext();
      const input = {
        results: [
          createSuccessScanResult("1", {
            original_price: 10000,
            discounted_price: 4000, // 60% 할인
          }),
        ],
      };

      const result = await customNode.execute(input, context);

      const discountCheck = result.data.results[0].checks.find(
        (c) => c.field === "discount_rate",
      );
      expect(discountCheck?.message).toContain("exceeds 50%");
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
      const input = { results: [createSuccessScanResult("1")] };

      const result = await node.execute(input, context);

      expect(result.data).toHaveProperty("results");
      expect(result.data).toHaveProperty("valid_count");
      expect(result.data).toHaveProperty("invalid_count");
      expect(Array.isArray(result.data.results)).toBe(true);
    });
  });
});

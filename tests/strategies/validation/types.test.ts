/**
 * Phase 4 Validation Types 테스트
 *
 * 타입 정의 및 헬퍼 함수 검증
 */

import { describe, it, expect } from "@jest/globals";
import {
  createSuccessResult,
  createErrorResult,
  validationSuccess,
  validationFailure,
} from "@/core/interfaces/ITypedNodeStrategy";
import type {
  FetchProductInput,
  FetchProductOutput,
  ScanProductInput,
  ScanProductOutput,
  SingleScanResult,
} from "@/strategies/validation/types";

describe("ITypedNodeStrategy 헬퍼 함수", () => {
  describe("createSuccessResult()", () => {
    it("성공 결과 생성", () => {
      const data = { count: 5, items: ["a", "b", "c"] };
      const result = createSuccessResult(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.error).toBeUndefined();
    });

    it("next_nodes 포함", () => {
      const data = { value: 1 };
      const result = createSuccessResult(data, ["node_a", "node_b"]);

      expect(result.success).toBe(true);
      expect(result.next_nodes).toEqual(["node_a", "node_b"]);
    });

    it("next_nodes 미지정시 undefined", () => {
      const result = createSuccessResult({ x: 1 });
      expect(result.next_nodes).toBeUndefined();
    });
  });

  describe("createErrorResult()", () => {
    it("에러 결과 생성", () => {
      const result = createErrorResult<{ count: number }>(
        "Something went wrong",
        "TEST_ERROR",
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Something went wrong");
      expect(result.error?.code).toBe("TEST_ERROR");
    });

    it("에러 상세 포함", () => {
      const details = { field: "name", value: null };
      const result = createErrorResult<unknown>(
        "Validation failed",
        "VALIDATION_ERROR",
        details,
      );

      expect(result.error?.details).toEqual(details);
    });

    it("details 미지정시 없음", () => {
      const result = createErrorResult<unknown>("Error", "ERR");
      expect(result.error?.details).toBeUndefined();
    });
  });

  describe("validationSuccess()", () => {
    it("valid: true, errors: []", () => {
      const result = validationSuccess();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("validationFailure()", () => {
    it("valid: false with errors", () => {
      const errors = [
        { field: "name", message: "Required", code: "REQUIRED" },
        { field: "age", message: "Must be positive" },
      ];

      const result = validationFailure(errors);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].code).toBe("REQUIRED");
      expect(result.errors[1].code).toBeUndefined();
    });
  });
});

describe("Phase 4 Types 구조", () => {
  describe("FetchProductInput/Output", () => {
    it("FetchProductInput 구조", () => {
      const input: FetchProductInput = {
        link_url_pattern: "%oliveyoung%",
        sale_status: "on_sale",
        product_id: "prod-123",
        limit: 100,
        batch_size: 10,
      };

      expect(input.link_url_pattern).toBeDefined();
      expect(input.limit).toBe(100);
    });

    it("FetchProductOutput 구조", () => {
      const output: FetchProductOutput = {
        products: [],
        count: 0,
        batch_info: {
          batch_size: 10,
          total_batches: 1,
        },
      };

      expect(output.count).toBe(0);
      expect(output.batch_info?.batch_size).toBe(10);
    });
  });

  describe("ScanProductInput/Output", () => {
    it("SingleScanResult 성공 구조", () => {
      const result: SingleScanResult = {
        product_set_id: "ps-1",
        product_id: "prod-1",
        success: true,
        scanned_data: {
          product_name: "Test Product",
          thumbnail: "https://example.com/img.jpg",
          original_price: 10000,
          discounted_price: 8000,
          sale_status: "on_sale",
        },
        url: "https://example.com/product/1",
        scanned_at: "2024-01-01T00:00:00+09:00",
      };

      expect(result.success).toBe(true);
      expect(result.scanned_data?.product_name).toBe("Test Product");
    });

    it("SingleScanResult 실패 구조", () => {
      const result: SingleScanResult = {
        product_set_id: "ps-1",
        product_id: "prod-1",
        success: false,
        error: "Failed to load page",
        url: "https://example.com/product/1",
        scanned_at: "2024-01-01T00:00:00+09:00",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.scanned_data).toBeUndefined();
    });

    it("ScanProductOutput 구조", () => {
      const output: ScanProductOutput = {
        results: [],
        success_count: 0,
        failure_count: 0,
      };

      expect(output.results).toEqual([]);
      expect(output.success_count + output.failure_count).toBe(0);
    });
  });
});

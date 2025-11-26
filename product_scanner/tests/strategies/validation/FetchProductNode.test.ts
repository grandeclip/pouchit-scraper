/**
 * FetchProductNode 단위 테스트
 *
 * Phase 4 Step 4.2 검증
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { FetchProductNode } from "@/strategies/validation/FetchProductNode";
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";
import pino from "pino";

// Mock IProductSearchService
const createMockService = (
  products: ProductSetSearchResult[] = [],
): IProductSearchService => ({
  searchProducts: jest
    .fn<IProductSearchService["searchProducts"]>()
    .mockResolvedValue(products),
  getProductById: jest
    .fn<IProductSearchService["getProductById"]>()
    .mockResolvedValue(null),
  healthCheck: jest
    .fn<IProductSearchService["healthCheck"]>()
    .mockResolvedValue(true),
});

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

describe("FetchProductNode", () => {
  let node: FetchProductNode;
  let mockService: IProductSearchService;

  beforeEach(() => {
    mockService = createMockService();
    node = new FetchProductNode(mockService);
  });

  describe("기본 속성", () => {
    it("type이 'fetch_product'", () => {
      expect(node.type).toBe("fetch_product");
    });

    it("name이 'FetchProductNode'", () => {
      expect(node.name).toBe("FetchProductNode");
    });
  });

  describe("validate()", () => {
    it("link_url_pattern 있으면 valid", () => {
      const result = node.validate({ link_url_pattern: "%oliveyoung%" });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("product_id 있으면 valid", () => {
      const result = node.validate({ product_id: "prod-123" });
      expect(result.valid).toBe(true);
    });

    it("둘 다 없으면 invalid", () => {
      const result = node.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("MISSING_FILTER");
    });

    it("limit이 음수면 invalid", () => {
      const result = node.validate({
        link_url_pattern: "%test%",
        limit: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_LIMIT");
    });

    it("limit이 max_limit 초과시 invalid", () => {
      const result = node.validate({
        link_url_pattern: "%test%",
        limit: 99999,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("LIMIT_EXCEEDED");
    });

    it("batch_size가 음수면 invalid", () => {
      const result = node.validate({
        link_url_pattern: "%test%",
        batch_size: -1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_BATCH_SIZE");
    });
  });

  describe("execute()", () => {
    it("상품 조회 성공", async () => {
      const mockProducts = [createMockProduct("1"), createMockProduct("2")];
      mockService = createMockService(mockProducts);
      node = new FetchProductNode(mockService);

      const context = createMockContext();
      const input = { link_url_pattern: "%oliveyoung%" };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.products).toHaveLength(2);
      expect(result.data.count).toBe(2);
      expect(result.data.batch_info).toBeDefined();
    });

    it("빈 결과 처리", async () => {
      mockService = createMockService([]);
      node = new FetchProductNode(mockService);

      const context = createMockContext();
      const input = { link_url_pattern: "%nonexistent%" };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.products).toHaveLength(0);
      expect(result.data.count).toBe(0);
    });

    it("입력 검증 실패시 에러 반환", async () => {
      const context = createMockContext();
      const input = {}; // 필수 필드 없음

      const result = await node.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("서비스 에러시 적절한 에러 반환", async () => {
      // 에러를 던지는 mock 서비스 생성
      const errorService: IProductSearchService = {
        searchProducts: jest
          .fn<IProductSearchService["searchProducts"]>()
          .mockRejectedValue(new Error("DB connection failed")),
        getProductById: jest
          .fn<IProductSearchService["getProductById"]>()
          .mockResolvedValue(null),
        healthCheck: jest
          .fn<IProductSearchService["healthCheck"]>()
          .mockResolvedValue(true),
      };
      node = new FetchProductNode(errorService);

      const context = createMockContext();
      const input = { link_url_pattern: "%test%" };

      const result = await node.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_PRODUCT_ERROR");
      expect(result.error?.message).toContain("DB connection failed");
    });

    it("sharedState에 original_products 저장", async () => {
      const mockProducts = [createMockProduct("1")];
      mockService = createMockService(mockProducts);
      node = new FetchProductNode(mockService);

      const context = createMockContext();
      const input = { link_url_pattern: "%test%" };

      await node.execute(input, context);

      expect(context.sharedState.get("original_products")).toEqual(
        mockProducts,
      );
    });

    it("batch_info 계산 정확성", async () => {
      const mockProducts = Array.from({ length: 15 }, (_, i) =>
        createMockProduct(String(i)),
      );
      mockService = createMockService(mockProducts);
      node = new FetchProductNode(mockService);

      const context = createMockContext();
      const input = { link_url_pattern: "%test%", batch_size: 10 };

      const result = await node.execute(input, context);

      expect(result.data.batch_info?.batch_size).toBe(10);
      expect(result.data.batch_info?.total_batches).toBe(2); // 15/10 = 2 batches
    });
  });

  describe("config 병합", () => {
    it("context.config 값이 input에 없으면 사용됨", async () => {
      mockService = createMockService([createMockProduct("1")]);
      node = new FetchProductNode(mockService);

      const context = createMockContext({
        config: { link_url_pattern: "%from-config%", limit: 50 },
      });
      const input = {}; // 빈 input

      await node.execute(input, context);

      expect(mockService.searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          link_url_pattern: "%from-config%",
          limit: 50,
        }),
      );
    });

    it("input 값이 config보다 우선", async () => {
      mockService = createMockService([createMockProduct("1")]);
      node = new FetchProductNode(mockService);

      const context = createMockContext({
        config: { link_url_pattern: "%from-config%", limit: 50 },
      });
      const input = { link_url_pattern: "%from-input%", limit: 100 };

      await node.execute(input, context);

      expect(mockService.searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          link_url_pattern: "%from-input%",
          limit: 100,
        }),
      );
    });
  });
});

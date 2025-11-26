/**
 * SaveResultNode 단위 테스트
 *
 * Phase 4 Step 4.6 검증
 * Note: 파일 I/O는 mock 또는 실제 temp 디렉토리 사용
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { SaveResultNode } from "@/strategies/validation/SaveResultNode";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { SingleComparisonResult } from "@/strategies/validation/types";
import pino from "pino";

// 테스트용 임시 디렉토리
let tempDir: string;

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

// Mock SingleComparisonResult
const createMockComparisonResult = (
  id: string,
  status: "success" | "failed" | "not_found",
  isMatch = true,
): SingleComparisonResult => ({
  product_set_id: `ps-${id}`,
  product_id: `prod-${id}`,
  url: `https://example.com/product/${id}`,
  db: {
    product_name: `DB Product ${id}`,
    thumbnail: `https://example.com/img/${id}.jpg`,
    original_price: 10000,
    discounted_price: 8000,
    sale_status: "on_sale",
  },
  scanned:
    status === "success"
      ? {
          product_name: isMatch
            ? `DB Product ${id}`
            : `Different Product ${id}`,
          thumbnail: `https://example.com/img/${id}.jpg`,
          original_price: 10000,
          discounted_price: 8000,
          sale_status: "on_sale",
        }
      : null,
  comparison: {
    product_name: isMatch,
    thumbnail: true,
    original_price: true,
    discounted_price: true,
    sale_status: true,
  },
  is_match: isMatch,
  status,
  compared_at: "2024-01-01T00:00:00+09:00",
});

describe("SaveResultNode", () => {
  let node: SaveResultNode;

  beforeEach(async () => {
    // 테스트용 임시 디렉토리 생성
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "save-result-test-"));
    node = new SaveResultNode({
      output_dir: tempDir,
      use_date_subdir: false, // 테스트에서는 날짜 서브디렉토리 미사용
    });
  });

  afterEach(async () => {
    // 임시 디렉토리 정리
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe("기본 속성", () => {
    it("type이 'save_result'", () => {
      expect(node.type).toBe("save_result");
    });

    it("name이 'SaveResultNode'", () => {
      expect(node.name).toBe("SaveResultNode");
    });
  });

  describe("validate()", () => {
    it("results 배열 있으면 valid", () => {
      const result = node.validate({ results: [] });
      expect(result.valid).toBe(true);
    });

    it("results 없으면 invalid", () => {
      const result = node.validate({} as { results: SingleComparisonResult[] });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("INVALID_RESULTS");
    });

    it("results가 배열 아니면 invalid", () => {
      const result = node.validate({
        results: "not-array" as unknown as SingleComparisonResult[],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("execute() - Summary 계산", () => {
    it("모든 성공 + 일치", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createMockComparisonResult("1", "success", true),
          createMockComparisonResult("2", "success", true),
        ],
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.summary).toEqual({
        total: 2,
        success: 2,
        failed: 0,
        not_found: 0,
        match: 2,
        mismatch: 0,
      });
    });

    it("성공 + 불일치", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createMockComparisonResult("1", "success", true),
          createMockComparisonResult("2", "success", false), // 불일치
        ],
      };

      const result = await node.execute(input, context);

      expect(result.data.summary.match).toBe(1);
      expect(result.data.summary.mismatch).toBe(1);
    });

    it("혼합 상태 (success, failed, not_found)", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createMockComparisonResult("1", "success", true),
          createMockComparisonResult("2", "failed", false),
          createMockComparisonResult("3", "not_found", false),
        ],
      };

      const result = await node.execute(input, context);

      expect(result.data.summary).toEqual({
        total: 3,
        success: 1,
        failed: 1,
        not_found: 1,
        match: 1,
        mismatch: 0,
      });
    });

    it("빈 배열", async () => {
      const context = createMockContext();
      const input = { results: [] };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.summary.total).toBe(0);
    });
  });

  describe("execute() - JSONL 저장", () => {
    it("JSONL 파일 생성 및 경로 반환", async () => {
      const context = createMockContext();
      const input = {
        results: [createMockComparisonResult("1", "success", true)],
        options: { save_to_jsonl: true },
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.jsonl_path).toBeDefined();
      expect(result.data.record_count).toBe(1);

      // 파일 존재 확인
      const fileExists = await fs
        .access(result.data.jsonl_path!)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("save_to_jsonl=false면 파일 생성 안함", async () => {
      const context = createMockContext();
      const input = {
        results: [createMockComparisonResult("1", "success", true)],
        options: { save_to_jsonl: false },
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.jsonl_path).toBeUndefined();
      expect(result.data.record_count).toBe(0);
    });

    it("JSONL 파일 내용 확인", async () => {
      const context = createMockContext();
      const input = {
        results: [
          createMockComparisonResult("1", "success", true),
          createMockComparisonResult("2", "failed", false),
        ],
        options: { save_to_jsonl: true },
      };

      const result = await node.execute(input, context);

      // 파일 내용 읽기
      const content = await fs.readFile(result.data.jsonl_path!, "utf-8");
      const lines = content.trim().split("\n");

      // header + 2 records + footer = 4 lines
      expect(lines.length).toBe(4);

      // 첫 줄은 메타 헤더
      const header = JSON.parse(lines[0]);
      expect(header._meta).toBe(true);
      expect(header.type).toBe("header");

      // 마지막 줄은 메타 푸터
      const footer = JSON.parse(lines[3]);
      expect(footer._meta).toBe(true);
      expect(footer.type).toBe("footer");
    });
  });

  describe("execute() - sharedState 저장", () => {
    it("save_result를 sharedState에 저장", async () => {
      const sharedState = new Map<string, unknown>();
      const context = createMockContext({ sharedState });
      const input = {
        results: [createMockComparisonResult("1", "success", true)],
      };

      await node.execute(input, context);

      expect(sharedState.has("save_result")).toBe(true);
      const savedResult = sharedState.get("save_result") as {
        summary: unknown;
      };
      expect(savedResult.summary).toBeDefined();
    });
  });

  describe("execute() - 옵션", () => {
    it("기본 옵션 사용 (save_to_jsonl=true)", async () => {
      const defaultNode = new SaveResultNode({
        output_dir: tempDir,
        default_save_to_jsonl: true,
        use_date_subdir: false,
      });

      const context = createMockContext();
      const input = {
        results: [createMockComparisonResult("1", "success", true)],
        // options 미지정 - 기본값 사용
      };

      const result = await defaultNode.execute(input, context);

      expect(result.data.jsonl_path).toBeDefined();
    });

    it("save_to_supabase=true (현재 미구현, 0 반환)", async () => {
      const context = createMockContext();
      const input = {
        results: [createMockComparisonResult("1", "success", true)],
        options: { save_to_supabase: true, save_to_jsonl: false },
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.supabase_updated).toBe(0);
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
      const input = { results: [] };

      const result = await node.execute(input, context);

      expect(result.data).toHaveProperty("record_count");
      expect(result.data).toHaveProperty("summary");
      expect(result.data.summary).toHaveProperty("total");
      expect(result.data.summary).toHaveProperty("success");
      expect(result.data.summary).toHaveProperty("failed");
      expect(result.data.summary).toHaveProperty("match");
      expect(result.data.summary).toHaveProperty("mismatch");
    });
  });
});

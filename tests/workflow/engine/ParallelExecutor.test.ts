/**
 * ParallelExecutor 단위 테스트
 *
 * Phase 4 Step 4.8
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  ParallelExecutor,
  NodeExecutionInfo,
} from "@/workflow/engine/ParallelExecutor";
import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  createSuccessResult,
  createErrorResult,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import pino from "pino";

// Mock Logger
const mockLogger = pino({ level: "silent" });

// Mock Node Strategy (Legacy)
const createMockStrategy = (
  type: string,
  result: NodeResult,
  delay = 0,
): INodeStrategy => ({
  type,
  execute: jest.fn(async () => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return result;
  }) as jest.MockedFunction<INodeStrategy["execute"]>,
  validateConfig: jest.fn(),
});

// Mock Typed Node Strategy
const createMockTypedStrategy = <TInput, TOutput>(
  type: string,
  result: ITypedNodeResult<TOutput>,
  delay = 0,
): ITypedNodeStrategy<TInput, TOutput> => ({
  type,
  name: `Mock${type}Node`,
  execute: jest.fn(async () => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return result;
  }) as jest.MockedFunction<ITypedNodeStrategy<TInput, TOutput>["execute"]>,
});

// Mock NodeContext
const createMockContext = (nodeId: string): NodeContext => ({
  job_id: "test-job-123",
  workflow_id: "test-workflow-456",
  node_id: nodeId,
  config: {},
  input: {},
  params: {},
});

// Mock INodeContext
const createMockINodeContext = (nodeId: string): INodeContext => ({
  job_id: "test-job-123",
  workflow_id: "test-workflow-456",
  node_id: nodeId,
  config: {},
  input: {},
  params: {},
  platform: "test",
  logger: mockLogger,
  platformConfig: {
    platform: "test",
    platform_id: "TEST",
    base_url: "https://test.com",
    strategies: [],
    rate_limit: { requests_per_minute: 60, delay_between_requests_ms: 1000 },
  },
  sharedState: new Map(),
});

describe("ParallelExecutor", () => {
  let executor: ParallelExecutor;

  beforeEach(() => {
    executor = new ParallelExecutor(mockLogger);
  });

  describe("executeParallel()", () => {
    it("빈 노드 배열 처리", async () => {
      const result = await executor.executeParallel([]);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.mergedData).toEqual({});
      expect(result.failedNodes).toHaveLength(0);
    });

    it("단일 노드 성공", async () => {
      const strategy = createMockStrategy("test_node", {
        success: true,
        data: { output: "value" },
      });

      const nodes: NodeExecutionInfo[] = [
        {
          nodeId: "node_1",
          strategy,
          context: createMockContext("node_1"),
        },
      ];

      const result = await executor.executeParallel(nodes);

      expect(result.success).toBe(true);
      expect(result.mergedData).toEqual({ output: "value" });
      expect(result.failedNodes).toHaveLength(0);
      expect(strategy.execute).toHaveBeenCalledTimes(1);
    });

    it("다중 노드 병렬 성공", async () => {
      const strategy1 = createMockStrategy("node_a", {
        success: true,
        data: { result_a: 1 },
      });
      const strategy2 = createMockStrategy("node_b", {
        success: true,
        data: { result_b: 2 },
      });
      const strategy3 = createMockStrategy("node_c", {
        success: true,
        data: { result_c: 3 },
      });

      const nodes: NodeExecutionInfo[] = [
        {
          nodeId: "node_a",
          strategy: strategy1,
          context: createMockContext("node_a"),
        },
        {
          nodeId: "node_b",
          strategy: strategy2,
          context: createMockContext("node_b"),
        },
        {
          nodeId: "node_c",
          strategy: strategy3,
          context: createMockContext("node_c"),
        },
      ];

      const result = await executor.executeParallel(nodes);

      expect(result.success).toBe(true);
      expect(result.mergedData).toEqual({
        result_a: 1,
        result_b: 2,
        result_c: 3,
      });
      expect(result.results).toHaveLength(3);
      expect(result.failedNodes).toHaveLength(0);
    });

    it("일부 노드 실패 시 failedNodes 포함", async () => {
      const successStrategy = createMockStrategy("success", {
        success: true,
        data: { ok: true },
      });
      const failStrategy = createMockStrategy("fail", {
        success: false,
        data: {},
        error: { message: "Node failed", code: "TEST_ERROR" },
      });

      const nodes: NodeExecutionInfo[] = [
        {
          nodeId: "success_node",
          strategy: successStrategy,
          context: createMockContext("success_node"),
        },
        {
          nodeId: "fail_node",
          strategy: failStrategy,
          context: createMockContext("fail_node"),
        },
      ];

      const result = await executor.executeParallel(nodes);

      expect(result.success).toBe(false);
      expect(result.failedNodes).toContain("fail_node");
      expect(result.results).toHaveLength(2);
    });

    it("next_nodes 수집", async () => {
      const strategy1 = createMockStrategy("node_a", {
        success: true,
        data: {},
        next_nodes: ["next_1", "next_2"],
      });
      const strategy2 = createMockStrategy("node_b", {
        success: true,
        data: {},
        next_nodes: ["next_2", "next_3"],
      });

      const nodes: NodeExecutionInfo[] = [
        {
          nodeId: "node_a",
          strategy: strategy1,
          context: createMockContext("node_a"),
        },
        {
          nodeId: "node_b",
          strategy: strategy2,
          context: createMockContext("node_b"),
        },
      ];

      const result = await executor.executeParallel(nodes);

      expect(result.success).toBe(true);
      expect(result.nextNodes).toContain("next_1");
      expect(result.nextNodes).toContain("next_2");
      expect(result.nextNodes).toContain("next_3");
      expect(result.nextNodes).toHaveLength(3); // 중복 제거
    });

    it("예외 발생 시 에러 처리", async () => {
      const throwingStrategy: INodeStrategy = {
        type: "throwing",
        execute: jest.fn(async () => {
          throw new Error("Unexpected error");
        }),
        validateConfig: jest.fn(),
      };

      const nodes: NodeExecutionInfo[] = [
        {
          nodeId: "throwing_node",
          strategy: throwingStrategy,
          context: createMockContext("throwing_node"),
        },
      ];

      const result = await executor.executeParallel(nodes);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error?.message).toContain("Unexpected error");
    });
  });

  describe("executePipeline()", () => {
    it("빈 파이프라인 에러", async () => {
      const result = await executor.executePipeline<string, string>(
        [],
        "input",
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EMPTY_PIPELINE");
    });

    it("단일 노드 파이프라인 성공", async () => {
      const strategy = createMockTypedStrategy<string, number>(
        "transform",
        createSuccessResult(42),
      );

      const nodes = [
        {
          nodeId: "transform_node",
          strategy: strategy as ITypedNodeStrategy<unknown, unknown>,
          input: "input" as unknown,
          context: createMockINodeContext("transform_node"),
        },
      ];

      const result = await executor.executePipeline<string, number>(
        nodes,
        "input",
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it("다중 노드 파이프라인 - 데이터 전달", async () => {
      const strategy1 = createMockTypedStrategy<number, number>(
        "add",
        createSuccessResult(10),
      );
      const strategy2 = createMockTypedStrategy<number, number>(
        "multiply",
        createSuccessResult(50),
      );
      const strategy3 = createMockTypedStrategy<number, string>(
        "format",
        createSuccessResult("Result: 50"),
      );

      const nodes = [
        {
          nodeId: "add_node",
          strategy: strategy1 as ITypedNodeStrategy<unknown, unknown>,
          input: 5 as unknown,
          context: createMockINodeContext("add_node"),
        },
        {
          nodeId: "multiply_node",
          strategy: strategy2 as ITypedNodeStrategy<unknown, unknown>,
          input: 10 as unknown,
          context: createMockINodeContext("multiply_node"),
        },
        {
          nodeId: "format_node",
          strategy: strategy3 as ITypedNodeStrategy<unknown, unknown>,
          input: 50 as unknown,
          context: createMockINodeContext("format_node"),
        },
      ];

      const result = await executor.executePipeline<number, string>(nodes, 5);

      expect(result.success).toBe(true);
      expect(result.data).toBe("Result: 50");
    });

    it("중간 노드 실패 시 중단 (stopOnError=true)", async () => {
      const strategy1 = createMockTypedStrategy<number, number>(
        "step1",
        createSuccessResult(10),
      );
      const strategy2 = createMockTypedStrategy<number, number>(
        "step2",
        createErrorResult("Step 2 failed", "STEP2_ERROR"),
      );
      const strategy3 = createMockTypedStrategy<number, number>(
        "step3",
        createSuccessResult(30),
      );

      const nodes = [
        {
          nodeId: "step1_node",
          strategy: strategy1 as ITypedNodeStrategy<unknown, unknown>,
          input: 1 as unknown,
          context: createMockINodeContext("step1_node"),
        },
        {
          nodeId: "step2_node",
          strategy: strategy2 as ITypedNodeStrategy<unknown, unknown>,
          input: 10 as unknown,
          context: createMockINodeContext("step2_node"),
        },
        {
          nodeId: "step3_node",
          strategy: strategy3 as ITypedNodeStrategy<unknown, unknown>,
          input: 20 as unknown,
          context: createMockINodeContext("step3_node"),
        },
      ];

      const result = await executor.executePipeline<number, number>(nodes, 1, {
        stopOnError: true,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Step 2 failed");
      expect(result.error?.details).toEqual({
        failedNode: "step2_node",
        step: 2,
      });
      // step3 should not be called
      expect(strategy3.execute).not.toHaveBeenCalled();
    });

    it("중간 노드 실패 시 계속 (stopOnError=false)", async () => {
      const strategy1 = createMockTypedStrategy<number, number>(
        "step1",
        createSuccessResult(10),
      );
      const strategy2 = createMockTypedStrategy<number, number>(
        "step2",
        createErrorResult("Step 2 failed", "STEP2_ERROR"),
      );
      const strategy3 = createMockTypedStrategy<number, number>(
        "step3",
        createSuccessResult(30),
      );

      const nodes = [
        {
          nodeId: "step1_node",
          strategy: strategy1 as ITypedNodeStrategy<unknown, unknown>,
          input: 1 as unknown,
          context: createMockINodeContext("step1_node"),
        },
        {
          nodeId: "step2_node",
          strategy: strategy2 as ITypedNodeStrategy<unknown, unknown>,
          input: 10 as unknown,
          context: createMockINodeContext("step2_node"),
        },
        {
          nodeId: "step3_node",
          strategy: strategy3 as ITypedNodeStrategy<unknown, unknown>,
          input: 20 as unknown,
          context: createMockINodeContext("step3_node"),
        },
      ];

      const result = await executor.executePipeline<number, number>(nodes, 1, {
        stopOnError: false,
      });

      // Should continue and succeed with last node's output
      expect(result.success).toBe(true);
      expect(result.data).toBe(30);
    });

    it("타임아웃 적용", async () => {
      const slowStrategy = createMockTypedStrategy<number, number>(
        "slow",
        createSuccessResult(100),
        500, // 500ms delay
      );

      const nodes = [
        {
          nodeId: "slow_node",
          strategy: slowStrategy as ITypedNodeStrategy<unknown, unknown>,
          input: 1 as unknown,
          context: createMockINodeContext("slow_node"),
        },
      ];

      const result = await executor.executePipeline<number, number>(
        nodes,
        1,
        { timeoutMs: 100 }, // 100ms timeout
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("timed out");
    });
  });

  describe("executeTypedParallel()", () => {
    it("빈 노드 배열", async () => {
      const result = await executor.executeTypedParallel<string, number>(
        [],
        "input",
      );

      expect(result).toHaveLength(0);
    });

    it("다중 노드 병렬 실행", async () => {
      const strategy1 = createMockTypedStrategy<string, number>(
        "calc1",
        createSuccessResult(10),
      );
      const strategy2 = createMockTypedStrategy<string, number>(
        "calc2",
        createSuccessResult(20),
      );
      const strategy3 = createMockTypedStrategy<string, number>(
        "calc3",
        createSuccessResult(30),
      );

      const nodes = [
        {
          nodeId: "calc1",
          strategy: strategy1,
          context: createMockINodeContext("calc1"),
        },
        {
          nodeId: "calc2",
          strategy: strategy2,
          context: createMockINodeContext("calc2"),
        },
        {
          nodeId: "calc3",
          strategy: strategy3,
          context: createMockINodeContext("calc3"),
        },
      ];

      const result = await executor.executeTypedParallel(nodes, "input");

      expect(result).toHaveLength(3);
      expect(result[0].nodeId).toBe("calc1");
      expect(result[0].result.success).toBe(true);
      expect(result[0].result.data).toBe(10);
    });

    it("예외 발생 시 에러 결과 반환", async () => {
      const throwingStrategy: ITypedNodeStrategy<string, number> = {
        type: "throwing",
        name: "ThrowingNode",
        execute: jest.fn(async () => {
          throw new Error("Execution error");
        }),
      };

      const nodes = [
        {
          nodeId: "throwing_node",
          strategy: throwingStrategy,
          context: createMockINodeContext("throwing_node"),
        },
      ];

      const result = await executor.executeTypedParallel(nodes, "input");

      expect(result).toHaveLength(1);
      expect(result[0].result.success).toBe(false);
      expect(result[0].result.error?.message).toContain("Execution error");
    });
  });

  describe("병렬 실행 성능", () => {
    it("병렬 실행이 순차 실행보다 빠름", async () => {
      const delay = 50; // 50ms per node
      const nodeCount = 5;

      const strategies = Array.from({ length: nodeCount }, (_, i) =>
        createMockStrategy(
          `node_${i}`,
          { success: true, data: { [`result_${i}`]: i } },
          delay,
        ),
      );

      const nodes: NodeExecutionInfo[] = strategies.map((strategy, i) => ({
        nodeId: `node_${i}`,
        strategy,
        context: createMockContext(`node_${i}`),
      }));

      const startTime = Date.now();
      await executor.executeParallel(nodes);
      const parallelTime = Date.now() - startTime;

      // 병렬 실행 시간은 순차 실행 시간(nodeCount * delay)보다 짧아야 함
      const sequentialTimeEstimate = nodeCount * delay;
      expect(parallelTime).toBeLessThan(sequentialTimeEstimate);
    });
  });
});

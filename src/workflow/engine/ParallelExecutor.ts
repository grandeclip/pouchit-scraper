/**
 * ParallelExecutor - DAG 기반 병렬 노드 실행기
 *
 * Phase 4 Step 4.8
 *
 * SOLID 원칙:
 * - SRP: 병렬/파이프라인 노드 실행만 담당
 * - OCP: 새로운 실행 전략 추가 가능
 * - DIP: INodeStrategy, ITypedNodeStrategy 인터페이스에 의존
 *
 * 목적:
 * - 동일 레벨 노드 병렬 실행 (Promise.allSettled)
 * - 타입 안전 파이프라인 실행
 * - 결과 병합 및 에러 집계
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  createErrorResult,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { Logger } from "pino";

/**
 * 병렬 실행 결과
 */
export interface ParallelExecutionResult {
  /** 모든 노드 성공 여부 */
  success: boolean;

  /** 병합된 결과 데이터 */
  mergedData: Record<string, unknown>;

  /** 개별 노드 결과 */
  results: Array<{
    nodeId: string;
    success: boolean;
    data: Record<string, unknown>;
    error?: {
      message: string;
      code?: string;
    };
  }>;

  /** 실패한 노드 ID 목록 */
  failedNodes: string[];

  /** 다음 노드 ID 집합 (병합됨) */
  nextNodes: string[];
}

/**
 * 파이프라인 실행 설정
 */
export interface PipelineConfig {
  /** 에러 발생 시 중단 여부 */
  stopOnError: boolean;

  /** 타임아웃 (ms) */
  timeoutMs?: number;
}

/**
 * 기본 파이프라인 설정
 */
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  stopOnError: true,
  timeoutMs: 60000,
};

/**
 * 노드 실행 정보 (병렬 실행용)
 */
export interface NodeExecutionInfo {
  nodeId: string;
  strategy: INodeStrategy;
  context: NodeContext;
}

/**
 * 타입 안전 노드 실행 정보
 */
export interface TypedNodeExecutionInfo<TInput, TOutput> {
  nodeId: string;
  strategy: ITypedNodeStrategy<TInput, TOutput>;
  input: TInput;
  context: INodeContext;
}

/**
 * ParallelExecutor - 병렬/파이프라인 노드 실행기
 */
export class ParallelExecutor {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 레거시 노드 병렬 실행
   *
   * @param nodes 실행할 노드 정보 배열
   * @returns 병렬 실행 결과
   */
  async executeParallel(
    nodes: NodeExecutionInfo[],
  ): Promise<ParallelExecutionResult> {
    if (nodes.length === 0) {
      return {
        success: true,
        mergedData: {},
        results: [],
        failedNodes: [],
        nextNodes: [],
      };
    }

    // Promise.allSettled로 모든 노드 병렬 실행
    const promises = nodes.map(async (nodeInfo) => {
      try {
        const result = await nodeInfo.strategy.execute(nodeInfo.context);
        return {
          nodeId: nodeInfo.nodeId,
          result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          nodeId: nodeInfo.nodeId,
          result: {
            success: false,
            data: {},
            error: { message, code: "EXECUTION_ERROR" },
          } as NodeResult,
        };
      }
    });

    const settled = await Promise.allSettled(promises);

    // 결과 처리
    const results: ParallelExecutionResult["results"] = [];
    const failedNodes: string[] = [];
    const nextNodesSet = new Set<string>();
    let mergedData: Record<string, unknown> = {};

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        const { nodeId, result } = outcome.value;

        results.push({
          nodeId,
          success: result.success,
          data: result.data,
          error: result.error,
        });

        if (result.success) {
          // 데이터 병합
          mergedData = { ...mergedData, ...result.data };

          // 다음 노드 수집
          if (result.next_nodes) {
            result.next_nodes.forEach((n) => nextNodesSet.add(n));
          }
        } else {
          failedNodes.push(nodeId);
        }
      } else {
        // Promise rejected (예상치 못한 에러)
        const nodeId = "unknown";
        failedNodes.push(nodeId);
        results.push({
          nodeId,
          success: false,
          data: {},
          error: { message: outcome.reason?.message || "Unknown error" },
        });
      }
    }

    const success = failedNodes.length === 0;

    this.logger.info(
      {
        success,
        totalNodes: nodes.length,
        failedCount: failedNodes.length,
        nextNodesCount: nextNodesSet.size,
      },
      "병렬 노드 실행 완료",
    );

    return {
      success,
      mergedData,
      results,
      failedNodes,
      nextNodes: Array.from(nextNodesSet),
    };
  }

  /**
   * 타입 안전 파이프라인 실행
   *
   * 노드를 순차적으로 실행하며 출력을 다음 노드의 입력으로 전달
   *
   * @param nodes 실행할 노드 파이프라인 (순서대로 실행)
   * @param config 파이프라인 설정
   * @returns 최종 결과
   */
  async executePipeline<TInput, TOutput>(
    nodes: Array<TypedNodeExecutionInfo<unknown, unknown>>,
    initialInput: TInput,
    config: Partial<PipelineConfig> = {},
  ): Promise<ITypedNodeResult<TOutput>> {
    const pipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };

    if (nodes.length === 0) {
      return createErrorResult<TOutput>(
        "Pipeline has no nodes",
        "EMPTY_PIPELINE",
      );
    }

    this.logger.info(
      {
        nodeCount: nodes.length,
        nodeIds: nodes.map((n) => n.nodeId),
        stopOnError: pipelineConfig.stopOnError,
      },
      "파이프라인 실행 시작",
    );

    let currentInput: unknown = initialInput;

    for (let i = 0; i < nodes.length; i++) {
      const nodeInfo = nodes[i];

      this.logger.debug(
        { nodeId: nodeInfo.nodeId, step: i + 1, total: nodes.length },
        "파이프라인 노드 실행",
      );

      try {
        // 타임아웃 적용
        const result = await this.executeWithTimeout(
          nodeInfo.strategy.execute(currentInput, nodeInfo.context),
          pipelineConfig.timeoutMs,
          nodeInfo.nodeId,
        );

        if (!result.success) {
          this.logger.warn(
            {
              nodeId: nodeInfo.nodeId,
              error: result.error?.message,
            },
            "파이프라인 노드 실패",
          );

          if (pipelineConfig.stopOnError) {
            return createErrorResult<TOutput>(
              result.error?.message || "Pipeline node failed",
              result.error?.code || "PIPELINE_ERROR",
              { failedNode: nodeInfo.nodeId, step: i + 1 },
            );
          }
        }

        // 다음 노드의 입력으로 전달
        currentInput = result.data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        this.logger.error(
          { nodeId: nodeInfo.nodeId, error: message },
          "파이프라인 노드 예외",
        );

        if (pipelineConfig.stopOnError) {
          return createErrorResult<TOutput>(message, "PIPELINE_EXCEPTION", {
            failedNode: nodeInfo.nodeId,
            step: i + 1,
          });
        }
      }
    }

    this.logger.info({ nodeCount: nodes.length }, "파이프라인 실행 완료");

    return {
      success: true,
      data: currentInput as TOutput,
    };
  }

  /**
   * 타입 안전 노드 병렬 실행
   *
   * @param nodes 병렬 실행할 노드 배열 (모두 같은 입력 사용)
   * @param input 공통 입력 데이터
   * @returns 병렬 실행 결과 배열
   */
  async executeTypedParallel<TInput, TOutput>(
    nodes: Array<{
      nodeId: string;
      strategy: ITypedNodeStrategy<TInput, TOutput>;
      context: INodeContext;
    }>,
    input: TInput,
  ): Promise<Array<{ nodeId: string; result: ITypedNodeResult<TOutput> }>> {
    if (nodes.length === 0) {
      return [];
    }

    const promises = nodes.map(async (nodeInfo) => {
      try {
        const result = await nodeInfo.strategy.execute(input, nodeInfo.context);
        return {
          nodeId: nodeInfo.nodeId,
          result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          nodeId: nodeInfo.nodeId,
          result: createErrorResult<TOutput>(message, "EXECUTION_ERROR"),
        };
      }
    });

    const results = await Promise.all(promises);

    this.logger.info(
      {
        nodeCount: nodes.length,
        successCount: results.filter((r) => r.result.success).length,
      },
      "타입 안전 병렬 노드 실행 완료",
    );

    return results;
  }

  /**
   * 타임아웃 적용 실행
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
    nodeId: string,
  ): Promise<T> {
    if (!timeoutMs) {
      return promise;
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Node ${nodeId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}

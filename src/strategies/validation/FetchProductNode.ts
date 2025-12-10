/**
 * FetchProductNode - Phase 4 Typed Node Strategy
 *
 * SOLID 원칙:
 * - SRP: Supabase에서 검증 대상 상품 조회만 담당
 * - OCP: 설정 기반 확장 가능
 * - DIP: IProductSearchService 인터페이스에 의존
 *
 * 목적:
 * - Supabase에서 검증 대상 상품 조회
 * - 배치 처리 지원
 * - 타입 안전한 입출력
 */

import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  IValidationResult,
  createSuccessResult,
  createErrorResult,
  validationSuccess,
  validationFailure,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import { ProductSearchService } from "@/services/ProductSearchService";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { FetchProductInput, FetchProductOutput } from "./types";
import { WORKFLOW_DEFAULT_CONFIG } from "@/config/constants";

/**
 * FetchProductNode 설정
 */
export interface FetchProductNodeConfig {
  /** 기본 배치 크기 */
  default_batch_size: number;

  /** 기본 조회 제한 */
  default_limit: number;

  /** 최대 조회 제한 */
  max_limit: number;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: FetchProductNodeConfig = {
  default_batch_size: 100,
  default_limit: WORKFLOW_DEFAULT_CONFIG.SUPABASE_SEARCH_LIMIT,
  max_limit: WORKFLOW_DEFAULT_CONFIG.MAX_SEARCH_LIMIT,
};

/**
 * FetchProductNode - Supabase 상품 조회 노드
 */
export class FetchProductNode implements ITypedNodeStrategy<
  FetchProductInput,
  FetchProductOutput
> {
  public readonly type = "fetch_product";
  public readonly name = "FetchProductNode";

  private readonly service: IProductSearchService;
  private readonly nodeConfig: FetchProductNodeConfig;

  constructor(
    service?: IProductSearchService,
    config?: Partial<FetchProductNodeConfig>,
  ) {
    // Dependency Injection
    this.service = service ?? new ProductSearchService();
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 노드 실행
   */
  async execute(
    input: FetchProductInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<FetchProductOutput>> {
    const { logger, platform, config, params } = context;

    // Config 병합 (params > config > input)
    // params: API 호출 시 전달된 파라미터 (limit 등)
    // config: workflow JSON의 노드 설정
    const mergedConfig = { ...config, ...params };
    const mergedInput = this.mergeInputWithConfig(input, mergedConfig);

    logger.info(
      {
        type: this.type,
        platform,
        link_url_pattern: mergedInput.link_url_pattern,
        limit: mergedInput.limit,
        batch_size: mergedInput.batch_size,
      },
      "상품 조회 시작",
    );

    try {
      // 입력 검증
      const validation = this.validate(mergedInput);
      if (!validation.valid) {
        return createErrorResult<FetchProductOutput>(
          validation.errors.map((e) => e.message).join(", "),
          "VALIDATION_ERROR",
          validation.errors,
        );
      }

      // Supabase 검색 실행
      // limit이 undefined면 전체 조회 (자동 pagination)
      const products = await this.service.searchProducts({
        link_url_pattern: mergedInput.link_url_pattern,
        sale_status: mergedInput.sale_status,
        product_id: mergedInput.product_id,
        limit: mergedInput.limit,
        exclude_auto_crawled: mergedInput.exclude_auto_crawled,
      });

      // 배치 정보 계산
      const batchSize =
        mergedInput.batch_size ?? this.nodeConfig.default_batch_size;
      const totalBatches = Math.ceil(products.length / batchSize);

      const output: FetchProductOutput = {
        products,
        count: products.length,
        batch_info: {
          batch_size: batchSize,
          total_batches: totalBatches,
        },
      };

      logger.info(
        {
          type: this.type,
          platform,
          count: products.length,
          batch_size: batchSize,
          total_batches: totalBatches,
        },
        "상품 조회 완료",
      );

      // SharedState에 원본 상품 저장 (CompareNode에서 사용)
      context.sharedState.set("original_products", products);

      // StreamingResultWriter 초기화 (Streaming 방식 JSONL 저장)
      const resultWriter = new StreamingResultWriter({
        outputDir: "./results",
        platform,
        jobId: context.job_id,
        workflowId: context.workflow_id,
        useDateSubdir: true,
      });
      await resultWriter.initialize();
      context.sharedState.set("result_writer", resultWriter);

      logger.debug(
        {
          type: this.type,
          filePath: resultWriter.getFilePath(),
        },
        "StreamingResultWriter 초기화 완료",
      );

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          type: this.type,
          platform,
          error: message,
        },
        "상품 조회 실패",
      );

      return createErrorResult<FetchProductOutput>(
        message,
        "FETCH_PRODUCT_ERROR",
      );
    }
  }

  /**
   * 입력 검증
   */
  validate(input: FetchProductInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    // limit 검증
    if (input.limit !== undefined) {
      if (typeof input.limit !== "number" || input.limit <= 0) {
        errors.push({
          field: "limit",
          message: "limit must be a positive number",
          code: "INVALID_LIMIT",
        });
      } else if (input.limit > this.nodeConfig.max_limit) {
        errors.push({
          field: "limit",
          message: `limit cannot exceed ${this.nodeConfig.max_limit}`,
          code: "LIMIT_EXCEEDED",
        });
      }
    }

    // batch_size 검증
    if (input.batch_size !== undefined) {
      if (typeof input.batch_size !== "number" || input.batch_size <= 0) {
        errors.push({
          field: "batch_size",
          message: "batch_size must be a positive number",
          code: "INVALID_BATCH_SIZE",
        });
      }
    }

    // link_url_pattern 또는 product_id 중 하나는 필수
    if (!input.link_url_pattern && !input.product_id) {
      errors.push({
        field: "link_url_pattern",
        message: "Either link_url_pattern or product_id is required",
        code: "MISSING_FILTER",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * 롤백 (필요 시 구현)
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info({ type: this.type }, "Rollback - no action needed");
    // FetchProductNode는 읽기 전용이므로 롤백 불필요
  }

  /**
   * Input과 Config 병합
   */
  private mergeInputWithConfig(
    input: FetchProductInput,
    config: Record<string, unknown>,
  ): FetchProductInput {
    return {
      link_url_pattern:
        input.link_url_pattern ?? (config.link_url_pattern as string),
      sale_status: input.sale_status ?? (config.sale_status as string),
      product_id: input.product_id ?? (config.product_id as string),
      limit: input.limit ?? (config.limit as number | undefined),
      batch_size: input.batch_size ?? (config.batch_size as number),
      exclude_auto_crawled:
        input.exclude_auto_crawled ??
        (config.exclude_auto_crawled as boolean | undefined),
    };
  }
}

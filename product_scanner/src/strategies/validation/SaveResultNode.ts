/**
 * SaveResultNode - Phase 4 Typed Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 비교 결과 저장만 담당
 * - OCP: 저장 옵션 기반 확장 가능
 * - DIP: ITypedNodeStrategy, StreamingResultWriter 인터페이스에 의존
 *
 * 목적:
 * - CompareProductNode 결과를 JSONL 파일로 저장
 * - 결과 요약 통계 생성
 * - 선택적 Supabase 업데이트 지원
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
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import {
  SaveResultInput,
  SaveResultOutput,
  SingleComparisonResult,
} from "./types";

/**
 * SaveResultNode 설정
 */
export interface SaveResultNodeConfig {
  /** 출력 디렉토리 */
  output_dir: string;

  /** JSONL 저장 기본값 */
  default_save_to_jsonl: boolean;

  /** Supabase 업데이트 기본값 */
  default_save_to_supabase: boolean;

  /** 날짜별 서브디렉토리 사용 */
  use_date_subdir: boolean;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: SaveResultNodeConfig = {
  output_dir: "./output",
  default_save_to_jsonl: true,
  default_save_to_supabase: false,
  use_date_subdir: true,
};

/**
 * SaveResultNode - 결과 저장 노드
 */
export class SaveResultNode
  implements ITypedNodeStrategy<SaveResultInput, SaveResultOutput>
{
  public readonly type = "save_result";
  public readonly name = "SaveResultNode";

  private readonly nodeConfig: SaveResultNodeConfig;

  constructor(config?: Partial<SaveResultNodeConfig>) {
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 노드 실행
   */
  async execute(
    input: SaveResultInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<SaveResultOutput>> {
    const { logger, platform, job_id, workflow_id } = context;

    // 입력 검증
    const validation = this.validate(input);
    if (!validation.valid) {
      return createErrorResult<SaveResultOutput>(
        validation.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        validation.errors,
      );
    }

    // 옵션 해석
    const options = {
      save_to_jsonl:
        input.options?.save_to_jsonl ?? this.nodeConfig.default_save_to_jsonl,
      save_to_supabase:
        input.options?.save_to_supabase ??
        this.nodeConfig.default_save_to_supabase,
      update_product_set: input.options?.update_product_set ?? false,
    };

    logger.info(
      {
        type: this.type,
        platform,
        result_count: input.results.length,
        options,
      },
      "결과 저장 시작",
    );

    try {
      // Summary 계산
      const summary = this.calculateSummary(input.results);

      let jsonlPath: string | undefined;
      let recordCount = 0;

      // JSONL 저장
      if (options.save_to_jsonl) {
        const writeResult = await this.saveToJsonl(
          input.results,
          context,
          summary,
        );
        jsonlPath = writeResult.filePath;
        recordCount = writeResult.recordCount;
      }

      // Supabase 업데이트 (선택적)
      let supabaseUpdated: number | undefined;
      if (options.save_to_supabase) {
        supabaseUpdated = await this.saveToSupabase(input.results, context);
      }

      const output: SaveResultOutput = {
        jsonl_path: jsonlPath,
        record_count: recordCount,
        supabase_updated: supabaseUpdated,
        summary,
      };

      logger.info(
        {
          type: this.type,
          platform,
          jsonl_path: jsonlPath,
          record_count: recordCount,
          supabase_updated: supabaseUpdated,
          summary,
        },
        "결과 저장 완료",
      );

      // sharedState에 저장 결과 기록 (NotifyNode에서 사용)
      context.sharedState.set("save_result", output);

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          type: this.type,
          platform,
          error: message,
        },
        "결과 저장 실패",
      );

      return createErrorResult<SaveResultOutput>(message, "SAVE_RESULT_ERROR");
    }
  }

  /**
   * 입력 검증
   */
  validate(input: SaveResultInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    if (!input.results || !Array.isArray(input.results)) {
      errors.push({
        field: "results",
        message: "results must be an array",
        code: "INVALID_RESULTS",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * 롤백
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info(
      { type: this.type },
      "Rollback - JSONL file may remain",
    );
    // JSONL 파일 삭제는 위험하므로 롤백하지 않음
  }

  /**
   * Summary 계산
   */
  private calculateSummary(
    results: SingleComparisonResult[],
  ): SaveResultOutput["summary"] {
    const summary = {
      total: results.length,
      success: 0,
      failed: 0,
      not_found: 0,
      match: 0,
      mismatch: 0,
    };

    for (const result of results) {
      if (result.status === "success") {
        summary.success++;
        if (result.is_match) {
          summary.match++;
        } else {
          summary.mismatch++;
        }
      } else if (result.status === "failed") {
        summary.failed++;
      } else if (result.status === "not_found") {
        summary.not_found++;
      }
    }

    return summary;
  }

  /**
   * JSONL 파일 저장
   */
  private async saveToJsonl(
    results: SingleComparisonResult[],
    context: INodeContext,
    summary: SaveResultOutput["summary"],
  ): Promise<{ filePath: string; recordCount: number }> {
    const { platform, job_id, workflow_id, logger } = context;

    const writer = new StreamingResultWriter({
      outputDir: this.nodeConfig.output_dir,
      platform,
      jobId: job_id,
      workflowId: workflow_id,
      useDateSubdir: this.nodeConfig.use_date_subdir,
    });

    try {
      await writer.initialize();

      for (const result of results) {
        await writer.append({
          ...result,
          status: result.status,
          match: result.is_match,
        });
      }

      const finalResult = await writer.finalize();

      return {
        filePath: finalResult.filePath,
        recordCount: finalResult.recordCount,
      };
    } catch (error) {
      await writer.cleanup();
      throw error;
    }
  }

  /**
   * Supabase 업데이트 (향후 구현)
   * TODO: ProductSetRepository 연동
   */
  private async saveToSupabase(
    results: SingleComparisonResult[],
    context: INodeContext,
  ): Promise<number> {
    const { logger } = context;

    // 현재는 로그만 남기고 업데이트하지 않음
    // 향후 ProductSetRepository를 통한 업데이트 구현 필요
    logger.info(
      {
        type: this.type,
        count: results.length,
      },
      "Supabase 업데이트 (미구현 - 스킵)",
    );

    // 업데이트할 항목 수 반환 (실제 구현 시 변경 필요)
    return 0;
  }
}

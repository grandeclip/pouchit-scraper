/**
 * Update Product Set Node Strategy
 *
 * JSONL 검증 결과를 읽어 Supabase product_sets 테이블을 업데이트합니다.
 *
 * SOLID 원칙:
 * - SRP: JSONL 파싱 + 업데이트 오케스트레이션만 담당
 * - DIP: IProductUpdateRepository 인터페이스에 의존
 * - OCP: 새로운 플랫폼 추가 시 이 코드는 수정하지 않음
 *
 * Design Pattern:
 * - Strategy Pattern: INodeStrategy 구현
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Dependency Injection: Repository 주입 가능
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import {
  IProductUpdateRepository,
  ProductUpdateData,
} from "@/core/interfaces/IProductUpdateRepository";
import { SupabaseProductUpdateRepository } from "@/repositories/SupabaseProductUpdateRepository";
import { JsonlParser } from "@/utils/JsonlParser";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { logger } from "@/config/logger";
import { createJobLogger, logImportant } from "@/utils/LoggerContext";

/**
 * Update Product Set Node Strategy
 */
export class UpdateProductSetNode implements INodeStrategy {
  public readonly type = "update_product_set";
  private repository: IProductUpdateRepository;

  constructor(repository?: IProductUpdateRepository) {
    // Dependency Injection (DIP 준수)
    this.repository = repository || new SupabaseProductUpdateRepository();
  }

  /**
   * Node 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { job_id, workflow_id, input } = context;
    const jobLogger = createJobLogger(job_id, workflow_id);

    try {
      // 1. JSONL 파일 경로 추출
      const jsonlPath = this.extractJsonlPath(input);
      if (!jsonlPath) {
        return this.createErrorResult(
          "JSONL 파일 경로를 찾을 수 없습니다",
          "MISSING_JSONL_PATH",
        );
      }

      logImportant(jobLogger, `UpdateProductSet 시작: ${jsonlPath}`, {
        jsonlPath,
      });

      // 2. JSONL 파싱 및 업데이트 데이터 추출
      const updates = await JsonlParser.extractUpdatesFromFile(jsonlPath);

      jobLogger.info(
        {
          total_records: updates.length,
          jsonl_path: jsonlPath,
        },
        "JSONL 파싱 완료 - 업데이트 대상 추출",
      );

      if (updates.length === 0) {
        logImportant(jobLogger, "업데이트할 항목 없음 (모든 항목 일치)", {
          jsonl_path: jsonlPath,
        });

        return {
          success: true,
          data: {
            update_product_set: {
              total: 0,
              updated: 0,
              skipped: 0,
              failed: 0,
              jsonl_path: jsonlPath,
              updated_at: getTimestampWithTimezone(),
            },
          },
        };
      }

      // 3. Batch Update 실행
      const result = await this.repository.batchUpdate(updates);

      // 4. 결과 로깅
      logImportant(
        jobLogger,
        `UpdateProductSet 완료: ${result.updated_count}/${updates.length} 성공`,
        {
          total: updates.length,
          updated: result.updated_count,
          skipped: result.skipped_count,
          failed: result.failed_count,
        },
      );

      if (result.errors.length > 0) {
        jobLogger.warn(
          {
            errors: result.errors.slice(0, 10), // 최대 10개만 로깅
            total_errors: result.errors.length,
          },
          "일부 항목 업데이트 실패",
        );
      }

      // 5. 결과 반환
      return {
        success: true,
        data: {
          update_product_set: {
            total: updates.length,
            updated: result.updated_count,
            skipped: result.skipped_count,
            failed: result.failed_count,
            error_count: result.errors.length,
            jsonl_path: jsonlPath,
            updated_at: getTimestampWithTimezone(),
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      jobLogger.error(
        {
          error: errorMessage,
          job_id,
          workflow_id,
        },
        "UpdateProductSet 실행 실패",
      );

      return this.createErrorResult(errorMessage, "EXECUTION_ERROR");
    }
  }

  /**
   * JSONL 파일 경로 추출
   *
   * result_writer node의 출력에서 파일 경로를 추출합니다.
   * 예상 구조:
   * {
   *   result_writer: {
   *     jsonl_path: "/app/results/2025-11-14/job_hwahae_xxx.jsonl"
   *   }
   * }
   */
  private extractJsonlPath(input: Record<string, unknown>): string | null {
    // result_writer 출력 확인 (우선순위 1)
    const resultWriter = input.result_writer as Record<string, unknown>;
    if (resultWriter && typeof resultWriter.jsonl_path === "string") {
      return resultWriter.jsonl_path;
    }

    // hwahae_validation 직접 출력 확인 (우선순위 2)
    const validationResult = input.hwahae_validation as Record<string, unknown>;
    if (validationResult && typeof validationResult.jsonl_path === "string") {
      return validationResult.jsonl_path;
    }

    // oliveyoung_validation, musinsa_validation 등 (우선순위 3)
    for (const key of Object.keys(input)) {
      if (key.endsWith("_validation")) {
        const validationData = input[key] as Record<string, unknown>;
        if (validationData && typeof validationData.jsonl_path === "string") {
          return validationData.jsonl_path;
        }
      }
    }

    logger.error(
      { input },
      "JSONL 파일 경로를 찾을 수 없습니다 - input 구조 확인 필요",
    );

    return null;
  }

  /**
   * 에러 결과 생성
   */
  private createErrorResult(message: string, code: string): NodeResult {
    return {
      success: false,
      data: {},
      error: {
        message,
        code,
      },
    };
  }

  /**
   * Config 검증 (현재는 불필요)
   */
  validateConfig(_config: Record<string, unknown>): void {
    // UpdateProductSetNode는 config를 사용하지 않음
    // JSONL 파일 경로는 이전 node 출력에서 가져옴
  }
}

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
  BatchUpdateResult,
} from "@/core/interfaces/IProductUpdateRepository";
import { IProductHistoryRepository } from "@/core/interfaces/IProductHistoryRepository";
import { SupabaseProductUpdateRepository } from "@/repositories/SupabaseProductUpdateRepository";
import { SupabaseProductHistoryRepository } from "@/repositories/SupabaseProductHistoryRepository";
import { JsonlParser, ProductValidationResult } from "@/utils/JsonlParser";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { logger } from "@/config/logger";
import { createJobLogger, logImportant } from "@/utils/LoggerContext";
import { createClient } from "@supabase/supabase-js";
import { UPDATE_CONFIG } from "@/config/constants";
import type { Logger } from "pino";

/**
 * Update Product Set Node Strategy
 */
export class UpdateProductSetNode implements INodeStrategy {
  public readonly type = "update_product_set";
  private repository: IProductUpdateRepository;
  private historyRepository: IProductHistoryRepository;

  constructor(
    repository?: IProductUpdateRepository,
    historyRepository?: IProductHistoryRepository,
  ) {
    // Dependency Injection (DIP 준수)
    this.repository = repository || new SupabaseProductUpdateRepository();
    this.historyRepository =
      historyRepository || new SupabaseProductHistoryRepository();
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

      // 2. JSONL 파싱 (전체 검증 결과 + 업데이트 데이터 추출)
      const allResults = await JsonlParser.parseValidationResults(jsonlPath);
      const updates = JsonlParser.extractUpdates(allResults);

      jobLogger.info(
        {
          total_records: allResults.length,
          update_targets: updates.length,
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

      // 4. 히스토리 기록 (안전장치: 실패해도 계속 진행)
      const historyResult = await this.recordHistories(
        allResults,
        updates,
        jobLogger,
      );

      // 5. 결과 로깅
      logImportant(
        jobLogger,
        `UpdateProductSet 완료: ${result.updated_count}/${updates.length} 성공`,
        {
          total: updates.length,
          updated: result.updated_count,
          skipped: result.skipped_count,
          failed: result.failed_count,
          history_review: historyResult.review_count,
          history_price: historyResult.price_count,
          history_failed: historyResult.failed_count,
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

      // 6. 업데이트 검증 (샘플링)
      const verificationResult = await this.verifyUpdates(
        updates,
        result,
        jobLogger,
      );

      // 7. 결과 반환
      return {
        success: true,
        data: {
          update_product_set: {
            total: updates.length,
            updated: result.updated_count,
            skipped: result.skipped_count,
            failed: result.failed_count,
            error_count: result.errors.length,
            verification: verificationResult,
            history: {
              review_count: historyResult.review_count,
              price_count: historyResult.price_count,
              failed_count: historyResult.failed_count,
            },
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
   * 히스토리 기록 (안전장치 패턴)
   *
   * 두 테이블에 히스토리 기록:
   * 1. history_product_review: 모든 검증 결과 (항상 INSERT)
   * 2. product_price_histories: 가격 변경 시만 (UPSERT)
   *
   * 안전장치:
   * - 개별 실패해도 계속 진행
   * - 전체 실패해도 메인 프로세스 방해 안 함
   *
   * @param allResults 전체 검증 결과
   * @param updates 업데이트 대상 데이터
   * @param jobLogger Job 로거
   * @returns 히스토리 기록 결과
   */
  private async recordHistories(
    allResults: ProductValidationResult[],
    updates: ProductUpdateData[],
    jobLogger: Logger,
  ): Promise<{
    review_count: number;
    price_count: number;
    failed_count: number;
  }> {
    let reviewCount = 0;
    let priceCount = 0;
    let failedCount = 0;

    try {
      // 업데이트 대상만 히스토리 기록 (match=false인 항목)
      const updatesMap = new Map(updates.map((u) => [u.product_set_id, u]));

      for (const result of allResults) {
        // match=true (변경 없음) 또는 업데이트 실패한 경우 스킵
        if (result.match || !updatesMap.has(result.product_set_id)) {
          continue;
        }

        // fetch 데이터 없으면 스킵 (실패 케이스)
        if (!result.fetch || result.status !== "success") {
          continue;
        }

        // 1. 리뷰 히스토리 기록 (항상)
        const reviewSuccess = await this.historyRepository.recordReviewHistory({
          product_set_id: result.product_set_id,
          link_url: result.url,
          status: this.determineStatus(result),
          comment: this.generateComment(result),
          before_products: result.db,
          after_products: result.fetch,
        });

        if (reviewSuccess) {
          reviewCount++;
        } else {
          failedCount++;
        }

        // 2. 가격 히스토리 기록 (가격 변경 시만)
        const priceChanged =
          result.comparison?.original_price === false ||
          result.comparison?.discounted_price === false;

        if (priceChanged) {
          const originalPrice = result.fetch.original_price || 0;
          const discountedPrice =
            result.fetch.discounted_price || originalPrice;

          const priceSuccess = await this.historyRepository.recordPriceHistory({
            product_set_id: result.product_set_id,
            original_price: originalPrice,
            discount_price: discountedPrice,
          });

          if (priceSuccess) {
            priceCount++;
          } else {
            failedCount++;
          }
        }
      }

      logImportant(
        jobLogger,
        `히스토리 기록 완료: review=${reviewCount}, price=${priceCount}, failed=${failedCount}`,
        {
          review_count: reviewCount,
          price_count: priceCount,
          failed_count: failedCount,
        },
      );

      return {
        review_count: reviewCount,
        price_count: priceCount,
        failed_count: failedCount,
      };
    } catch (error) {
      jobLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          review_count: reviewCount,
          price_count: priceCount,
          failed_count: failedCount,
        },
        "❌ 히스토리 기록 중 예외 발생 (안전장치 작동)",
      );

      // 안전장치: 예외 발생해도 현재까지의 결과 반환
      return {
        review_count: reviewCount,
        price_count: priceCount,
        failed_count: failedCount,
      };
    }
  }

  /**
   * 처리 상태 결정
   *
   * @param result 검증 결과
   * @returns 상태 코드
   */
  private determineStatus(
    result: ProductValidationResult,
  ): "verified" | "only_price" | "all" | "confused" {
    if (result.status !== "success") {
      return "confused";
    }

    const comp = result.comparison;
    if (!comp) {
      return "confused";
    }

    // 가격만 변경
    const priceChanged =
      comp.original_price === false || comp.discounted_price === false;
    const nameChanged = comp.product_name === false;
    const thumbnailChanged = comp.thumbnail === false;

    if (priceChanged && !nameChanged && !thumbnailChanged) {
      return "only_price";
    }

    // 모든 필드 변경
    if (nameChanged || thumbnailChanged || priceChanged) {
      return "all";
    }

    // 변경 없음 (이론상 여기 도달 안 함)
    return "verified";
  }

  /**
   * 변경 사항 코멘트 생성
   *
   * @param result 검증 결과
   * @returns 코멘트 문자열
   */
  private generateComment(result: ProductValidationResult): string {
    const changes: string[] = [];
    const comp = result.comparison;

    if (!comp) {
      return "비교 정보 없음";
    }

    if (comp.product_name === false) {
      changes.push("상품명");
    }
    if (comp.thumbnail === false) {
      changes.push("썸네일");
    }
    if (comp.original_price === false) {
      changes.push("원가");
    }
    if (comp.discounted_price === false) {
      changes.push("할인가");
    }

    if (changes.length === 0) {
      return "변경 없음";
    }

    return `변경: ${changes.join(", ")}`;
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
   * 업데이트 검증 (샘플링)
   *
   * 실제로 Supabase에 업데이트가 반영되었는지 확인합니다.
   * 성능을 위해 샘플링하여 검증합니다 (기본값: 10개).
   *
   * @param updates 업데이트 요청한 데이터
   * @param result 업데이트 결과
   * @param jobLogger Job 로거
   * @returns 검증 결과
   */
  private async verifyUpdates(
    updates: ProductUpdateData[],
    result: BatchUpdateResult,
    jobLogger: Logger,
  ): Promise<{
    verified_count: number;
    verification_passed: boolean;
    sample_size: number;
  }> {
    const SAMPLE_SIZE = Math.min(
      UPDATE_CONFIG.VERIFICATION_SAMPLE_SIZE,
      result.updated_count,
    );

    if (result.updated_count === 0) {
      return {
        verified_count: 0,
        verification_passed: true,
        sample_size: 0,
      };
    }

    try {
      // Supabase 클라이언트 생성
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        jobLogger.warn("Supabase 환경변수 없음 - 검증 스킵");
        return {
          verified_count: 0,
          verification_passed: false,
          sample_size: 0,
        };
      }

      const client = createClient(supabaseUrl, supabaseKey);

      // 성공한 업데이트 ID 목록에서 샘플링
      const sampleIds = result.updated_ids.slice(0, SAMPLE_SIZE);

      // 성공한 ID에 해당하는 업데이트 데이터 추출
      const updatesMap = new Map(updates.map((u) => [u.product_set_id, u]));
      const successfulUpdates = sampleIds
        .map((id) => updatesMap.get(id))
        .filter((u): u is ProductUpdateData => u !== undefined);

      let verifiedCount = 0;

      for (const update of successfulUpdates) {
        const { data, error } = await client
          .from("product_sets")
          .select("*")
          .eq("product_set_id", update.product_set_id)
          .single();

        if (error || !data) {
          jobLogger.warn(
            {
              product_set_id: update.product_set_id,
              error: error?.message,
            },
            "검증 실패: 데이터 조회 불가",
          );
          continue;
        }

        // 업데이트된 필드 확인
        let allFieldsMatch = true;

        if (update.product_name !== undefined) {
          if (data.product_name !== update.product_name) {
            jobLogger.warn(
              {
                product_set_id: update.product_set_id,
                field: "product_name",
                expected: update.product_name,
                actual: data.product_name,
              },
              "검증 실패: 필드 불일치",
            );
            allFieldsMatch = false;
          }
        }

        if (update.thumbnail !== undefined) {
          if (data.thumbnail !== update.thumbnail) {
            jobLogger.warn(
              {
                product_set_id: update.product_set_id,
                field: "thumbnail",
                expected: update.thumbnail,
                actual: data.thumbnail,
              },
              "검증 실패: 필드 불일치",
            );
            allFieldsMatch = false;
          }
        }

        if (update.original_price !== undefined) {
          if (data.original_price !== update.original_price) {
            jobLogger.warn(
              {
                product_set_id: update.product_set_id,
                field: "original_price",
                expected: update.original_price,
                actual: data.original_price,
              },
              "검증 실패: 필드 불일치",
            );
            allFieldsMatch = false;
          }
        }

        if (update.discounted_price !== undefined) {
          if (data.discounted_price !== update.discounted_price) {
            jobLogger.warn(
              {
                product_set_id: update.product_set_id,
                field: "discounted_price",
                expected: update.discounted_price,
                actual: data.discounted_price,
              },
              "검증 실패: 필드 불일치",
            );
            allFieldsMatch = false;
          }
        }

        if (allFieldsMatch) {
          verifiedCount++;
        }
      }

      const verificationPassed = verifiedCount === SAMPLE_SIZE;

      logImportant(
        jobLogger,
        `업데이트 검증 완료 (샘플링): ${verifiedCount}/${SAMPLE_SIZE} 통과`,
        {
          verified_count: verifiedCount,
          sample_size: SAMPLE_SIZE,
          verification_passed: verificationPassed,
        },
      );

      return {
        verified_count: verifiedCount,
        verification_passed: verificationPassed,
        sample_size: SAMPLE_SIZE,
      };
    } catch (error) {
      jobLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "업데이트 검증 중 예외 발생",
      );

      return {
        verified_count: 0,
        verification_passed: false,
        sample_size: SAMPLE_SIZE,
      };
    }
  }

  /**
   * Config 검증 (현재는 불필요)
   */
  validateConfig(_config: Record<string, unknown>): void {
    // UpdateProductSetNode는 config를 사용하지 않음
    // JSONL 파일 경로는 이전 node 출력에서 가져옴
  }
}

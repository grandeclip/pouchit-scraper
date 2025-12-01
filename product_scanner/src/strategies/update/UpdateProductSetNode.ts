/**
 * Phase 4 UpdateProductSetNode - TypedNodeStrategy 패턴
 *
 * JSONL 검증 결과를 읽어 Supabase product_sets 테이블을 업데이트합니다.
 * 플랫폼별 예외 설정(update_exclusions)을 YAML에서 로드하여 적용합니다.
 *
 * SOLID 원칙:
 * - SRP: JSONL 파싱 + Supabase 업데이트 오케스트레이션만 담당
 * - OCP: 플랫폼별 예외 설정은 YAML 수정으로 확장
 * - DIP: IProductUpdateRepository, ConfigLoader 인터페이스에 의존
 *
 * Design Pattern:
 * - Strategy Pattern: ITypedNodeStrategy 구현
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Configuration Pattern: YAML 기반 플랫폼별 설정
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
import {
  IProductUpdateRepository,
  ProductUpdateData,
  BatchUpdateResult,
} from "@/core/interfaces/IProductUpdateRepository";
import { IProductHistoryRepository } from "@/core/interfaces/IProductHistoryRepository";
import { SupabaseProductUpdateRepository } from "@/repositories/SupabaseProductUpdateRepository";
import { SupabaseProductHistoryRepository } from "@/repositories/SupabaseProductHistoryRepository";
import { ConfigLoader } from "@/config/ConfigLoader";
import { JsonlParser, ProductValidationResult } from "@/utils/JsonlParser";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { UPDATE_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";
import { createJobLogger, logImportant } from "@/utils/LoggerContext";
import { createClient } from "@supabase/supabase-js";
import type { Logger } from "pino";
import {
  UpdateProductSetInput,
  UpdateProductSetOutput,
  UpdateExclusionConfig,
  HistoryRecordResult,
  UpdateVerificationResult,
} from "@/strategies/validation/types";

/**
 * UpdateProductSetNode 설정
 */
export interface UpdateProductSetNodeConfig {
  /** 기본 히스토리 기록 여부 */
  default_record_history: boolean;

  /** 기본 검증 수행 여부 */
  default_verify_updates: boolean;

  /** 기본 sale_status 업데이트 여부 */
  default_update_sale_status: boolean;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: UpdateProductSetNodeConfig = {
  default_record_history: true,
  default_verify_updates: true,
  default_update_sale_status: true,
};

/**
 * Phase 4 UpdateProductSetNode - Supabase 업데이트 노드
 */
export class UpdateProductSetNode implements ITypedNodeStrategy<
  UpdateProductSetInput,
  UpdateProductSetOutput
> {
  public readonly type = "update_product_set";
  public readonly name = "UpdateProductSetNode";

  private readonly repository: IProductUpdateRepository;
  private readonly historyRepository: IProductHistoryRepository;
  private readonly configLoader: ConfigLoader;
  private readonly nodeConfig: UpdateProductSetNodeConfig;

  constructor(
    repository?: IProductUpdateRepository,
    historyRepository?: IProductHistoryRepository,
    config?: Partial<UpdateProductSetNodeConfig>,
  ) {
    this.repository = repository ?? new SupabaseProductUpdateRepository();
    this.historyRepository =
      historyRepository ?? new SupabaseProductHistoryRepository();
    this.configLoader = ConfigLoader.getInstance();
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 입력 검증
   */
  validate(input: UpdateProductSetInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    if (!input.jsonl_path || typeof input.jsonl_path !== "string") {
      errors.push({
        field: "jsonl_path",
        message: "JSONL 파일 경로는 필수입니다",
        code: "REQUIRED",
      });
    }

    if (!input.platform || typeof input.platform !== "string") {
      errors.push({
        field: "platform",
        message: "플랫폼은 필수입니다",
        code: "REQUIRED",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * Node 실행
   */
  async execute(
    input: UpdateProductSetInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<UpdateProductSetOutput>> {
    const { job_id, workflow_id, config } = context;
    const jobLogger = createJobLogger(job_id, workflow_id);

    try {
      // jsonl_path는 이전 노드(SaveResultNode)의 출력에서 가져옴
      // accumulatedData가 input으로 전달되므로 타입 캐스팅 필요
      const inputData = input as unknown as Record<string, unknown>;
      const jsonl_path = (input.jsonl_path || inputData.jsonl_path) as string;

      // platform은 context.config 또는 context.platform에서 가져옴
      const platform =
        (config?.platform as string) || context.platform || input.platform;

      // options는 context.config에서 가져옴
      const recordHistory =
        (config?.record_history as boolean) ??
        input.options?.record_history ??
        this.nodeConfig.default_record_history;
      const verifyUpdates =
        (config?.verify_updates as boolean) ??
        input.options?.verify_updates ??
        this.nodeConfig.default_verify_updates;
      const updateSaleStatus =
        (config?.update_sale_status as boolean) ??
        input.options?.update_sale_status ??
        this.nodeConfig.default_update_sale_status;

      logImportant(jobLogger, `UpdateProductSet 시작`, {
        jsonl_path,
        platform,
        record_history: recordHistory,
        verify_updates: verifyUpdates,
        update_sale_status: updateSaleStatus,
      });

      // 1. 플랫폼별 예외 설정 로드
      const exclusions = this.loadUpdateExclusions(platform, jobLogger);

      // 2. JSONL 파싱 (전체 검증 결과 + 업데이트 데이터 추출)
      const allResults = await JsonlParser.parseValidationResults(jsonl_path);
      const rawUpdates = JsonlParser.extractUpdates(allResults);

      jobLogger.debug(
        {
          total_records: allResults.length,
          raw_update_targets: rawUpdates.length,
          platform,
        },
        "JSONL 파싱 완료",
      );

      // 3. 예외 필드 제거 적용 + sale_status 옵션 처리
      const updates = this.applyExclusions(
        rawUpdates,
        exclusions,
        updateSaleStatus,
        jobLogger,
      );

      if (updates.length === 0) {
        logImportant(jobLogger, "업데이트할 항목 없음", { jsonl_path });

        return createSuccessResult<UpdateProductSetOutput>({
          total: 0,
          updated: 0,
          skipped: allResults.length,
          failed: 0,
          error_count: 0,
          jsonl_path,
          updated_at: getTimestampWithTimezone(),
          exclusions_applied: exclusions
            ? {
                platform,
                skip_fields: exclusions.skip_fields,
                reason: exclusions.reason,
              }
            : undefined,
        });
      }

      // 4. Batch Update 실행
      const result = await this.repository.batchUpdate(updates);

      // 5. 히스토리 기록 (옵션)
      let historyResult: HistoryRecordResult | undefined;
      if (recordHistory) {
        historyResult = await this.recordHistories(
          allResults,
          updates,
          jobLogger,
        );
      }

      // 6. 업데이트 검증 (옵션)
      let verificationResult: UpdateVerificationResult | undefined;
      if (verifyUpdates) {
        verificationResult = await this.verifyUpdates(
          updates,
          result,
          jobLogger,
        );
      }

      // 7. 결과 로깅
      logImportant(
        jobLogger,
        `UpdateProductSet 완료: ${result.updated_count}/${updates.length} 성공`,
        {
          total: updates.length,
          updated: result.updated_count,
          skipped: result.skipped_count,
          failed: result.failed_count,
          history: historyResult,
          verification: verificationResult,
        },
      );

      // 8. 결과 반환
      return createSuccessResult<UpdateProductSetOutput>({
        total: updates.length,
        updated: result.updated_count,
        skipped: result.skipped_count,
        failed: result.failed_count,
        error_count: result.errors.length,
        history: historyResult,
        verification: verificationResult,
        jsonl_path,
        updated_at: getTimestampWithTimezone(),
        exclusions_applied: exclusions
          ? {
              platform,
              skip_fields: exclusions.skip_fields,
              reason: exclusions.reason,
            }
          : undefined,
      });
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

      return createErrorResult<UpdateProductSetOutput>(
        errorMessage,
        "EXECUTION_ERROR",
      );
    }
  }

  /**
   * 플랫폼별 업데이트 예외 설정 로드
   */
  private loadUpdateExclusions(
    platform: string,
    jobLogger: Logger,
  ): UpdateExclusionConfig | null {
    try {
      const config = this.configLoader.loadConfig(platform);
      const exclusions = (config as Record<string, unknown>)
        .update_exclusions as UpdateExclusionConfig | undefined;

      if (exclusions?.skip_fields && exclusions.skip_fields.length > 0) {
        jobLogger.debug(
          {
            platform,
            skip_fields: exclusions.skip_fields,
            reason: exclusions.reason,
          },
          "업데이트 예외 설정 로드됨",
        );
        return exclusions;
      }

      return null;
    } catch (error) {
      jobLogger.warn(
        {
          platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "플랫폼 설정 로드 실패 - 예외 없이 진행",
      );
      return null;
    }
  }

  /**
   * 예외 필드 제거 적용 + sale_status 옵션 처리
   *
   * @param updates 원본 업데이트 데이터
   * @param exclusions YAML 기반 예외 설정
   * @param updateSaleStatus sale_status 업데이트 허용 여부
   * @param jobLogger 로거
   */
  private applyExclusions(
    updates: ProductUpdateData[],
    exclusions: UpdateExclusionConfig | null,
    updateSaleStatus: boolean,
    jobLogger: Logger,
  ): ProductUpdateData[] {
    const skipFields = new Set(exclusions?.skip_fields ?? []);
    let skippedFieldCount = 0;
    let saleStatusSkippedCount = 0;

    const filteredUpdates = updates.map((update) => {
      const filtered: ProductUpdateData = {
        product_set_id: update.product_set_id,
        updated_at: update.updated_at,
      };

      // product_name
      if (update.product_name !== undefined) {
        if (skipFields.has("product_name")) {
          skippedFieldCount++;
        } else {
          filtered.product_name = update.product_name;
        }
      }

      // thumbnail
      if (update.thumbnail !== undefined) {
        if (skipFields.has("thumbnail")) {
          skippedFieldCount++;
        } else {
          filtered.thumbnail = update.thumbnail;
        }
      }

      // original_price
      if (update.original_price !== undefined) {
        if (skipFields.has("original_price")) {
          skippedFieldCount++;
        } else {
          filtered.original_price = update.original_price;
        }
      }

      // discounted_price
      if (update.discounted_price !== undefined) {
        if (skipFields.has("discounted_price")) {
          skippedFieldCount++;
        } else {
          filtered.discounted_price = update.discounted_price;
        }
      }

      // sale_status: 옵션 또는 YAML 예외 설정에 따라 처리
      if (update.sale_status !== undefined) {
        if (!updateSaleStatus || skipFields.has("sale_status")) {
          saleStatusSkippedCount++;
        } else {
          filtered.sale_status = update.sale_status;
        }
      }

      return filtered;
    });

    // 업데이트할 필드가 없는 항목 제거
    const nonEmptyUpdates = filteredUpdates.filter((update) => {
      return (
        update.product_name !== undefined ||
        update.thumbnail !== undefined ||
        update.original_price !== undefined ||
        update.discounted_price !== undefined ||
        update.sale_status !== undefined
      );
    });

    jobLogger.debug(
      {
        original_count: updates.length,
        filtered_count: nonEmptyUpdates.length,
        skipped_field_count: skippedFieldCount,
        sale_status_skipped_count: saleStatusSkippedCount,
        skip_fields: exclusions?.skip_fields ?? [],
        update_sale_status: updateSaleStatus,
      },
      "예외 필드 제거 적용 완료",
    );

    return nonEmptyUpdates;
  }

  /**
   * 히스토리 기록
   */
  private async recordHistories(
    allResults: ProductValidationResult[],
    updates: ProductUpdateData[],
    jobLogger: Logger,
  ): Promise<HistoryRecordResult> {
    let reviewCount = 0;
    let priceCount = 0;
    let failedCount = 0;

    try {
      const updatesMap = new Map(updates.map((u) => [u.product_set_id, u]));

      for (const result of allResults) {
        if (result.match || !updatesMap.has(result.product_set_id)) {
          continue;
        }

        if (result.status !== "success") {
          continue;
        }

        // fetch=null이면서 on_sale이 아닌 경우 스킵
        // (on_sale → off_sale 변경인 경우만 히스토리 기록)
        if (!result.fetch && result.db.sale_status !== "on_sale") {
          continue;
        }

        // after_products 결정: fetch가 있으면 fetch, 없으면 off_sale로 변경된 상태
        const afterProducts = result.fetch ?? {
          ...result.db,
          sale_status: "off_sale",
        };

        // 리뷰 히스토리
        const reviewSuccess = await this.historyRepository.recordReviewHistory({
          product_set_id: result.product_set_id,
          link_url: result.url,
          status: this.determineStatus(result),
          comment: this.generateComment(result),
          before_products: result.db,
          after_products: afterProducts,
        });

        if (reviewSuccess) {
          reviewCount++;
        } else {
          failedCount++;
        }

        // 가격 히스토리 (fetch가 있는 경우만)
        const priceChanged =
          result.fetch &&
          (result.comparison?.original_price === false ||
            result.comparison?.discounted_price === false);

        if (priceChanged && result.fetch) {
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
        `히스토리 기록 완료: review=${reviewCount}, price=${priceCount}`,
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
        { error: error instanceof Error ? error.message : String(error) },
        "히스토리 기록 중 예외 발생",
      );
      return {
        review_count: reviewCount,
        price_count: priceCount,
        failed_count: failedCount,
      };
    }
  }

  /**
   * 상태 결정
   *
   * - "only_price": original_price 또는 discounted_price만 변경
   * - "all": 가격 외 다른 항목(product_name, thumbnail, sale_status) 변경
   * - "confused": fetch 실패
   */
  private determineStatus(
    result: ProductValidationResult,
  ): "only_price" | "all" | "confused" {
    // fetch 실패 → confused
    if (!result.fetch) return "confused";

    if (result.status !== "success") return "confused";

    const comp = result.comparison;
    if (!comp) return "confused";

    const priceChanged =
      comp.original_price === false || comp.discounted_price === false;
    const nameChanged = comp.product_name === false;
    const thumbnailChanged = comp.thumbnail === false;
    const saleStatusChanged = comp.sale_status === false;

    // 가격 외 다른 항목 변경 → all
    if (nameChanged || thumbnailChanged || saleStatusChanged) return "all";

    // 가격만 변경 → only_price
    if (priceChanged) return "only_price";

    // 여기까지 오면 변경 없음 (recordHistories에서 이미 필터링됨)
    return "all";
  }

  /**
   * 코멘트 생성 (상세 before/after 포맷)
   *
   * 포맷: "field_name: old_value -> new_value"
   * 구분자: "\n"
   * fetch 실패 시: "fetch 가 실패했습니다\nsale_status: on_sale -> off_sale"
   */
  private generateComment(result: ProductValidationResult): string {
    const changes: string[] = [];

    // fetch가 null인 경우 (fetch 실패)
    if (!result.fetch) {
      changes.push("fetch 가 실패했습니다");
      // on_sale → off_sale 변경인 경우
      if (result.db.sale_status === "on_sale") {
        changes.push("sale_status: on_sale -> off_sale");
      }
      return changes.join("\n");
    }

    const comp = result.comparison;
    if (!comp) return "비교 정보 없음";

    // 각 필드별 before/after 값 출력
    if (comp.product_name === false) {
      changes.push(
        `product_name: ${result.db.product_name ?? "null"} -> ${result.fetch.product_name ?? "null"}`,
      );
    }
    if (comp.thumbnail === false) {
      changes.push(
        `thumbnail: ${result.db.thumbnail ?? "null"} -> ${result.fetch.thumbnail ?? "null"}`,
      );
    }
    if (comp.original_price === false) {
      changes.push(
        `original_price: ${result.db.original_price ?? "null"} -> ${result.fetch.original_price ?? "null"}`,
      );
    }
    if (comp.discounted_price === false) {
      changes.push(
        `discounted_price: ${result.db.discounted_price ?? "null"} -> ${result.fetch.discounted_price ?? "null"}`,
      );
    }
    if (comp.sale_status === false) {
      changes.push(
        `sale_status: ${result.db.sale_status ?? "null"} -> ${result.fetch.sale_status ?? "null"}`,
      );
    }

    return changes.length === 0 ? "변경 없음" : changes.join("\n");
  }

  /**
   * 업데이트 검증 (샘플링)
   */
  private async verifyUpdates(
    updates: ProductUpdateData[],
    result: BatchUpdateResult,
    jobLogger: Logger,
  ): Promise<UpdateVerificationResult> {
    const SAMPLE_SIZE = Math.min(
      UPDATE_CONFIG.VERIFICATION_SAMPLE_SIZE,
      result.updated_count,
    );

    if (result.updated_count === 0) {
      return { verified_count: 0, verification_passed: true, sample_size: 0 };
    }

    try {
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
      const sampleIds = result.updated_ids.slice(0, SAMPLE_SIZE);
      const updatesMap = new Map(updates.map((u) => [u.product_set_id, u]));

      let verifiedCount = 0;

      for (const id of sampleIds) {
        const update = updatesMap.get(id);
        if (!update) continue;

        const { data, error } = await client
          .from("product_sets")
          .select("*")
          .eq("product_set_id", id)
          .single();

        if (error || !data) continue;

        let allMatch = true;

        if (
          update.product_name !== undefined &&
          data.product_name !== update.product_name
        ) {
          allMatch = false;
        }
        if (
          update.thumbnail !== undefined &&
          data.thumbnail !== update.thumbnail
        ) {
          allMatch = false;
        }
        if (
          update.original_price !== undefined &&
          data.original_price !== update.original_price
        ) {
          allMatch = false;
        }
        if (
          update.discounted_price !== undefined &&
          data.discounted_price !== update.discounted_price
        ) {
          allMatch = false;
        }

        if (allMatch) verifiedCount++;
      }

      const passed = verifiedCount === SAMPLE_SIZE;

      logImportant(
        jobLogger,
        `업데이트 검증: ${verifiedCount}/${SAMPLE_SIZE} 통과`,
        { verified_count: verifiedCount, sample_size: SAMPLE_SIZE, passed },
      );

      return {
        verified_count: verifiedCount,
        verification_passed: passed,
        sample_size: SAMPLE_SIZE,
      };
    } catch (error) {
      jobLogger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "업데이트 검증 중 예외",
      );
      return {
        verified_count: 0,
        verification_passed: false,
        sample_size: SAMPLE_SIZE,
      };
    }
  }
}

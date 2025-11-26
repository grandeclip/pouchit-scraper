/**
 * CompareProductNode - Phase 4 Typed Node Strategy
 *
 * SOLID 원칙:
 * - SRP: DB 데이터와 스캔 데이터 비교만 담당
 * - OCP: 설정 기반 비교 규칙 확장 가능
 * - DIP: ITypedNodeStrategy 인터페이스에 의존
 *
 * 목적:
 * - ValidateProductNode 결과와 DB 원본 비교
 * - 필드별 변경 감지
 * - 일치/불일치 통계 집계
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
import { ProductSetSearchResult } from "@/core/domain/ProductSet";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import {
  CompareProductInput,
  CompareProductOutput,
  SingleValidationResult,
  SingleComparisonResult,
} from "./types";

/**
 * CompareProductNode 설정
 */
export interface CompareProductNodeConfig {
  /** 비교할 필드 목록 */
  compare_fields: Array<
    | "product_name"
    | "thumbnail"
    | "original_price"
    | "discounted_price"
    | "sale_status"
  >;

  /** 가격 허용 오차 (%) - 이 범위 내면 일치로 간주 */
  price_tolerance_percent: number;

  /** 유효하지 않은 검증 결과 포함 여부 */
  include_invalid: boolean;

  /** 스캔 실패 결과 포함 여부 */
  include_failed_scans: boolean;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: CompareProductNodeConfig = {
  compare_fields: [
    "product_name",
    "thumbnail",
    "original_price",
    "discounted_price",
    "sale_status",
  ],
  price_tolerance_percent: 0,
  include_invalid: true,
  include_failed_scans: true,
};

/**
 * CompareProductNode - DB vs 스캔 데이터 비교 노드
 */
export class CompareProductNode
  implements ITypedNodeStrategy<CompareProductInput, CompareProductOutput>
{
  public readonly type = "compare_product";
  public readonly name = "CompareProductNode";

  private readonly nodeConfig: CompareProductNodeConfig;

  constructor(config?: Partial<CompareProductNodeConfig>) {
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 노드 실행
   */
  async execute(
    input: CompareProductInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<CompareProductOutput>> {
    const { logger, platform, sharedState } = context;

    // 원본 데이터 가져오기 (input 또는 sharedState)
    let originalProducts = input.original_products;
    if (!originalProducts || originalProducts.length === 0) {
      const fromSharedState = sharedState.get("original_products") as
        | ProductSetSearchResult[]
        | undefined;
      if (fromSharedState) {
        originalProducts = fromSharedState;
      }
    }

    // 입력 검증
    const validation = this.validate({
      ...input,
      original_products: originalProducts,
    });
    if (!validation.valid) {
      return createErrorResult<CompareProductOutput>(
        validation.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        validation.errors,
      );
    }

    logger.info(
      {
        type: this.type,
        platform,
        validation_result_count: input.results.length,
        original_product_count: originalProducts.length,
      },
      "비교 시작",
    );

    try {
      // 원본 데이터 맵 생성 (빠른 조회용)
      const originalMap = this.buildOriginalMap(originalProducts);

      const comparisonResults: SingleComparisonResult[] = [];

      for (const validationResult of input.results) {
        // 필터링 조건 확인
        if (!this.shouldProcess(validationResult)) {
          continue;
        }

        const result = this.compareSingleResult(validationResult, originalMap);
        comparisonResults.push(result);
      }

      // 집계
      const matchCount = comparisonResults.filter(
        (r) => r.status === "success" && r.is_match,
      ).length;
      const mismatchCount = comparisonResults.filter(
        (r) => r.status === "success" && !r.is_match,
      ).length;
      const failureCount = comparisonResults.filter(
        (r) => r.status === "failed" || r.status === "not_found",
      ).length;

      const output: CompareProductOutput = {
        results: comparisonResults,
        match_count: matchCount,
        mismatch_count: mismatchCount,
        failure_count: failureCount,
      };

      logger.info(
        {
          type: this.type,
          platform,
          total: comparisonResults.length,
          match: matchCount,
          mismatch: mismatchCount,
          failure: failureCount,
        },
        "비교 완료",
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
        "비교 실패",
      );

      return createErrorResult<CompareProductOutput>(
        message,
        "COMPARE_PRODUCT_ERROR",
      );
    }
  }

  /**
   * 입력 검증
   */
  validate(input: CompareProductInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    if (!input.results || !Array.isArray(input.results)) {
      errors.push({
        field: "results",
        message: "results must be an array",
        code: "INVALID_RESULTS",
      });
    }

    if (!input.original_products || !Array.isArray(input.original_products)) {
      errors.push({
        field: "original_products",
        message: "original_products must be an array",
        code: "INVALID_ORIGINAL_PRODUCTS",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * 롤백
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info({ type: this.type }, "Rollback - no action needed");
  }

  /**
   * 처리 여부 결정
   */
  private shouldProcess(validationResult: SingleValidationResult): boolean {
    // 검증 실패 결과 필터링
    if (!this.nodeConfig.include_invalid && !validationResult.is_valid) {
      return false;
    }

    // 스캔 실패 결과 필터링
    if (
      !this.nodeConfig.include_failed_scans &&
      !validationResult.scan_result.success
    ) {
      return false;
    }

    return true;
  }

  /**
   * 원본 데이터 맵 생성
   */
  private buildOriginalMap(
    products: ProductSetSearchResult[],
  ): Map<string, ProductSetSearchResult> {
    const map = new Map<string, ProductSetSearchResult>();
    for (const product of products) {
      map.set(product.product_set_id, product);
    }
    return map;
  }

  /**
   * 단일 결과 비교
   */
  private compareSingleResult(
    validationResult: SingleValidationResult,
    originalMap: Map<string, ProductSetSearchResult>,
  ): SingleComparisonResult {
    const { product_set_id, product_id, scan_result } = validationResult;

    // 원본 데이터 찾기
    const original = originalMap.get(product_set_id);

    if (!original) {
      return this.createNotFoundResult(validationResult);
    }

    // 스캔 실패인 경우
    if (!scan_result.success || !scan_result.scanned_data) {
      return this.createFailedResult(
        validationResult,
        original,
        scan_result.error || "No scanned data",
      );
    }

    // 필드별 비교
    const scannedData = scan_result.scanned_data;
    const comparison = {
      product_name: this.compareString(
        original.product_name,
        scannedData.product_name,
      ),
      thumbnail: this.compareString(original.thumbnail, scannedData.thumbnail),
      original_price: this.comparePrice(
        original.original_price,
        scannedData.original_price,
      ),
      discounted_price: this.comparePrice(
        original.discounted_price,
        scannedData.discounted_price,
      ),
      sale_status: this.compareString(
        original.sale_status,
        scannedData.sale_status,
      ),
    };

    // 전체 일치 여부 (설정된 필드만 비교)
    const isMatch = this.nodeConfig.compare_fields.every(
      (field) => comparison[field],
    );

    return {
      product_set_id,
      product_id,
      url: scan_result.url,
      db: {
        product_name: original.product_name ?? null,
        thumbnail: original.thumbnail,
        original_price: original.original_price,
        discounted_price: original.discounted_price,
        sale_status: original.sale_status,
      },
      scanned: scannedData,
      comparison,
      is_match: isMatch,
      status: "success",
      compared_at: getTimestampWithTimezone(),
    };
  }

  /**
   * 문자열 비교
   */
  private compareString(
    dbValue: string | null | undefined,
    scannedValue: string,
  ): boolean {
    if (dbValue === null || dbValue === undefined) {
      return scannedValue === "";
    }
    return dbValue.trim() === scannedValue.trim();
  }

  /**
   * 가격 비교 (허용 오차 적용)
   */
  private comparePrice(
    dbValue: number | null | undefined,
    scannedValue: number,
  ): boolean {
    if (dbValue === null || dbValue === undefined) {
      return scannedValue === 0;
    }

    if (this.nodeConfig.price_tolerance_percent === 0) {
      return dbValue === scannedValue;
    }

    // 허용 오차 계산
    const tolerance = dbValue * (this.nodeConfig.price_tolerance_percent / 100);
    return Math.abs(dbValue - scannedValue) <= tolerance;
  }

  /**
   * Not Found 결과 생성
   */
  private createNotFoundResult(
    validationResult: SingleValidationResult,
  ): SingleComparisonResult {
    const { product_set_id, product_id, scan_result } = validationResult;

    return {
      product_set_id,
      product_id,
      url: scan_result.url,
      db: {
        product_name: null,
      },
      scanned: scan_result.scanned_data || null,
      comparison: {
        product_name: false,
        thumbnail: false,
        original_price: false,
        discounted_price: false,
        sale_status: false,
      },
      is_match: false,
      status: "not_found",
      error: "Original product not found in DB",
      compared_at: getTimestampWithTimezone(),
    };
  }

  /**
   * Failed 결과 생성
   */
  private createFailedResult(
    validationResult: SingleValidationResult,
    original: ProductSetSearchResult,
    error: string,
  ): SingleComparisonResult {
    const { product_set_id, product_id, scan_result } = validationResult;

    return {
      product_set_id,
      product_id,
      url: scan_result.url,
      db: {
        product_name: original.product_name ?? null,
        thumbnail: original.thumbnail,
        original_price: original.original_price,
        discounted_price: original.discounted_price,
        sale_status: original.sale_status,
      },
      scanned: null,
      comparison: {
        product_name: false,
        thumbnail: false,
        original_price: false,
        discounted_price: false,
        sale_status: false,
      },
      is_match: false,
      status: "failed",
      error,
      compared_at: getTimestampWithTimezone(),
    };
  }
}

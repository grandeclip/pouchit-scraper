/**
 * ValidateProductNode - Phase 4 Typed Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 스캔 데이터 유효성 검증만 담당
 * - OCP: 설정 기반 검증 규칙 확장 가능
 * - DIP: ITypedNodeStrategy 인터페이스에 의존
 *
 * 목적:
 * - ScanProductNode 결과 검증
 * - 필수 필드, 가격, 판매상태 검증
 * - 검증 실패 상품 필터링
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
import { getTimestampWithTimezone } from "@/utils/timestamp";
import {
  ValidateProductInput,
  ValidateProductOutput,
  SingleScanResult,
  SingleValidationResult,
  ValidationCheckResult,
} from "./types";

/** 유효한 판매 상태 목록 */
const VALID_SALE_STATUSES = ["on_sale", "sold_out", "off_sale"] as const;

/**
 * ValidateProductNode 설정
 */
export interface ValidateProductNodeConfig {
  /** 필수 필드 목록 */
  required_fields: string[];

  /** 최대 허용 할인율 (경고) */
  max_discount_rate_warning: number;

  /** 엄격 모드 (경고도 실패로 처리) */
  strict_mode: boolean;

  /** 스캔 실패 결과 포함 여부 */
  include_failed_scans: boolean;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: ValidateProductNodeConfig = {
  required_fields: ["product_name", "sale_status"],
  max_discount_rate_warning: 90,
  strict_mode: false,
  include_failed_scans: true,
};

/**
 * ValidateProductNode - 스캔 데이터 검증 노드
 */
export class ValidateProductNode
  implements ITypedNodeStrategy<ValidateProductInput, ValidateProductOutput>
{
  public readonly type = "validate_product";
  public readonly name = "ValidateProductNode";

  private readonly nodeConfig: ValidateProductNodeConfig;

  constructor(config?: Partial<ValidateProductNodeConfig>) {
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 노드 실행
   */
  async execute(
    input: ValidateProductInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<ValidateProductOutput>> {
    const { logger, platform } = context;

    // 입력 검증
    const validation = this.validate(input);
    if (!validation.valid) {
      return createErrorResult<ValidateProductOutput>(
        validation.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        validation.errors,
      );
    }

    logger.info(
      {
        type: this.type,
        platform,
        result_count: input.results.length,
        strict_mode: this.nodeConfig.strict_mode,
      },
      "검증 시작",
    );

    try {
      const validationResults: SingleValidationResult[] = [];

      for (const scanResult of input.results) {
        const result = this.validateSingleResult(scanResult);
        validationResults.push(result);
      }

      // 집계
      const validCount = validationResults.filter((r) => r.is_valid).length;
      const invalidCount = validationResults.filter((r) => !r.is_valid).length;

      const output: ValidateProductOutput = {
        results: validationResults,
        valid_count: validCount,
        invalid_count: invalidCount,
      };

      logger.info(
        {
          type: this.type,
          platform,
          total: validationResults.length,
          valid: validCount,
          invalid: invalidCount,
        },
        "검증 완료",
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
        "검증 실패",
      );

      return createErrorResult<ValidateProductOutput>(
        message,
        "VALIDATE_PRODUCT_ERROR",
      );
    }
  }

  /**
   * 입력 검증
   */
  validate(input: ValidateProductInput): IValidationResult {
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
    context.logger.info({ type: this.type }, "Rollback - no action needed");
  }

  /**
   * 단일 스캔 결과 검증
   */
  private validateSingleResult(
    scanResult: SingleScanResult,
  ): SingleValidationResult {
    const checks: ValidationCheckResult[] = [];

    // 스캔 실패 처리
    if (!scanResult.success || !scanResult.scanned_data) {
      checks.push({
        field: "scan_status",
        valid: false,
        message: scanResult.error || "Scan failed - no data available",
      });

      return {
        product_set_id: scanResult.product_set_id,
        product_id: scanResult.product_id,
        scan_result: scanResult,
        is_valid: false,
        checks,
        validated_at: getTimestampWithTimezone(),
      };
    }

    const data = scanResult.scanned_data;

    // 1. 필수 필드 검증
    this.checkRequiredFields(data, checks);

    // 2. 가격 검증
    this.checkPrices(data, checks);

    // 3. 판매상태 검증
    this.checkSaleStatus(data, checks);

    // 4. 썸네일 검증
    this.checkThumbnail(data, checks);

    // 5. 할인율 검증 (경고)
    this.checkDiscountRate(data, checks);

    // is_valid 결정
    const hasErrors = checks.some((c) => !c.valid);
    const hasWarnings = checks.some(
      (c) => c.valid && c.message?.includes("Warning"),
    );

    // strict_mode: 경고도 실패로 처리
    const isValid = this.nodeConfig.strict_mode
      ? !hasErrors && !hasWarnings
      : !hasErrors;

    return {
      product_set_id: scanResult.product_set_id,
      product_id: scanResult.product_id,
      scan_result: scanResult,
      is_valid: isValid,
      checks,
      validated_at: getTimestampWithTimezone(),
    };
  }

  /**
   * 필수 필드 검증
   */
  private checkRequiredFields(
    data: NonNullable<SingleScanResult["scanned_data"]>,
    checks: ValidationCheckResult[],
  ): void {
    const fieldMap: Record<string, unknown> = {
      product_name: data.product_name,
      sale_status: data.sale_status,
      thumbnail: data.thumbnail,
      original_price: data.original_price,
      discounted_price: data.discounted_price,
    };

    for (const field of this.nodeConfig.required_fields) {
      const value = fieldMap[field];
      const isEmpty =
        value === undefined || value === null || value === "" || value === 0;

      checks.push({
        field,
        valid: !isEmpty,
        message: isEmpty ? `${field} is required` : undefined,
      });
    }
  }

  /**
   * 가격 검증
   */
  private checkPrices(
    data: NonNullable<SingleScanResult["scanned_data"]>,
    checks: ValidationCheckResult[],
  ): void {
    const { original_price, discounted_price } = data;

    // 음수 가격 체크
    if (original_price < 0) {
      checks.push({
        field: "original_price",
        valid: false,
        message: `original_price must be >= 0 (got: ${original_price})`,
      });
    } else {
      checks.push({
        field: "original_price",
        valid: true,
      });
    }

    if (discounted_price < 0) {
      checks.push({
        field: "discounted_price",
        valid: false,
        message: `discounted_price must be >= 0 (got: ${discounted_price})`,
      });
    } else {
      checks.push({
        field: "discounted_price",
        valid: true,
      });
    }

    // 가격 일관성 (정가 >= 판매가)
    if (original_price > 0 && discounted_price > original_price) {
      checks.push({
        field: "price_consistency",
        valid: false,
        message: `discounted_price (${discounted_price}) exceeds original_price (${original_price})`,
      });
    }

    // 0원 경고 (판매중인데 0원)
    if (discounted_price === 0 && data.sale_status === "on_sale") {
      checks.push({
        field: "zero_price",
        valid: true, // 경고이므로 valid
        message: "Warning: Product is on_sale but discounted_price is 0",
      });
    }
  }

  /**
   * 판매상태 검증
   */
  private checkSaleStatus(
    data: NonNullable<SingleScanResult["scanned_data"]>,
    checks: ValidationCheckResult[],
  ): void {
    const { sale_status } = data;
    const isValidStatus = VALID_SALE_STATUSES.includes(
      sale_status as (typeof VALID_SALE_STATUSES)[number],
    );

    checks.push({
      field: "sale_status_valid",
      valid: isValidStatus,
      message: isValidStatus
        ? undefined
        : `Invalid sale_status: ${sale_status}. Expected: ${VALID_SALE_STATUSES.join(", ")}`,
    });
  }

  /**
   * 썸네일 검증
   */
  private checkThumbnail(
    data: NonNullable<SingleScanResult["scanned_data"]>,
    checks: ValidationCheckResult[],
  ): void {
    const { thumbnail } = data;

    if (!thumbnail || thumbnail === "") {
      checks.push({
        field: "thumbnail_format",
        valid: true, // 경고
        message: "Warning: Thumbnail URL is missing",
      });
      return;
    }

    const isValidUrl =
      thumbnail.startsWith("http://") || thumbnail.startsWith("https://");

    if (!isValidUrl) {
      checks.push({
        field: "thumbnail_format",
        valid: true, // 경고
        message: "Warning: Thumbnail URL should start with http:// or https://",
      });
    }
  }

  /**
   * 할인율 검증
   */
  private checkDiscountRate(
    data: NonNullable<SingleScanResult["scanned_data"]>,
    checks: ValidationCheckResult[],
  ): void {
    const { original_price, discounted_price } = data;

    if (original_price <= 0) {
      return; // 정가가 0이면 할인율 계산 불가
    }

    const discountRate = Math.round(
      ((original_price - discounted_price) / original_price) * 100,
    );

    if (discountRate > this.nodeConfig.max_discount_rate_warning) {
      checks.push({
        field: "discount_rate",
        valid: true, // 경고
        message: `Warning: Discount rate (${discountRate}%) exceeds ${this.nodeConfig.max_discount_rate_warning}%`,
      });
    }
  }
}

/**
 * Product Validator Interface
 *
 * 목적: Product 도메인 모델 검증 인터페이스
 *
 * SOLID 원칙:
 * - SRP: 검증 로직만 담당
 * - ISP: 최소 인터페이스
 * - DIP: 상위 모듈은 이 인터페이스에 의존
 */

import type { IProduct, SaleStatus } from "@/core/interfaces/IProduct";

/**
 * 검증 결과
 */
export interface ValidationResult {
  /** 검증 통과 여부 */
  isValid: boolean;
  /** 검증 오류 목록 */
  errors: ValidationError[];
  /** 검증 경고 목록 (통과하지만 주의 필요) */
  warnings: ValidationWarning[];
}

/**
 * 검증 오류
 */
export interface ValidationError {
  /** 오류 필드명 */
  field: string;
  /** 오류 메시지 */
  message: string;
  /** 오류 코드 */
  code: ValidationErrorCode;
  /** 실제 값 */
  actualValue?: unknown;
}

/**
 * 검증 경고
 */
export interface ValidationWarning {
  /** 경고 필드명 */
  field: string;
  /** 경고 메시지 */
  message: string;
  /** 경고 코드 */
  code: ValidationWarningCode;
  /** 실제 값 */
  actualValue?: unknown;
}

/**
 * 검증 오류 코드
 */
export type ValidationErrorCode =
  | "REQUIRED_FIELD_MISSING"
  | "INVALID_PRICE"
  | "INVALID_SALE_STATUS"
  | "INVALID_URL"
  | "PRICE_INCONSISTENCY";

/**
 * 검증 경고 코드
 */
export type ValidationWarningCode =
  | "ZERO_PRICE"
  | "HIGH_DISCOUNT_RATE"
  | "MISSING_THUMBNAIL"
  | "PRICE_EQUALS_ORIGINAL";

/**
 * 검증 옵션
 */
export interface ValidationOptions {
  /** 엄격 모드 (경고도 오류로 처리) */
  strict?: boolean;
  /** 최대 할인율 (경고 기준, 기본 90%) */
  maxDiscountRateWarning?: number;
  /** 필수 필드 목록 (기본: productName, saleStatus) */
  requiredFields?: (keyof IProduct)[];
}

/**
 * Product Validator Interface
 */
export interface IProductValidator<TProduct extends IProduct = IProduct> {
  /**
   * Product 검증
   *
   * @param product 검증할 Product
   * @param options 검증 옵션
   * @returns 검증 결과
   */
  validate(product: TProduct, options?: ValidationOptions): ValidationResult;

  /**
   * Product 배열 검증
   *
   * @param products 검증할 Product 배열
   * @param options 검증 옵션
   * @returns 검증 결과 배열
   */
  validateMany(
    products: TProduct[],
    options?: ValidationOptions,
  ): ValidationResult[];

  /**
   * 유효한 Product만 필터링
   *
   * @param products Product 배열
   * @param options 검증 옵션
   * @returns 유효한 Product만 포함된 배열
   */
  filterValid(products: TProduct[], options?: ValidationOptions): TProduct[];
}

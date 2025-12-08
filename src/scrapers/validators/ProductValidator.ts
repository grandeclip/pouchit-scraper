/**
 * Product Validator 구현체
 *
 * 목적: Product 도메인 모델 공통 검증 로직
 *
 * SOLID 원칙:
 * - SRP: 검증 로직만 담당
 * - OCP: ValidationOptions로 확장 가능
 * - LSP: IProductValidator 구현
 *
 * 검증 항목:
 * 1. 필수 필드 (productName, saleStatus)
 * 2. 가격 검증 (>= 0, 정가 >= 판매가)
 * 3. 판매상태 유효값 (on_sale, sold_out, off_sale)
 * 4. URL 형식 (thumbnail)
 */

import type { IProduct, SaleStatus } from "@/core/interfaces/IProduct";
import type {
  IProductValidator,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationOptions,
  ValidationErrorCode,
  ValidationWarningCode,
} from "./IProductValidator";

/** 유효한 판매 상태 목록 */
const VALID_SALE_STATUSES: SaleStatus[] = ["on_sale", "sold_out", "off_sale"];

/** 기본 검증 옵션 */
const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  strict: false,
  maxDiscountRateWarning: 90,
  requiredFields: ["productName", "saleStatus"],
};

/**
 * 공통 Product 검증기
 */
export class ProductValidator<TProduct extends IProduct = IProduct>
  implements IProductValidator<TProduct>
{
  /**
   * Product 검증
   */
  validate(product: TProduct, options?: ValidationOptions): ValidationResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. 필수 필드 검증
    this.validateRequiredFields(product, opts.requiredFields, errors);

    // 2. 가격 검증
    this.validatePrice(product, errors, warnings);

    // 3. 판매상태 검증
    this.validateSaleStatus(product, errors);

    // 4. URL 형식 검증 (thumbnail)
    this.validateThumbnail(product, warnings);

    // 5. 할인율 경고
    this.checkDiscountRate(product, opts.maxDiscountRateWarning, warnings);

    // strict 모드: 경고도 오류로 처리
    if (opts.strict && warnings.length > 0) {
      warnings.forEach((warning) => {
        errors.push({
          field: warning.field,
          message: warning.message,
          code: "INVALID_PRICE", // 경고를 오류로 변환
          actualValue: warning.actualValue,
        });
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: opts.strict ? [] : warnings,
    };
  }

  /**
   * Product 배열 검증
   */
  validateMany(
    products: TProduct[],
    options?: ValidationOptions,
  ): ValidationResult[] {
    return products.map((product) => this.validate(product, options));
  }

  /**
   * 유효한 Product만 필터링
   */
  filterValid(products: TProduct[], options?: ValidationOptions): TProduct[] {
    return products.filter(
      (product) => this.validate(product, options).isValid,
    );
  }

  /**
   * 필수 필드 검증
   */
  private validateRequiredFields(
    product: TProduct,
    requiredFields: (keyof IProduct)[],
    errors: ValidationError[],
  ): void {
    for (const field of requiredFields) {
      const value = product[field];

      if (value === undefined || value === null || value === "") {
        errors.push({
          field: String(field),
          message: `${String(field)} is required`,
          code: "REQUIRED_FIELD_MISSING",
          actualValue: value,
        });
      }
    }
  }

  /**
   * 가격 검증
   */
  private validatePrice(
    product: TProduct,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const { originalPrice, discountedPrice } = product;

    // 음수 가격 체크
    if (originalPrice < 0) {
      errors.push({
        field: "originalPrice",
        message: "originalPrice must be >= 0",
        code: "INVALID_PRICE",
        actualValue: originalPrice,
      });
    }

    if (discountedPrice < 0) {
      errors.push({
        field: "discountedPrice",
        message: "discountedPrice must be >= 0",
        code: "INVALID_PRICE",
        actualValue: discountedPrice,
      });
    }

    // 정가 < 판매가 체크 (비정상)
    if (originalPrice > 0 && discountedPrice > originalPrice) {
      errors.push({
        field: "discountedPrice",
        message: "discountedPrice cannot exceed originalPrice",
        code: "PRICE_INCONSISTENCY",
        actualValue: { originalPrice, discountedPrice },
      });
    }

    // 0원 가격 경고
    if (discountedPrice === 0 && product.saleStatus === "on_sale") {
      warnings.push({
        field: "discountedPrice",
        message: "Product is on sale but discountedPrice is 0",
        code: "ZERO_PRICE",
        actualValue: discountedPrice,
      });
    }

    // 정가 = 판매가 경고 (할인 없음)
    if (originalPrice > 0 && originalPrice === discountedPrice) {
      warnings.push({
        field: "discountedPrice",
        message: "No discount applied (originalPrice equals discountedPrice)",
        code: "PRICE_EQUALS_ORIGINAL",
        actualValue: { originalPrice, discountedPrice },
      });
    }
  }

  /**
   * 판매상태 검증
   */
  private validateSaleStatus(
    product: TProduct,
    errors: ValidationError[],
  ): void {
    const { saleStatus } = product;

    if (!VALID_SALE_STATUSES.includes(saleStatus)) {
      errors.push({
        field: "saleStatus",
        message: `Invalid saleStatus. Expected one of: ${VALID_SALE_STATUSES.join(", ")}`,
        code: "INVALID_SALE_STATUS",
        actualValue: saleStatus,
      });
    }
  }

  /**
   * 썸네일 URL 검증
   */
  private validateThumbnail(
    product: TProduct,
    warnings: ValidationWarning[],
  ): void {
    const { thumbnail } = product;

    if (!thumbnail || thumbnail === "") {
      warnings.push({
        field: "thumbnail",
        message: "Thumbnail URL is missing",
        code: "MISSING_THUMBNAIL",
        actualValue: thumbnail,
      });
      return;
    }

    // 기본 URL 형식 체크 (http:// 또는 https://)
    if (!thumbnail.startsWith("http://") && !thumbnail.startsWith("https://")) {
      warnings.push({
        field: "thumbnail",
        message: "Thumbnail URL should start with http:// or https://",
        code: "MISSING_THUMBNAIL",
        actualValue: thumbnail,
      });
    }
  }

  /**
   * 할인율 경고 체크
   */
  private checkDiscountRate(
    product: TProduct,
    maxRate: number,
    warnings: ValidationWarning[],
  ): void {
    const discountRate = product.getDiscountRate();

    if (discountRate > maxRate) {
      warnings.push({
        field: "discountRate",
        message: `Discount rate (${discountRate}%) exceeds ${maxRate}%`,
        code: "HIGH_DISCOUNT_RATE",
        actualValue: discountRate,
      });
    }
  }
}

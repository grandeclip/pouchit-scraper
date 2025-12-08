/**
 * 화해 상품 검증기
 * CSV 데이터와 API 응답을 비교하여 차이점 검출
 *
 * SOLID 원칙:
 * - SRP: 필드 검증만 담당
 * - OCP: 새로운 필드 추가 시 확장 가능
 */

import { IValidator } from "@/core/interfaces/IValidator";
import {
  HwahaeConfig,
  ValidationRequest,
  ValidationResult,
  FieldDifference,
} from "@/core/domain/HwahaeConfig";
import { HwahaeProduct } from "@/core/domain/HwahaeProduct";

/**
 * 화해 상품 검증기
 */
export class HwahaeValidator implements IValidator {
  constructor(private readonly config: HwahaeConfig) {}

  /**
   * CSV 데이터와 API 응답 비교
   */
  validate(
    csvData: ValidationRequest,
    apiProduct: HwahaeProduct,
  ): ValidationResult {
    const differences: FieldDifference[] = [];

    // 1. 상품명 검증
    differences.push(
      this.validateProductName(csvData.productName, apiProduct.productName),
    );

    // 2. 썸네일 검증 (URL 정규화)
    differences.push(
      this.validateThumbnail(csvData.thumbnail, apiProduct.thumbnail),
    );

    // 3. 정가 검증
    differences.push(
      this.validateOriginalPrice(
        csvData.originalPrice,
        apiProduct.originalPrice,
      ),
    );

    // 4. 판매가 검증
    differences.push(
      this.validateDiscountedPrice(
        csvData.discountedPrice,
        apiProduct.discountedPrice,
      ),
    );

    // 5. 판매 상태 검증
    differences.push(
      this.validateSaleStatus(csvData.saleStatus, apiProduct.saleStatus),
    );

    // 통계 계산
    const matchedFields = differences.filter((d) => d.matched).length;
    const mismatchedFields = differences.filter((d) => !d.matched).length;

    return {
      success: mismatchedFields === 0,
      goodsId: csvData.goodsId,
      productName: csvData.productName,
      differences,
      summary: {
        totalFields: differences.length,
        matchedFields,
        mismatchedFields,
      },
    };
  }

  /**
   * 상품명 검증
   */
  private validateProductName(
    csvValue: string,
    apiValue: string,
  ): FieldDifference {
    const matched = csvValue === apiValue;
    return {
      field: "productName",
      csvValue,
      apiValue,
      matched,
      message: matched ? undefined : "Product name mismatch",
    };
  }

  /**
   * 썸네일 검증 (URL 정규화)
   */
  private validateThumbnail(
    csvValue: string,
    apiValue: string,
  ): FieldDifference {
    let matched: boolean;

    if (this.config.validation.normalizeUrls) {
      const normalizedCsv = HwahaeProduct.normalizeUrl(csvValue);
      const normalizedApi = HwahaeProduct.normalizeUrl(apiValue);
      matched = normalizedCsv === normalizedApi;
    } else {
      matched = csvValue === apiValue;
    }

    return {
      field: "thumbnail",
      csvValue,
      apiValue,
      matched,
      message: matched ? undefined : "Thumbnail URL mismatch",
    };
  }

  /**
   * 정가 검증
   */
  private validateOriginalPrice(
    csvValue: number,
    apiValue: number,
  ): FieldDifference {
    const matched = csvValue === apiValue;
    return {
      field: "originalPrice",
      csvValue,
      apiValue,
      matched,
      message: matched
        ? undefined
        : `Price difference: ${csvValue} → ${apiValue}`,
    };
  }

  /**
   * 판매가 검증
   */
  private validateDiscountedPrice(
    csvValue: number,
    apiValue: number,
  ): FieldDifference {
    const matched = csvValue === apiValue;
    const difference = Math.abs(csvValue - apiValue);
    const changeRate = apiValue > 0 ? difference / apiValue : 0;

    let message: string | undefined;
    if (!matched) {
      if (changeRate > this.config.validation.priceThreshold) {
        message = `Significant price change: ${csvValue} → ${apiValue} (${(changeRate * 100).toFixed(1)}%)`;
      } else {
        message = `Minor price change: ${csvValue} → ${apiValue}`;
      }
    }

    return {
      field: "discountedPrice",
      csvValue,
      apiValue,
      matched,
      message,
    };
  }

  /**
   * 판매 상태 검증
   */
  private validateSaleStatus(
    csvValue: string,
    apiValue: string,
  ): FieldDifference {
    const matched = csvValue === apiValue;
    return {
      field: "saleStatus",
      csvValue,
      apiValue,
      matched,
      message: matched
        ? undefined
        : `Sale status changed: ${csvValue} → ${apiValue}`,
    };
  }
}

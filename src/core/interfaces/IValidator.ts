/**
 * 검증기 인터페이스
 * Strategy Pattern for validation strategies
 *
 * SOLID 원칙:
 * - SRP: 검증 로직만 담당
 * - OCP: 새로운 검증 규칙 추가 시 확장 가능
 * - ISP: 검증에 필요한 메서드만 정의
 */

import {
  ValidationRequest,
  ValidationResult,
} from "@/core/domain/HwahaeConfig";
import { HwahaeProduct } from "@/core/domain/HwahaeProduct";

/**
 * 검증기 인터페이스
 */
export interface IValidator {
  /**
   * CSV 데이터와 스캔 결과 비교 검증
   * @param csvData CSV 원본 데이터
   * @param scannedProduct 스캔된 상품 정보
   * @returns 검증 결과
   */
  validate(
    csvData: ValidationRequest,
    scannedProduct: HwahaeProduct,
  ): ValidationResult;
}

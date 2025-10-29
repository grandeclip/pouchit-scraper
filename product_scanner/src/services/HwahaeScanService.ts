/**
 * 화해 스캔 서비스
 * Facade Pattern
 *
 * 역할:
 * - Scanner + Validator 조합
 * - 비즈니스 로직 통합
 * - 에러 처리 및 로깅
 *
 * SOLID 원칙:
 * - SRP: 비즈니스 로직 조율만 담당
 * - DIP: 인터페이스에 의존
 * - OCP: 새로운 전략 추가 시 코드 수정 불필요
 */

import { IScanner } from "@/core/interfaces/IScanner";
import { IValidator } from "@/core/interfaces/IValidator";
import {
  ValidationRequest,
  ValidationResult,
} from "@/core/domain/HwahaeConfig";
import { ScannerRegistry } from "./ScannerRegistry";
import { HwahaeValidator } from "@/validators/HwahaeValidator";
import { ConfigLoader } from "@/config/ConfigLoader";

/**
 * 화해 스캔 서비스 (Facade)
 */
export class HwahaeScanService {
  private readonly platform = "hwahae";
  private validator: IValidator;

  constructor() {
    // Validator 초기화
    const config = ConfigLoader.getInstance().loadConfig(this.platform);
    this.validator = new HwahaeValidator(config);
  }

  /**
   * 상품 검증
   * @param goodsId 상품 ID
   * @param csvData CSV 원본 데이터
   * @param strategyId 전략 ID (옵션)
   * @returns 검증 결과
   */
  async validateProduct(
    goodsId: string,
    csvData: ValidationRequest,
    strategyId?: string,
  ): Promise<ValidationResult> {
    console.log(
      `[Service] 상품 검증 시작: goodsId=${goodsId}, strategy=${strategyId || "default"}`,
    );

    try {
      // Scanner 가져오기 (Registry 사용)
      const scanner = this.getScanner(strategyId);

      // 스캔 실행
      const scannedProduct = await scanner.scan(goodsId);

      // 검증 실행
      const result = this.validator.validate(csvData, scannedProduct);

      console.log(
        `[Service] 상품 검증 완료: success=${result.success}, mismatches=${result.summary.mismatchedFields}`,
      );

      return result;
    } catch (error) {
      console.error(`[Service] 상품 검증 실패:`, error);

      // 에러를 ValidationResult 형식으로 반환
      return {
        success: false,
        goodsId: csvData.goodsId,
        productName: csvData.productName,
        differences: [],
        summary: {
          totalFields: 0,
          matchedFields: 0,
          mismatchedFields: 0,
        },
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * 상품 스캔만 실행 (검증 없이)
   * @param goodsId 상품 ID
   * @param strategyId 전략 ID (옵션)
   * @returns 스캔된 상품 정보
   */
  async scanProduct(goodsId: string, strategyId?: string) {
    console.log(
      `[Service] 상품 스캔 시작: goodsId=${goodsId}, strategy=${strategyId || "default"}`,
    );

    const scanner = this.getScanner(strategyId);
    const product = await scanner.scan(goodsId);

    console.log(`[Service] 상품 스캔 완료: ${product.productName}`);

    return product.toPlainObject();
  }

  /**
   * 사용 가능한 전략 목록 조회
   * @returns 전략 ID 목록
   */
  getAvailableStrategies(): string[] {
    const config = ConfigLoader.getInstance().loadConfig(this.platform);
    return config.strategies.map((s) => s.id);
  }

  /**
   * Scanner 가져오기 (Registry 사용)
   */
  private getScanner(strategyId?: string): IScanner {
    return ScannerRegistry.getInstance().getScanner(this.platform, strategyId);
  }

  /**
   * 리소스 정리 (모든 스캐너 종료)
   */
  async cleanup(): Promise<void> {
    console.log(`[Service] 리소스 정리 중...`);
    await ScannerRegistry.getInstance().clearAll();
    console.log(`[Service] 리소스 정리 완료`);
  }
}

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

import type { IScanner } from "@/core/interfaces/IScanner";
import type { IValidator } from "@/core/interfaces/IValidator";
import type {
  ValidationRequest,
  ValidationResult,
  HwahaeConfig,
} from "@/core/domain/HwahaeConfig";
import type { HwahaeProduct } from "@/core/domain/HwahaeProduct";
import { StrategyConfig } from "@/core/domain/StrategyConfig";
import { ScannerRegistry } from "./ScannerRegistry";
import { HwahaeValidator } from "@/validators/HwahaeValidator";
import { ConfigLoader } from "@/config/ConfigLoader";
import { hwahaeProductToDTO, HwahaeProductDTO } from "@/mappers/ProductMapper";
import { logger } from "@/config/logger";

/**
 * 화해 스캔 서비스 (Facade)
 */
export class HwahaeScanService {
  private readonly platform: string;
  private validator: IValidator;

  constructor(platform: string = "hwahae") {
    this.platform = platform;
    // Validator 초기화
    const config = ConfigLoader.getInstance().loadConfig(this.platform);
    this.validator = new HwahaeValidator(config as HwahaeConfig);
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
    logger.debug(
      { goodsId, strategy: strategyId || "default" },
      "[Service] 상품 검증 시작",
    );

    try {
      // Scanner 가져오기 (Registry 사용)
      const scanner = this.getScanner(strategyId);

      // 스캔 실행
      const scannedProduct = await scanner.scan(goodsId);

      // 검증 실행
      const result = this.validator.validate(
        csvData,
        scannedProduct as unknown as HwahaeProduct,
      );

      logger.debug(
        {
          goodsId,
          success: result.success,
          mismatches: result.summary.mismatchedFields,
        },
        "[Service] 상품 검증 완료",
      );

      return result;
    } catch (error) {
      logger.error({ goodsId, error }, "[Service] 상품 검증 실패");

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
   * @returns 스캔된 상품 정보 (DTO)
   */
  async scanProduct(
    goodsId: string,
    strategyId?: string,
  ): Promise<HwahaeProductDTO> {
    logger.debug(
      { goodsId, strategy: strategyId || "default" },
      "[Service] 상품 스캔 시작",
    );

    const scanner = this.getScanner(strategyId);
    const product = await scanner.scan(goodsId);

    logger.debug(
      { goodsId, productName: product.productName },
      "[Service] 상품 스캔 완료",
    );

    // Domain → DTO 변환 (Mapper 사용)
    return hwahaeProductToDTO(product as unknown as HwahaeProduct);
  }

  /**
   * 사용 가능한 전략 목록 조회
   * @returns 전략 ID 목록
   */
  getAvailableStrategies(): string[] {
    const config = ConfigLoader.getInstance().loadConfig(this.platform);
    return config.strategies.map((s: StrategyConfig) => s.id);
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
    logger.info("[Service] 리소스 정리 중...");
    await ScannerRegistry.getInstance().clearAll();
    logger.info("[Service] 리소스 정리 완료");
  }
}

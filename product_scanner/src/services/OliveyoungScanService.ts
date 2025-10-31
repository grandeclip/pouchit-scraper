/**
 * 올리브영 스캔 서비스
 * Facade Pattern
 *
 * 역할:
 * - Scanner 조합
 * - 비즈니스 로직 통합
 * - 에러 처리 및 로깅
 *
 * SOLID 원칙:
 * - SRP: 비즈니스 로직 조율만 담당
 * - DIP: 인터페이스에 의존
 * - OCP: 새로운 전략 추가 시 코드 수정 불필요
 */

import type { IScanner } from "@/core/interfaces/IScanner";
import type { OliveyoungProduct } from "@/core/domain/OliveyoungProduct";
import { ScannerRegistry } from "./ScannerRegistry";
import { ConfigLoader } from "@/config/ConfigLoader";
import {
  oliveyoungProductToDTO,
  OliveyoungProductDTO,
} from "@/mappers/ProductMapper";
import { logger } from "@/config/logger";

/**
 * 올리브영 스캔 서비스 (Facade)
 */
export class OliveyoungScanService {
  private readonly platform: string;

  constructor(platform: string = "oliveyoung") {
    this.platform = platform;
  }

  /**
   * 상품 스캔만 실행
   * @param goodsNo 상품 번호 (A000000231822)
   * @param strategyId 전략 ID (옵션)
   * @returns 스캔된 상품 정보 (DTO)
   */
  async scanProduct(
    goodsNo: string,
    strategyId?: string,
  ): Promise<OliveyoungProductDTO> {
    logger.info(
      { goodsNo, strategy: strategyId || "default" },
      "[Service] 상품 스캔 시작",
    );

    const scanner = this.getScanner(strategyId);
    const product = await scanner.scan(goodsNo);

    logger.info(
      { goodsNo, productName: product.productName },
      "[Service] 상품 스캔 완료",
    );

    // Domain → DTO 변환 (Mapper 사용)
    return oliveyoungProductToDTO(product as unknown as OliveyoungProduct);
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
    logger.info("[Service] 리소스 정리 중...");
    await ScannerRegistry.getInstance().clearAll();
    logger.info("[Service] 리소스 정리 완료");
  }
}

/**
 * ZigZag 스캔 서비스
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

import type { IScanner } from "@/core/interfaces/IScanner.generic";
import type { ZigzagConfig } from "@/core/domain/ZigzagConfig";
import type { ZigzagProduct } from "@/core/domain/ZigzagProduct";
import { ScannerRegistry } from "./ScannerRegistry";
import { ConfigLoader } from "@/config/ConfigLoader";
import { logger } from "@/config/logger";

/**
 * ZigZag DTO (전송용 객체)
 */
export interface ZigzagProductDTO {
  productId: string;
  productName: string;
  brand: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: string;
  isPurchasable: boolean;
  displayStatus: string;
}

/**
 * ZigZag 스캔 서비스 (Facade)
 */
export class ZigzagScanService {
  private readonly platform: string;

  constructor(platform: string = "zigzag") {
    this.platform = platform;
  }

  /**
   * 상품 스캔 실행
   * @param productId 상품 ID
   * @param strategyId 전략 ID (옵션, 기본: GraphQL)
   * @returns 스캔된 상품 정보 (DTO)
   */
  async scanProduct(
    productId: string,
    strategyId?: string,
  ): Promise<ZigzagProductDTO> {
    logger.info(
      { productId, strategy: strategyId || "default" },
      "[ZigzagScanService] 상품 스캔 시작",
    );

    const scanner = this.getScanner(strategyId);
    const scannedProduct = await scanner.scan(productId);

    const dto = this.toDTO(scannedProduct);

    logger.info(
      { productId, saleStatus: dto.saleStatus },
      "[ZigzagScanService] 상품 스캔 완료",
    );

    return dto;
  }

  /**
   * Scanner 가져오기 (Registry 사용)
   */
  private getScanner(strategyId?: string): IScanner<ZigzagProduct> {
    const registry = ScannerRegistry.getInstance();

    // 전략 ID 지정 안된 경우 기본 전략 사용 (YAML에서 priority가 가장 낮은 것)
    const scanner = registry.getScanner(this.platform, strategyId);

    // 타입 캐스팅 (Registry는 IScanner를 반환하지만, ZigZag는 ZigzagProduct를 사용)
    return scanner as unknown as IScanner<ZigzagProduct>;
  }

  /**
   * 도메인 모델 → DTO 변환
   */
  private toDTO(product: ZigzagProduct): ZigzagProductDTO {
    return {
      productId: product.productId,
      productName: product.productName,
      brand: product.brand,
      thumbnail: product.thumbnail,
      originalPrice: product.originalPrice,
      discountedPrice: product.discountedPrice,
      saleStatus: product.saleStatus,
      isPurchasable: product.isPurchasable,
      displayStatus: product.displayStatus,
    };
  }
}

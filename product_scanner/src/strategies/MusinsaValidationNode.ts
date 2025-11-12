/**
 * Musinsa Validation Node Strategy (HTTP API-based)
 *
 * SOLID 원칙:
 * - SRP: 무신사 검증 및 비교만 담당
 * - LSP: BaseValidationNode 대체 가능
 * - DIP: MusinsaHttpScanner에 의존
 * - Strategy Pattern: INodeStrategy 구현
 *
 * 변경 사항:
 * - Playwright → HTTP API 전환 (MusinsaHttpScanner 사용)
 * - BaseValidationNode 상속으로 코드 중복 제거
 */

import {
  BaseValidationNode,
  ProductValidationResult,
  PlatformProductData,
} from "./base/BaseValidationNode";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";
import type { PlatformConfig } from "@/core/domain/PlatformConfig";
import { logger } from "@/config/logger";
import type { Page } from "playwright";
import { MusinsaHttpScanner } from "@/scanners/platforms/musinsa/MusinsaHttpScanner";
import type { StrategyConfig } from "@/core/domain/StrategyConfig";

/**
 * Musinsa Validation Node Strategy (HTTP API-based)
 */
export class MusinsaValidationNode extends BaseValidationNode {
  public readonly type = "musinsa_validation";
  private scanner: MusinsaHttpScanner | null = null;

  /** HTTP API 전략 ID (YAML strategies[].id 참조) */
  private static readonly HTTP_STRATEGY_ID = "api";

  /**
   * 화해와 동일하게 HTTP API 기반이므로 스크린샷 불필요
   */
  protected shouldSaveScreenshot(): boolean {
    return false;
  }

  /**
   * Platform ID 추출
   */
  protected extractPlatform(params: Record<string, unknown>): string {
    return (params.platform as string) || "musinsa";
  }

  /**
   * productNo 추출
   *
   * 지원 패턴:
   * - 정상: https://www.musinsa.com/products/4350236
   * - Query params: https://www.musinsa.com/products/4350236?srsltid=...
   *
   * 추출 전략:
   * 1. URL 경로에서 /products/{productNo} 패턴 추출
   */
  protected extractProductId(linkUrl: string): string | null {
    // musinsa URL인지 확인
    if (!linkUrl.includes("musinsa.com")) {
      return null;
    }

    try {
      // /products/4350236 패턴에서 숫자 추출
      const match = linkUrl.match(/\/products\/(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * HTTP API 기반 단일 상품 검증 (Playwright 대신 MusinsaHttpScanner 사용)
   */
  protected async validateProductWithPage(
    product: ProductSetSearchResult,
    _page: Page,
    platformConfig: PlatformConfig,
  ): Promise<ProductValidationResult> {
    try {
      // link_url에서 productNo 추출
      if (!product.link_url) {
        return this.createFailedValidation(product, "link_url is null");
      }

      const productNo = this.extractProductId(product.link_url);

      if (!productNo) {
        return this.createFailedValidation(
          product,
          "Failed to extract productNo from link_url",
        );
      }

      logger.debug(
        { type: this.type, productSetId: product.product_set_id, productNo },
        "상품 검증 중 (HTTP API)",
      );

      // MusinsaHttpScanner 초기화 (필요 시)
      if (!this.scanner) {
        const strategy = platformConfig.strategies.find(
          (s: StrategyConfig) =>
            s.id === MusinsaValidationNode.HTTP_STRATEGY_ID,
        );
        if (!strategy) {
          throw new Error(
            `HTTP API 전략이 설정되지 않음 (strategy.id="${MusinsaValidationNode.HTTP_STRATEGY_ID}" 필요)`,
          );
        }
        this.scanner = new MusinsaHttpScanner(platformConfig, strategy);
        await this.scanner.initialize();
      }

      // HTTP API로 상품 스캔
      const musinsaProduct = await this.scanner.scan(productNo);

      // 비교 결과 생성
      const platformData: PlatformProductData = {
        productName: musinsaProduct.productName,
        thumbnail: musinsaProduct.thumbnail,
        originalPrice: musinsaProduct.originalPrice,
        discountedPrice: musinsaProduct.discountedPrice,
        saleStatus: musinsaProduct.saleStatus,
      };

      return this.compareProducts(product, platformData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found") || message.includes("삭제된 상품")) {
        return this.createNotFoundValidation(product, "Musinsa");
      }

      return this.createFailedValidation(product, message);
    }
  }
}

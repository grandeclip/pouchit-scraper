/**
 * Musinsa Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 무신사 검증 및 비교만 담당
 * - LSP: BaseValidationNode 대체 가능
 * - Strategy Pattern: INodeStrategy 구현
 *
 * 변경 사항:
 * - BaseValidationNode 상속으로 코드 중복 제거
 * - 플랫폼별 구현만 유지 (extractProductId, validateProductWithPage)
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
import { PlaywrightScriptExecutor } from "@/utils/PlaywrightScriptExecutor";
import {
  MusinsaProduct,
  MusinsaDomSaleStatus,
} from "@/core/domain/MusinsaProduct";

/**
 * Musinsa Validation Node Strategy
 */
export class MusinsaValidationNode extends BaseValidationNode {
  public readonly type = "musinsa_validation";

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
   * Page를 사용한 단일 상품 검증 (플랫폼별 구현)
   */
  protected async validateProductWithPage(
    product: ProductSetSearchResult,
    page: Page,
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
        "상품 검증 중",
      );

      // YAML 기반 스크래핑 실행
      const domData = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        productNo,
        platformConfig,
      );

      // "삭제된 상품" 체크 (not_found 처리)
      if (domData.name === "삭제된 상품" || domData._source === "not_found") {
        return this.createNotFoundValidation(product, "Musinsa");
      }

      // MusinsaProduct 도메인 객체로 변환
      const musinsaProduct = MusinsaProduct.fromDOMData({
        ...domData,
        id: productNo,
        productNo,
        sale_status: domData.sale_status as MusinsaDomSaleStatus,
      });
      const plainObject = musinsaProduct.toPlainObject();

      // 비교 결과 생성
      const platformData: PlatformProductData = {
        productName: plainObject.productName as string,
        thumbnail: plainObject.thumbnail as string,
        originalPrice: plainObject.originalPrice as number,
        discountedPrice: plainObject.discountedPrice as number,
        saleStatus: plainObject.saleStatus as string,
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

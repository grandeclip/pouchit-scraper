/**
 * Kurly Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 컬리 검증 및 비교만 담당
 * - LSP: BaseValidationNode 대체 가능
 * - Strategy Pattern: INodeStrategy 구현
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
import { KurlyProduct, KurlyDomSaleStatus } from "@/core/domain/KurlyProduct";

/**
 * Kurly Validation Node Strategy
 */
export class KurlyValidationNode extends BaseValidationNode {
  public readonly type = "kurly_validation";

  /**
   * Platform ID 추출
   */
  protected extractPlatform(params: Record<string, unknown>): string {
    return (params.platform as string) || "kurly";
  }

  /**
   * productId 추출
   *
   * 지원 패턴:
   * - https://www.kurly.com/goods/1000284986
   * - https://www.kurly.com/goods/1000284986?srsltid=...
   *
   * 추출 전략:
   * 1. URL pathname에서 /goods/ 뒤의 숫자 추출
   */
  protected extractProductId(linkUrl: string): string | null {
    // kurly URL인지 확인
    if (!linkUrl.includes("kurly.com")) {
      return null;
    }

    try {
      const url = new URL(linkUrl);
      const match = url.pathname.match(/\/goods\/(\d+)/);
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
      // link_url에서 productId 추출
      if (!product.link_url) {
        logger.warn(
          { type: this.type, productSetId: product.product_set_id },
          "link_url is null",
        );
        return this.createFailedValidation(product, "link_url is null");
      }

      const productId = this.extractProductId(product.link_url);

      if (!productId) {
        logger.warn(
          {
            type: this.type,
            productSetId: product.product_set_id,
            linkUrl: product.link_url,
          },
          "Failed to extract productId from link_url",
        );
        return this.createFailedValidation(
          product,
          "Failed to extract productId from link_url",
        );
      }

      logger.info(
        {
          type: this.type,
          productSetId: product.product_set_id,
          productId,
          linkUrl: product.link_url,
        },
        "상품 검증 중",
      );

      // YAML 기반 스크래핑 실행
      const domData = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        productId,
        platformConfig,
      );

      logger.info(
        {
          type: this.type,
          productSetId: product.product_set_id,
          productId,
          domData,
        },
        "스크래핑 결과",
      );

      // "상품 정보 없음" 체크 (not_found 처리)
      if (
        domData.name === "상품 정보 없음" ||
        domData.status === "NOT_FOUND" ||
        domData._source === "next_data_missing" ||
        domData._source === "product_missing"
      ) {
        logger.info(
          {
            type: this.type,
            productSetId: product.product_set_id,
            productId,
            reason: `name=${domData.name}, status=${domData.status}, source=${domData._source}`,
          },
          "Not found 처리",
        );
        return this.createNotFoundValidation(product, "Kurly");
      }

      // KurlyProduct 도메인 객체로 변환
      const kurlyProduct = KurlyProduct.fromDOMData({
        productId,
        name: domData.name,
        mainImageUrl: domData.mainImageUrl || "",
        retailPrice: domData.retailPrice || 0,
        discountedPrice: domData.discountedPrice || 0,
        isSoldOut: domData.isSoldOut,
        status: domData.status as KurlyDomSaleStatus,
        _source: domData._source,
        _error: domData._error,
      });
      const plainObject = kurlyProduct.toPlainObject();

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

      if (
        message.includes("not found") ||
        message.includes("상품 정보 없음") ||
        message.includes("NOT_FOUND")
      ) {
        return this.createNotFoundValidation(product, "Kurly");
      }

      return this.createFailedValidation(product, message);
    }
  }
}

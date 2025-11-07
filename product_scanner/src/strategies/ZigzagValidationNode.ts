/**
 * ZigZag Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: ZigZag 검증 및 비교만 담당
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
import type { ZigzagConfig } from "@/core/domain/ZigzagConfig";
import { logger } from "@/config/logger";
import type { Page } from "playwright";
import { NextDataSchemaExtractor } from "@/extractors/NextDataSchemaExtractor";
import { ZigzagProduct } from "@/core/domain/ZigzagProduct";

/**
 * ZigZag Validation Node Strategy
 */
export class ZigzagValidationNode extends BaseValidationNode {
  public readonly type = "zigzag_validation";

  /**
   * Platform ID 추출
   */
  protected extractPlatform(params: Record<string, unknown>): string {
    return (params.platform as string) || "zigzag";
  }

  /**
   * productId 추출
   *
   * 지원 패턴:
   * - 정상: https://zigzag.kr/catalog/products/157001205
   * - Query params: https://zigzag.kr/catalog/products/157001205?...
   *
   * 추출 전략:
   * 1. URL 경로에서 /catalog/products/{productId} 패턴 추출
   */
  protected extractProductId(linkUrl: string): string | null {
    // zigzag URL인지 확인
    if (!linkUrl.includes("zigzag.kr")) {
      return null;
    }

    try {
      // /catalog/products/157001205 패턴에서 숫자 추출
      const match = linkUrl.match(/\/catalog\/products\/(\d+)/);
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
        return this.createFailedValidation(product, "link_url is null");
      }

      const productId = this.extractProductId(product.link_url);

      if (!productId) {
        return this.createFailedValidation(
          product,
          "Failed to extract productId from link_url",
        );
      }

      logger.debug(
        { type: this.type, productSetId: product.product_set_id, productId },
        "상품 검증 중",
      );

      // YAML 설정 로드
      const zigzagConfig = platformConfig as ZigzagConfig;
      const validationConfig = zigzagConfig.validationConfig;

      if (!validationConfig) {
        throw new Error("ZigZag validationConfig not found in YAML");
      }

      // 1. zigzag.kr 홈페이지로 이동 (anti-detection)
      await page.goto(validationConfig.homeUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForTimeout(1000);

      // 2. 상품 페이지로 이동
      const productUrl = validationConfig.productUrlTemplate.replace(
        "${productId}",
        productId,
      );
      await page.goto(productUrl, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // 3. __NEXT_DATA__ 추출
      const extractor = new NextDataSchemaExtractor(
        validationConfig.nextDataConfig,
      );
      const nextData = await extractor.extract(page);

      // "삭제된 상품" 체크 (not_found 처리)
      if (
        nextData.name === "삭제된 상품" ||
        nextData._source === "no_next_data" ||
        nextData._source === "no_product_data"
      ) {
        return this.createNotFoundValidation(product, "ZigZag");
      }

      // ZigzagProduct 도메인 객체로 변환
      const zigzagProduct = ZigzagProduct.fromNextData(nextData);
      const plainObject = zigzagProduct.toPlainObject();

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
      const errorType =
        error instanceof Error ? error.constructor.name : "UnknownError";
      const message = error instanceof Error ? error.message : String(error);

      // Timeout errors
      if (
        errorType === "TimeoutError" ||
        message.includes("timeout") ||
        message.includes("Timeout")
      ) {
        logger.warn(
          {
            type: this.type,
            productSetId: product.product_set_id,
            errorType,
            error: message,
          },
          "검증 타임아웃",
        );
        return this.createFailedValidation(product, `Timeout: ${message}`);
      }

      // Network errors
      if (
        message.includes("net::") ||
        message.includes("ERR_") ||
        errorType === "NetworkError"
      ) {
        logger.warn(
          {
            type: this.type,
            productSetId: product.product_set_id,
            errorType,
            error: message,
          },
          "네트워크 오류",
        );
        return this.createFailedValidation(product, `Network: ${message}`);
      }

      // Not found
      if (message.includes("not found") || message.includes("삭제된 상품")) {
        return this.createNotFoundValidation(product, "ZigZag");
      }

      // Unknown errors
      logger.error(
        {
          type: this.type,
          productSetId: product.product_set_id,
          errorType,
          error: message,
        },
        "검증 실패",
      );
      return this.createFailedValidation(product, `${errorType}: ${message}`);
    }
  }
}

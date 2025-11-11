/**
 * Ably Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 에이블리 검증 및 비교만 담당
 * - LSP: BaseValidationNode 대체 가능
 * - Strategy Pattern: INodeStrategy 구현
 *
 * 특징:
 * - Stealth Plugin 사용 (Cloudflare 우회)
 * - DOM 기반 데이터 추출 (Meta 태그 우선)
 * - 버튼 텍스트로 판매 상태 구분
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
import { AblyProduct } from "@/core/domain/AblyProduct";
import type { SaleStatus } from "@/core/interfaces/IProduct";
import {
  ValidationError,
  ValidationErrorType,
} from "@/core/interfaces/ValidationErrorType";

/**
 * Ably Validation Node Strategy
 */
export class AblyValidationNode extends BaseValidationNode {
  public readonly type = "ably_validation";

  /**
   * Platform ID 추출
   */
  protected extractPlatform(params: Record<string, unknown>): string {
    return (params.platform as string) || "ably";
  }

  /**
   * 상품 ID 추출
   *
   * 지원 패턴:
   * - https://m.a-bly.com/goods/20787714
   * - https://m.a-bly.com/goods/32438971?srsltid=...
   *
   * 추출 전략:
   * 1. URL path에서 goods/{id} 패턴 매칭
   */
  protected extractProductId(linkUrl: string): string | null {
    // a-bly URL인지 확인
    if (!linkUrl.includes("a-bly.com")) {
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
    let productId: string | null = null; // catch 블록 접근용

    try {
      // link_url에서 상품 ID 추출
      if (!product.link_url) {
        return this.createFailedValidation(product, "link_url is null");
      }

      productId = this.extractProductId(product.link_url);

      if (!productId) {
        return this.createFailedValidation(
          product,
          "Failed to extract product ID from link_url",
        );
      }

      logger.debug(
        { type: this.type, productSetId: product.product_set_id, productId },
        "상품 검증 중",
      );

      // YAML 기반 스크래핑 실행
      const domData = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        productId,
        platformConfig,
      );

      // 리다이렉트 감지 (판매중지)
      const currentUrl = page.url();
      if (!currentUrl.includes(`/goods/${productId}`)) {
        return this.createNotFoundValidation(product, "Ably (판매중지)");
      }

      // "not_found" 체크
      if (domData._source === "not_found") {
        return this.createNotFoundValidation(product, "Ably");
      }

      // AblyProduct 도메인 객체로 변환
      const ablyProduct = AblyProduct.fromDOMData({
        ...domData,
        id: productId,
        goodsNo: productId,
        sale_status: domData.sale_status as SaleStatus,
      });
      const plainObject = ablyProduct.toPlainObject();

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
      // ValidationError로 래핑 (타입 세분화 + 로깅)
      return this.handleValidationError(error, product, productId || undefined);
    }
  }

  /**
   * Validation 에러 처리 (타입 세분화 + 구조화 로깅)
   */
  private handleValidationError(
    error: unknown,
    product: ProductSetSearchResult,
    productId?: string,
  ): ProductValidationResult {
    const originalError =
      error instanceof Error ? error : new Error(String(error));
    const message = originalError.message;

    // 에러 타입 추론
    const errorType = ValidationError.inferTypeFromMessage(message);

    // ValidationError 생성 (메타데이터 포함)
    const validationError = new ValidationError(errorType, message, {
      productId,
      platform: "ably",
      retryable: ValidationError.isRetryable(errorType),
      cause: originalError,
    });

    // 구조화 로깅 (에러 타입별 로그 레벨 차별화)
    switch (errorType) {
      case ValidationErrorType.PRODUCT_NOT_FOUND:
        logger.info(validationError.toLogObject(), "Ably 상품 없음 (정상)");
        return this.createNotFoundValidation(product, "Ably");

      case ValidationErrorType.CLOUDFLARE_BLOCKED:
        logger.warn(validationError.toLogObject(), "Cloudflare 차단 감지");
        return this.createFailedValidation(product, `[CLOUDFLARE] ${message}`);

      case ValidationErrorType.NETWORK_ERROR:
        logger.warn(
          validationError.toLogObject(),
          "네트워크 에러 (재시도 권장)",
        );
        return this.createFailedValidation(product, `[NETWORK] ${message}`);

      case ValidationErrorType.EXTRACTION_FAILED:
        logger.error(validationError.toLogObject(), "데이터 추출 실패");
        return this.createFailedValidation(product, `[EXTRACTION] ${message}`);

      case ValidationErrorType.BROWSER_ERROR:
        logger.error(validationError.toLogObject(), "Browser 에러");
        return this.createFailedValidation(product, `[BROWSER] ${message}`);

      case ValidationErrorType.UNKNOWN_ERROR:
      default:
        logger.error(validationError.toLogObject(), "알 수 없는 에러");
        return this.createFailedValidation(product, `[UNKNOWN] ${message}`);
    }
  }
}

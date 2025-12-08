/**
 * Extract By URL Service
 *
 * URL 기반 상품 추출 서비스
 *
 * 동작 흐름:
 * 1. URL 받음
 * 2. PlatformDetector로 플랫폼 감지 + 상품 ID 추출
 * 3. 해당 플랫폼 Scanner로 추출
 * 4. 결과 반환 (db: null, comparison: null)
 *
 * SOLID 원칙:
 * - SRP: URL 기반 추출만 담당
 * - DIP: IExtractService 인터페이스 구현
 */

import type { IExtractService } from "@/services/extract/interfaces/IExtractService";
import type {
  ExtractParams,
  ExtractByUrlParams,
} from "@/services/extract/interfaces/IExtractParams";
import type {
  ExtractResult,
  ExtractedProduct,
  ExtractError,
} from "@/services/extract/interfaces/IExtractResult";
import { ScannerRegistry } from "@/services/ScannerRegistry";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { logger } from "@/config/logger";

/**
 * Extract By URL Service
 */
export class ExtractByUrlService implements IExtractService {
  readonly type = "by-url" as const;

  /**
   * 상품 추출
   * @param params 추출 파라미터
   * @returns 추출 결과
   */
  async extract(params: ExtractParams): Promise<ExtractResult> {
    const startTime = Date.now();

    // 타입 가드: by-url 모드만 처리
    if (params.mode !== "by-url") {
      return this.createErrorResult(startTime, {
        code: "UNKNOWN_ERROR",
        message: `Invalid mode for this service: ${params.mode}`,
      });
    }

    const { url } = params as ExtractByUrlParams;

    logger.info({ url }, "[ExtractByUrlService] 추출 시작");

    try {
      // 1. URL에서 플랫폼 감지
      const detection = PlatformDetector.detect(url);

      if (!detection.platform) {
        logger.warn({ url }, "플랫폼 감지 실패");
        return this.createErrorResult(startTime, {
          code: "PLATFORM_NOT_DETECTED",
          message: `Platform not detected from URL: ${url}`,
          details: { url },
        });
      }

      if (!detection.productId) {
        logger.warn({ url, platform: detection.platform }, "상품 ID 추출 실패");
        return this.createErrorResult(startTime, {
          code: "EXTRACTION_FAILED",
          message: `Failed to extract product ID from URL: ${url}`,
          details: { url, platform: detection.platform },
        });
      }

      logger.info(
        {
          url,
          platform: detection.platform,
          productId: detection.productId,
        },
        "플랫폼 및 상품 ID 감지 완료",
      );

      // 2. Scanner로 추출
      const scanner = ScannerRegistry.getInstance().getScanner(
        detection.platform,
      );
      const scannedProduct = await scanner.scan(detection.productId);

      // 3. 결과 반환
      const extractedProduct = this.mapToExtractedProduct(
        detection.platform,
        detection.productId,
        url,
        scannedProduct,
      );

      const durationMs = Date.now() - startTime;

      logger.info(
        {
          url,
          platform: detection.platform,
          productName: extractedProduct.productName,
          durationMs,
        },
        "[ExtractByUrlService] 추출 완료",
      );

      return {
        success: true,
        product: extractedProduct,
        durationMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error({ url, error: message }, "[ExtractByUrlService] 추출 실패");

      // not found 에러 처리
      if (
        message.includes("not found") ||
        message.includes("404") ||
        message.includes("삭제된 상품")
      ) {
        return this.createErrorResult(startTime, {
          code: "PRODUCT_NOT_FOUND",
          message: `Product not found: ${message}`,
          details: { url },
        });
      }

      return this.createErrorResult(startTime, {
        code: "SCANNER_ERROR",
        message,
        details: { url },
      });
    }
  }

  /**
   * 스캔 결과를 ExtractedProduct로 변환
   */
  private mapToExtractedProduct(
    platform: string,
    productId: string,
    url: string,
    scannedProduct: unknown,
  ): ExtractedProduct {
    const product = scannedProduct as Record<string, unknown>;

    return {
      platform,
      productId,
      url,
      productName: String(product.productName || ""),
      thumbnail: product.thumbnail ? String(product.thumbnail) : null,
      originalPrice: Number(product.originalPrice || 0),
      discountedPrice: Number(product.discountedPrice || 0),
      saleStatus: String(product.saleStatus || "unknown"),
      extractedAt: new Date().toISOString(),
      metadata: this.extractMetadata(product),
    };
  }

  /**
   * 플랫폼별 추가 메타데이터 추출
   */
  private extractMetadata(
    product: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const excludeKeys = [
      "productName",
      "thumbnail",
      "originalPrice",
      "discountedPrice",
      "saleStatus",
    ];

    const metadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(product)) {
      if (!excludeKeys.includes(key) && value !== undefined) {
        metadata[key] = value;
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * 에러 결과 생성 헬퍼
   */
  private createErrorResult(
    startTime: number,
    error: ExtractError,
  ): ExtractResult {
    return {
      success: false,
      product: null,
      durationMs: Date.now() - startTime,
      error,
    };
  }
}

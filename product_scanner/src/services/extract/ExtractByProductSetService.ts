/**
 * Extract By ProductSet Service
 *
 * product_set_id 기반 상품 추출 서비스
 *
 * 동작 흐름:
 * 1. product_set_id 받음
 * 2. Supabase에서 link_url 조회
 * 3. URL에서 플랫폼 감지
 * 4. 해당 플랫폼 Scanner로 추출
 * 5. 결과 반환
 *
 * SOLID 원칙:
 * - SRP: product_set_id 기반 추출만 담당
 * - DIP: IExtractService 인터페이스 구현
 */

import type { IExtractService } from "@/services/extract/interfaces/IExtractService";
import type {
  ExtractParams,
  ExtractByProductSetParams,
} from "@/services/extract/interfaces/IExtractParams";
import type {
  ExtractResult,
  ExtractedProduct,
  ExtractError,
} from "@/services/extract/interfaces/IExtractResult";
import { ProductSearchService } from "@/services/ProductSearchService";
import { ScannerRegistry } from "@/services/ScannerRegistry";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { logger } from "@/config/logger";

/**
 * Extract By ProductSet Service
 */
export class ExtractByProductSetService implements IExtractService {
  readonly type = "by-product-set" as const;

  private readonly productSearchService: ProductSearchService;

  constructor(productSearchService?: ProductSearchService) {
    this.productSearchService =
      productSearchService || new ProductSearchService();
  }

  /**
   * 상품 추출
   * @param params 추출 파라미터
   * @returns 추출 결과
   */
  async extract(params: ExtractParams): Promise<ExtractResult> {
    const startTime = Date.now();

    // 타입 가드: by-product-set 모드만 처리
    if (params.mode !== "by-product-set") {
      return this.createErrorResult(startTime, {
        code: "UNKNOWN_ERROR",
        message: `Invalid mode for this service: ${params.mode}`,
      });
    }

    const { productSetId } = params as ExtractByProductSetParams;

    logger.info({ productSetId }, "[ExtractByProductSetService] 추출 시작");

    try {
      // 1. Supabase에서 상품 조회
      const productSet =
        await this.productSearchService.getProductById(productSetId);

      if (!productSet) {
        logger.warn({ productSetId }, "상품 세트를 찾을 수 없음");
        return this.createErrorResult(startTime, {
          code: "PRODUCT_SET_NOT_FOUND",
          message: `Product set not found: ${productSetId}`,
          details: { productSetId },
        });
      }

      // 2. link_url 확인
      const linkUrl = productSet.link_url;
      if (!linkUrl) {
        logger.warn({ productSetId }, "link_url이 없음");
        return this.createErrorResult(startTime, {
          code: "LINK_URL_MISSING",
          message: `link_url is missing for product set: ${productSetId}`,
          details: { productSetId },
        });
      }

      // 3. URL에서 플랫폼 감지
      const detection = PlatformDetector.detect(linkUrl);

      if (!detection.platform) {
        logger.warn({ linkUrl }, "플랫폼 감지 실패");
        return this.createErrorResult(startTime, {
          code: "PLATFORM_NOT_DETECTED",
          message: `Platform not detected from URL: ${linkUrl}`,
          details: { linkUrl },
        });
      }

      if (!detection.productId) {
        logger.warn({ linkUrl, platform: detection.platform }, "상품 ID 추출 실패");
        return this.createErrorResult(startTime, {
          code: "EXTRACTION_FAILED",
          message: `Failed to extract product ID from URL: ${linkUrl}`,
          details: { linkUrl, platform: detection.platform },
        });
      }

      logger.info(
        {
          productSetId,
          platform: detection.platform,
          productId: detection.productId,
        },
        "플랫폼 및 상품 ID 감지 완료"
      );

      // 4. Scanner로 추출
      const scanner = ScannerRegistry.getInstance().getScanner(
        detection.platform
      );
      const scannedProduct = await scanner.scan(detection.productId);

      // 5. 결과 반환
      const extractedProduct = this.mapToExtractedProduct(
        detection.platform,
        detection.productId,
        linkUrl,
        scannedProduct
      );

      const durationMs = Date.now() - startTime;

      logger.info(
        {
          productSetId,
          platform: detection.platform,
          productName: extractedProduct.productName,
          durationMs,
        },
        "[ExtractByProductSetService] 추출 완료"
      );

      return {
        success: true,
        product: extractedProduct,
        durationMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { productSetId, error: message },
        "[ExtractByProductSetService] 추출 실패"
      );

      // not found 에러 처리
      if (
        message.includes("not found") ||
        message.includes("404") ||
        message.includes("삭제된 상품")
      ) {
        return this.createErrorResult(startTime, {
          code: "PRODUCT_NOT_FOUND",
          message: `Product not found: ${message}`,
          details: { productSetId },
        });
      }

      return this.createErrorResult(startTime, {
        code: "SCANNER_ERROR",
        message,
        details: { productSetId },
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
    scannedProduct: unknown
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
    product: Record<string, unknown>
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
  private createErrorResult(startTime: number, error: ExtractError): ExtractResult {
    return {
      success: false,
      product: null,
      durationMs: Date.now() - startTime,
      error,
    };
  }
}


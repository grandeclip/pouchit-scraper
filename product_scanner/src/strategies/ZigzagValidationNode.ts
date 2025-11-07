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
import { ZigzagScanService } from "@/services/ZigzagScanService";

/**
 * ZigZag Validation Node Strategy
 */
export class ZigzagValidationNode extends BaseValidationNode {
  public readonly type = "zigzag_validation";
  private service: ZigzagScanService;

  constructor(service: ZigzagScanService = new ZigzagScanService()) {
    super();
    // Dependency Injection (DIP 준수)
    this.service = service;
  }

  /**
   * 지그재그는 API 기반 검증이므로 스크린샷 불필요
   */
  protected shouldSaveScreenshot(): boolean {
    return false;
  }

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
   * 단일 상품 검증 (플랫폼별 구현)
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

      logger.info(
        {
          product_set_id: product.product_set_id,
          product_id: productId,
          url: product.link_url,
        },
        `[${this.type}] 상품 검증`,
      );

      // ZigZag GraphQL API로 상품 조회
      const zigzagProductDTO = await this.service.scanProduct(productId);

      // 비교 결과 생성
      const platformData: PlatformProductData = {
        productName: zigzagProductDTO.productName,
        thumbnail: zigzagProductDTO.thumbnail,
        originalPrice: zigzagProductDTO.originalPrice,
        discountedPrice: zigzagProductDTO.discountedPrice,
        saleStatus: zigzagProductDTO.saleStatus,
      };

      return this.compareProducts(product, platformData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        return this.createNotFoundValidation(product, "ZigZag");
      }

      return this.createFailedValidation(product, message);
    }
  }
}

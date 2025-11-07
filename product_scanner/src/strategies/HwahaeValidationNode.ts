/**
 * Hwahae Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 화해 검증 및 비교만 담당
 * - DIP: HwahaeScanService에 의존
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
import { HwahaeScanService } from "@/services/HwahaeScanService";

/**
 * Hwahae Validation Node Strategy
 */
export class HwahaeValidationNode extends BaseValidationNode {
  public readonly type = "hwahae_validation";
  private service: HwahaeScanService;

  constructor(service: HwahaeScanService = new HwahaeScanService()) {
    super();
    // Dependency Injection (DIP 준수)
    this.service = service;
  }

  /**
   * 화해는 API 기반 검증이므로 스크린샷 불필요
   */
  protected shouldSaveScreenshot(): boolean {
    return false;
  }

  /**
   * Platform ID 추출
   */
  protected extractPlatform(params: Record<string, unknown>): string {
    return (params.platform as string) || "hwahae";
  }

  /**
   * goodsId 추출
   *
   * 지원 패턴:
   * - 정상: https://www.hwahae.co.kr/goods/21320
   * - products: https://www.hwahae.co.kr/products/2038055
   * - Query params: https://www.hwahae.co.kr/goods/66061?srsltid=...
   * - 상품명 포함: https://www.hwahae.co.kr/products/상품명/2099549?srsltid=...
   * - 상품명+params: https://www.hwahae.co.kr/goods/상품명/70815?goods_tab=...
   *
   * 추출 전략:
   * 1. Query parameter 제거 (? 이후)
   * 2. /goods/ 또는 /products/ 이후 경로에서 마지막 연속된 숫자 추출
   */
  protected extractProductId(linkUrl: string): string | null {
    // hwahae URL인지 확인
    if (!linkUrl.includes("hwahae.co.kr")) {
      return null;
    }

    // 1. Query parameter 제거
    const urlWithoutQuery = linkUrl.split("?")[0];

    // 2. /goods/ 또는 /products/ 이후 경로 추출
    const pathMatch = urlWithoutQuery.match(
      /\/(?:goods|products)\/(.+?)(?:\/)?$/,
    );
    if (!pathMatch) {
      return null;
    }

    const pathSegment = pathMatch[1];

    // 3. 경로에서 모든 숫자 추출하여 마지막 것 사용
    // - /goods/21320 → ["21320"] → 21320
    // - /products/2038055 → ["2038055"] → 2038055
    // - /products/상품명/2099549 → ["2099549"] → 2099549
    // - /goods/상품명/70815 → ["70815"] → 70815
    const allNumbers = pathSegment.match(/\d+/g);
    return allNumbers ? allNumbers[allNumbers.length - 1] : null;
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
      // link_url에서 goodsId 추출
      if (!product.link_url) {
        return this.createFailedValidation(product, "link_url is null");
      }

      const goodsId = this.extractProductId(product.link_url);

      if (!goodsId) {
        return this.createFailedValidation(
          product,
          "Failed to extract goodsId from link_url",
        );
      }

      logger.info(
        {
          product_set_id: product.product_set_id,
          goods_id: goodsId,
          url: product.link_url,
        },
        `[${this.type}] 상품 검증`,
      );

      // 화해 API로 상품 조회
      const hwahaeProduct = await this.service.scanProduct(goodsId);

      // 비교 결과 생성
      const platformData: PlatformProductData = {
        productName: hwahaeProduct.productName,
        thumbnail: hwahaeProduct.thumbnail,
        originalPrice: hwahaeProduct.originalPrice,
        discountedPrice: hwahaeProduct.discountedPrice,
        saleStatus: hwahaeProduct.saleStatus,
      };

      return this.compareProducts(product, platformData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        return this.createNotFoundValidation(product, "Hwahae");
      }

      return this.createFailedValidation(product, message);
    }
  }
}

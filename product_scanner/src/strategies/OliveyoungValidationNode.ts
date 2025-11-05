/**
 * Oliveyoung Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 올리브영 검증 및 비교만 담당
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
  OliveyoungProduct,
  OliveyoungDomSaleStatus,
} from "@/core/domain/OliveyoungProduct";

/**
 * Oliveyoung Validation Node Strategy
 */
export class OliveyoungValidationNode extends BaseValidationNode {
  public readonly type = "oliveyoung_validation";

  /**
   * Platform ID 추출
   */
  protected extractPlatform(params: Record<string, unknown>): string {
    return (params.platform as string) || "oliveyoung";
  }

  /**
   * goodsNo 추출
   *
   * 지원 패턴:
   * - 정상: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822
   * - Query params: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822&srsltid=...
   *
   * 추출 전략:
   * 1. URL에서 goodsNo query parameter 추출
   */
  protected extractProductId(linkUrl: string): string | null {
    // oliveyoung URL인지 확인
    if (!linkUrl.includes("oliveyoung.co.kr")) {
      return null;
    }

    try {
      const url = new URL(linkUrl);
      return url.searchParams.get("goodsNo");
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
      // link_url에서 goodsNo 추출
      if (!product.link_url) {
        return this.createFailedValidation(product, "link_url is null");
      }

      const goodsNo = this.extractProductId(product.link_url);

      if (!goodsNo) {
        return this.createFailedValidation(
          product,
          "Failed to extract goodsNo from link_url",
        );
      }

      logger.debug(
        { type: this.type, productSetId: product.product_set_id, goodsNo },
        "상품 검증 중",
      );

      // YAML 기반 스크래핑 실행
      const domData = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        goodsNo,
        platformConfig,
      );

      // "삭제된 상품" 체크 (not_found 처리)
      if (domData.name === "삭제된 상품" || domData._source === "not_found") {
        return this.createNotFoundValidation(product, "Oliveyoung");
      }

      // OliveyoungProduct 도메인 객체로 변환
      const oliveyoungProduct = OliveyoungProduct.fromDOMData({
        ...domData,
        id: goodsNo,
        goodsNo,
        sale_status: domData.sale_status as OliveyoungDomSaleStatus,
      });
      const plainObject = oliveyoungProduct.toPlainObject();

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
        return this.createNotFoundValidation(product, "Oliveyoung");
      }

      return this.createFailedValidation(product, message);
    }
  }
}

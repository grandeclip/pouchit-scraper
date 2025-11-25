/**
 * Oliveyoung Product Mapper
 *
 * 목적: ProductData → OliveyoungProduct 변환
 *
 * SOLID 원칙:
 * - SRP: 올리브영 상품 매핑만 담당
 * - LSP: IProductMapper 구현
 */

import type { ProductData } from "@/extractors/base";
import { SaleStatus as SaleStatusEnum } from "@/extractors/base";
import {
  OliveyoungProduct,
  OliveyoungDomSaleStatus,
} from "@/core/domain/OliveyoungProduct";
import type { IProductMapper } from "./IProductMapper";

/**
 * 올리브영 상품 매퍼
 */
export class OliveyoungProductMapper
  implements IProductMapper<OliveyoungProduct>
{
  /**
   * ProductData → OliveyoungProduct 변환
   *
   * 전략:
   * - Schema.org SaleStatus enum → 올리브영 내부 상태 코드 변환
   * - YAML fieldMapping 준수
   */
  map(id: string, data: ProductData): OliveyoungProduct {
    // SaleStatus enum → OliveyoungDomSaleStatus 변환
    const domSaleStatus = this.mapSaleStatusToOliveyoung(
      data.saleStatus.saleStatus,
    );

    return new OliveyoungProduct(
      id,
      data.metadata.productName ||
        (data.saleStatus.saleStatus === SaleStatusEnum.Discontinued
          ? "판매 중지된 상품"
          : ""),
      data.metadata.brand || "",
      data.metadata.thumbnail ||
        "https://static.oliveyoung.co.kr/pc-static-root/image/comm/h1_logo.png",
      data.price.originalPrice || data.price.price,
      data.price.price,
      OliveyoungProduct.mapSaleStatus(domSaleStatus),
    );
  }

  /**
   * Schema.org SaleStatus enum → OliveyoungDomSaleStatus 변환
   */
  private mapSaleStatusToOliveyoung(
    enumStatus: SaleStatusEnum,
  ): OliveyoungDomSaleStatus {
    const mapping: Record<SaleStatusEnum, OliveyoungDomSaleStatus> = {
      [SaleStatusEnum.InStock]: "SELNG", // 판매중
      [SaleStatusEnum.OutOfStock]: "SLDOT", // 일시품절
      [SaleStatusEnum.SoldOut]: "SLDOT", // 품절
      [SaleStatusEnum.Discontinued]: "STSEL", // 판매중지
    };
    return mapping[enumStatus];
  }
}

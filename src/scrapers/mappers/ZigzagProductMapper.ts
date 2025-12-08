/**
 * Zigzag Product Mapper
 *
 * 목적: ProductData → ZigzagProduct 변환
 *
 * SOLID 원칙:
 * - SRP: 지그재그 상품 매핑만 담당
 * - LSP: IProductMapper 구현
 */

import type { ProductData } from "@/extractors/base";
import {
  ZigzagProduct,
  ZigzagDisplayStatus,
} from "@/core/domain/ZigzagProduct";
import { mapSaleStatusEnumToCSV } from "@/utils/saleStatusMapper";
import type { IProductMapper } from "./IProductMapper";

/**
 * 지그재그 상품 매퍼
 */
export class ZigzagProductMapper implements IProductMapper<ZigzagProduct> {
  private readonly displayStatus: ZigzagDisplayStatus;

  constructor(displayStatus: ZigzagDisplayStatus = "VISIBLE") {
    this.displayStatus = displayStatus;
  }

  /**
   * ProductData → ZigzagProduct 변환
   *
   * 전략:
   * - ZigzagExtractor로 추출된 ProductData 사용
   * - SaleStatus enum → CSV 형식 변환
   * - displayStatus는 생성자에서 설정 (기본값: VISIBLE)
   */
  map(id: string, data: ProductData): ZigzagProduct {
    const saleStatus = mapSaleStatusEnumToCSV(data.saleStatus.saleStatus);

    return new ZigzagProduct(
      id,
      data.metadata.productName,
      data.metadata.brand || "",
      data.metadata.thumbnail || "",
      data.price.originalPrice || data.price.price,
      data.price.price,
      saleStatus,
      data.saleStatus.isAvailable,
      this.displayStatus,
    );
  }
}

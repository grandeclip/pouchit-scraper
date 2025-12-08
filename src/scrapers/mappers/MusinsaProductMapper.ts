/**
 * Musinsa Product Mapper
 *
 * 목적: ProductData → MusinsaProduct 변환
 *
 * SOLID 원칙:
 * - SRP: 무신사 상품 매핑만 담당
 * - LSP: IProductMapper 구현
 */

import type { ProductData } from "@/extractors/base";
import { MusinsaProduct } from "@/core/domain/MusinsaProduct";
import { mapSaleStatusEnumToCSV } from "@/utils/saleStatusMapper";
import type { IProductMapper } from "./IProductMapper";

/**
 * 무신사 상품 매퍼
 */
export class MusinsaProductMapper implements IProductMapper<MusinsaProduct> {
  /**
   * ProductData → MusinsaProduct 변환
   *
   * 전략:
   * - MusinsaExtractor로 추출된 ProductData 사용
   * - SaleStatus enum → CSV 형식 변환
   */
  map(id: string, data: ProductData): MusinsaProduct {
    const saleStatus = mapSaleStatusEnumToCSV(data.saleStatus.saleStatus);

    return new MusinsaProduct(
      id,
      data.metadata.productName,
      data.metadata.thumbnail || "",
      data.price.originalPrice || data.price.price,
      data.price.price,
      saleStatus,
    );
  }
}

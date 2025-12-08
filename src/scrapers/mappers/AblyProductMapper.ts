/**
 * Ably Product Mapper
 *
 * 목적: ProductData → AblyProduct 변환
 *
 * SOLID 원칙:
 * - SRP: 에이블리 상품 매핑만 담당
 * - LSP: IProductMapper 구현
 */

import type { ProductData } from "@/extractors/base";
import { AblyProduct } from "@/core/domain/AblyProduct";
import { mapSaleStatusEnumToCSV } from "@/utils/saleStatusMapper";
import type { IProductMapper } from "./IProductMapper";

/**
 * 에이블리 상품 매퍼
 */
export class AblyProductMapper implements IProductMapper<AblyProduct> {
  /**
   * ProductData → AblyProduct 변환
   *
   * 전략:
   * - AblyExtractor로 추출된 ProductData 사용
   * - SaleStatus enum → CSV 형식 변환
   */
  map(id: string, data: ProductData): AblyProduct {
    const saleStatus = mapSaleStatusEnumToCSV(data.saleStatus.saleStatus);

    return new AblyProduct(
      id,
      id, // goodsNo = id
      data.metadata.productName,
      data.metadata.thumbnail || "",
      data.price.originalPrice || data.price.price,
      data.price.price,
      saleStatus,
      "extractor",
      data.metadata.images,
    );
  }
}

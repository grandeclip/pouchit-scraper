/**
 * Kurly Product Mapper
 *
 * 목적: ProductData → KurlyProduct 변환
 *
 * SOLID 원칙:
 * - SRP: 컬리 상품 매핑만 담당
 * - LSP: IProductMapper 구현
 */

import type { ProductData } from "@/extractors/base";
import { KurlyProduct } from "@/core/domain/KurlyProduct";
import { mapSaleStatusEnumToCSV } from "@/utils/saleStatusMapper";
import type { IProductMapper } from "./IProductMapper";

/**
 * 컬리 상품 매퍼
 */
export class KurlyProductMapper implements IProductMapper<KurlyProduct> {
  /**
   * ProductData → KurlyProduct 변환
   *
   * 전략:
   * - KurlyExtractor로 추출된 ProductData 사용
   * - SaleStatus enum → CSV 형식 변환
   */
  map(id: string, data: ProductData): KurlyProduct {
    const saleStatus = mapSaleStatusEnumToCSV(data.saleStatus.saleStatus);

    return new KurlyProduct(
      id,
      data.metadata.productName,
      data.metadata.thumbnail || "",
      data.price.originalPrice || data.price.price,
      data.price.price,
      saleStatus,
    );
  }
}

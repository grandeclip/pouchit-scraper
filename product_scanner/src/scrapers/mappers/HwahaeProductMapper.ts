/**
 * Hwahae Product Mapper
 *
 * 목적: ProductData → HwahaeProduct 변환
 *
 * SOLID 원칙:
 * - SRP: 화해 상품 매핑만 담당
 * - LSP: IProductMapper 구현
 */

import type { ProductData } from "@/extractors/base";
import { HwahaeProduct } from "@/core/domain/HwahaeProduct";
import { mapSaleStatusEnumToCSV } from "@/utils/saleStatusMapper";
import type { IProductMapper } from "./IProductMapper";

/**
 * 화해 상품 매퍼
 */
export class HwahaeProductMapper implements IProductMapper<HwahaeProduct> {
  /**
   * ProductData → HwahaeProduct 변환
   *
   * 전략:
   * - HwahaeExtractor로 추출된 ProductData 사용
   * - YAML fieldMapping 준수
   * - SaleStatus enum → CSV 형식 변환
   */
  map(id: string, data: ProductData): HwahaeProduct {
    const saleStatus = mapSaleStatusEnumToCSV(data.saleStatus.saleStatus);

    return new HwahaeProduct(
      id,
      data.metadata.productName,
      data.metadata.thumbnail || "",
      data.price.originalPrice || data.price.price,
      data.price.price,
      saleStatus,
    );
  }
}

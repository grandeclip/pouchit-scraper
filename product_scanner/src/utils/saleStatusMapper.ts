/**
 * SaleStatus Mapper
 *
 * 목적: schema.org SaleStatus enum → CSV 형식 변환 공통화
 * 패턴: Mapper Pattern
 * 참고: ProductData.fromProductData 팩토리 메서드에서 사용
 */

import { SaleStatus } from "@/extractors/base";
import type { SaleStatus as CSVSaleStatus } from "@/core/interfaces/IProduct";

/**
 * schema.org SaleStatus enum → CSV 판매 상태 변환
 *
 * 매핑 규칙:
 * - InStock (0) → "on_sale" (판매중)
 * - OutOfStock (1) → "on_sale" (일시 품절, 재입고 예정)
 * - SoldOut (2) → "sold_out" (품절)
 * - Discontinued (3) → "off_sale" (판매중지)
 *
 * @param enumStatus schema.org SaleStatus enum (0-3)
 * @returns CSV 형식 판매 상태 문자열
 *
 * @example
 * mapSaleStatusEnumToCSV(SaleStatus.InStock) // "on_sale"
 * mapSaleStatusEnumToCSV(SaleStatus.SoldOut) // "sold_out"
 */
export function mapSaleStatusEnumToCSV(enumStatus: SaleStatus): CSVSaleStatus {
  const mapping: Record<SaleStatus, CSVSaleStatus> = {
    [SaleStatus.InStock]: "on_sale", // 판매중
    [SaleStatus.OutOfStock]: "on_sale", // 일시 품절 (재입고 예정)
    [SaleStatus.SoldOut]: "sold_out", // 품절
    [SaleStatus.Discontinued]: "off_sale", // 판매중지
  };

  return mapping[enumStatus];
}

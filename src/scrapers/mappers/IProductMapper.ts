/**
 * Product Mapper Interface
 *
 * 목적: ProductData(Extractor 출력) → Product 도메인 모델 변환
 *
 * SOLID 원칙:
 * - SRP: 데이터 변환만 담당
 * - ISP: 최소 인터페이스 (map 메서드만)
 * - DIP: 상위 모듈은 이 인터페이스에 의존
 *
 * @template TProduct 출력 Product 타입 (IProduct 구현체)
 */

import type { ProductData } from "@/extractors/base";
import type { IProduct } from "@/core/interfaces/IProduct";

/**
 * Product Mapper Interface
 *
 * @template TProduct Product 도메인 모델 타입
 */
export interface IProductMapper<TProduct extends IProduct> {
  /**
   * ProductData → Product 변환
   *
   * @param id 상품 ID
   * @param data Extractor에서 추출된 ProductData
   * @returns Product 도메인 모델
   */
  map(id: string, data: ProductData): TProduct;
}

/**
 * Mapper 팩토리 타입
 */
export type ProductMapperFactory<TProduct extends IProduct> =
  () => IProductMapper<TProduct>;

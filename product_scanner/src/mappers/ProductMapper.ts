/**
 * Product Mapper (DTO Pattern)
 *
 * SOLID 원칙:
 * - SRP: Domain ↔ DTO 변환만 담당
 * - OCP: 새로운 플랫폼 추가 시 확장
 * - DIP: 인터페이스에 의존
 *
 * 용도:
 * - Service Layer에서 Domain 모델을 DTO로 변환
 * - Controller가 Domain 모델에 직접 의존하지 않도록 격리
 */

import { HwahaeProduct } from "@/core/domain/HwahaeProduct";
import { OliveyoungProduct } from "@/core/domain/OliveyoungProduct";

/**
 * 화해 상품 DTO
 */
export interface HwahaeProductDTO {
  goodsId: string;
  productName: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: string;
}

/**
 * 올리브영 상품 DTO
 */
export interface OliveyoungProductDTO {
  goodsNo: string;
  productName: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: string;
}

/**
 * 화해 상품을 DTO로 변환
 */
export function hwahaeProductToDTO(product: HwahaeProduct): HwahaeProductDTO {
  return {
    goodsId: product.goodsId,
    productName: product.productName,
    thumbnail: product.thumbnail,
    originalPrice: product.originalPrice,
    discountedPrice: product.discountedPrice,
    saleStatus: product.saleStatus,
  };
}

/**
 * 올리브영 상품을 DTO로 변환
 */
export function oliveyoungProductToDTO(
  product: OliveyoungProduct,
): OliveyoungProductDTO {
  return {
    goodsNo: product.goodsNo,
    productName: product.productName,
    thumbnail: product.thumbnail,
    originalPrice: product.originalPrice,
    discountedPrice: product.discountedPrice,
    saleStatus: product.saleStatus,
  };
}

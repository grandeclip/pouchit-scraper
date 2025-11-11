/**
 * A-bly 제품 Domain Model
 * SOLID 원칙:
 * - SRP: 제품 데이터 표현만 담당
 * - OCP: 확장 가능한 구조
 */

import { IProduct, SaleStatus } from "@/core/interfaces/IProduct";

/**
 * A-bly DOM 추출 응답 (SSR + DOM fallback)
 */
export interface AblyDOMResponse {
  productName: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: "on_sale" | "sold_out" | "off_sale";
  thumbnail: string;
  additionalImages?: string[];
  dataSource: "ssr" | "dom" | "alert" | "error";
  rawSaleType?: string;
  error?: string;
}

/**
 * A-bly 제품 Domain 객체
 */
export class AblyProduct implements IProduct {
  constructor(
    public readonly id: string,
    public readonly goodsNo: string,
    public readonly productName: string,
    public readonly thumbnail: string,
    public readonly originalPrice: number,
    public readonly discountedPrice: number,
    public readonly saleStatus: SaleStatus,
    public readonly dataSource?: "ssr" | "dom" | "alert" | "error",
    public readonly additionalImages?: string[],
  ) {}

  /**
   * DOM 데이터로부터 AblyProduct 생성
   */
  static fromDOMData(
    data: AblyDOMResponse & { id: string; goodsNo: string },
  ): AblyProduct {
    return new AblyProduct(
      data.id,
      data.goodsNo,
      data.productName,
      data.thumbnail,
      data.originalPrice,
      data.discountedPrice,
      data.saleStatus,
      data.dataSource,
      data.additionalImages,
    );
  }

  /**
   * 할인율 계산
   */
  getDiscountRate(): number {
    if (this.originalPrice === 0) return 0;
    return Math.round(
      ((this.originalPrice - this.discountedPrice) / this.originalPrice) * 100,
    );
  }

  /**
   * 일반 객체로 변환 (직렬화)
   */
  toPlainObject(): Record<string, any> {
    return {
      id: this.id,
      goodsNo: this.goodsNo,
      productName: this.productName,
      thumbnail: this.thumbnail,
      originalPrice: this.originalPrice,
      discountedPrice: this.discountedPrice,
      saleStatus: this.saleStatus,
      discountRate: this.getDiscountRate(),
      dataSource: this.dataSource,
      additionalImages: this.additionalImages,
    };
  }
}

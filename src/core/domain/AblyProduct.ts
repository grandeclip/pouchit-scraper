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
    public readonly dataSource?:
      | "ssr"
      | "dom"
      | "alert"
      | "error"
      | "extractor",
    public readonly additionalImages?: string[],
  ) {}

  /**
   * DOM 데이터로부터 AblyProduct 생성
   * YAML 필드명 (name, consumer_price, price, title_images, _source) 지원
   */
  static fromDOMData(data: any): AblyProduct {
    return new AblyProduct(
      data.id || data.goodsNo || "",
      data.goodsNo || data.id || "",
      data.productName || data.name || "",
      data.thumbnail || data.title_images?.[0] || "",
      Number(data.originalPrice || data.consumer_price || 0),
      Number(data.discountedPrice || data.price || 0),
      data.saleStatus || data.sale_status || "off_sale",
      data.dataSource || data._source || "dom",
      data.additionalImages || data.title_images?.slice(1) || [],
    );
  }

  /**
   * 팩토리 메서드: ProductData로부터 AblyProduct 생성 (Extractor 기반)
   *
   * 전략:
   * - AblyExtractor로 추출된 ProductData 사용
   * - YAML fieldMapping 불필요 (Extractor가 처리)
   * - SaleStatus enum (InStock/SoldOut/Discontinued) → CSV 형식 변환
   *
   * @param goodsNo 상품 번호 (URL에서 추출)
   * @param productData Extractor로 추출된 상품 데이터
   */
  static fromProductData(
    goodsNo: string,
    productData: import("@/extractors/base").ProductData,
  ): AblyProduct {
    // SaleStatus enum → CSV 형식 변환 (공통 유틸 사용)
    const { mapSaleStatusEnumToCSV } = require("@/utils/saleStatusMapper");
    const saleStatus = mapSaleStatusEnumToCSV(
      productData.saleStatus.saleStatus,
    );

    return new AblyProduct(
      goodsNo,
      goodsNo,
      productData.metadata.productName,
      productData.metadata.thumbnail || "",
      productData.price.originalPrice || productData.price.price,
      productData.price.price,
      saleStatus,
      "extractor",
      productData.metadata.images,
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

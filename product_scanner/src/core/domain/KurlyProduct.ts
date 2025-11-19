/**
 * 컬리 상품 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: 컬리 상품 데이터만 표현
 * - 불변 객체 (Value Object 패턴)
 * - ISP: IProduct 인터페이스 구현
 */

import { IProduct, SaleStatus } from "@/core/interfaces/IProduct";

/**
 * DOM 추출 판매 상태 (컬리 원본)
 */
export type KurlyDomSaleStatus =
  | "ON_SALE"
  | "SOLD_OUT"
  | "INFO_CHANGED"
  | "NOT_FOUND"
  | "ERROR";

/**
 * 컬리 상품 엔티티
 */
export class KurlyProduct implements IProduct {
  constructor(
    public readonly productId: string,
    public readonly productName: string,
    public readonly thumbnail: string,
    public readonly originalPrice: number,
    public readonly discountedPrice: number,
    public readonly saleStatus: SaleStatus,
  ) {
    this.validate();
  }

  /**
   * IProduct 호환성을 위한 id getter
   */
  get id(): string {
    return this.productId;
  }

  private validate(): void {
    if (!this.productId) throw new Error("productId is required");
    if (!this.productName) throw new Error("productName is required");
    if (this.originalPrice < 0) throw new Error("originalPrice must be >= 0");
    if (this.discountedPrice < 0)
      throw new Error("discountedPrice must be >= 0");
    if (!this.isValidSaleStatus(this.saleStatus)) {
      throw new Error(`Invalid saleStatus: ${this.saleStatus}`);
    }
  }

  private isValidSaleStatus(status: string): status is SaleStatus {
    return ["on_sale", "sold_out", "off_sale"].includes(status);
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
   * URL 정규화
   */
  static normalizeUrl(url: string): string {
    return url.split("?")[0];
  }

  /**
   * DOM 판매 상태 → CSV 판매 상태 변환
   */
  static mapSaleStatus(domStatus: KurlyDomSaleStatus): SaleStatus {
    const mapping: Record<KurlyDomSaleStatus, SaleStatus> = {
      ON_SALE: "on_sale",
      SOLD_OUT: "sold_out",
      INFO_CHANGED: "off_sale",
      NOT_FOUND: "off_sale",
      ERROR: "off_sale",
    };
    return mapping[domStatus];
  }

  /**
   * 도메인 객체를 일반 객체로 변환
   */
  toPlainObject(): KurlyProductPlainObject {
    return {
      productId: this.productId,
      productName: this.productName,
      thumbnail: this.thumbnail,
      originalPrice: this.originalPrice,
      discountedPrice: this.discountedPrice,
      saleStatus: this.saleStatus,
      discountRate: this.getDiscountRate(),
    };
  }

  /**
   * 팩토리 메서드: DOM 데이터로부터 KurlyProduct 생성
   */
  static fromDOMData(domData: KurlyDOMResponse): KurlyProduct {
    // 정가 결정: retailPrice가 있으면 사용, 없으면 basePrice 사용
    const originalPrice = domData.retailPrice ?? domData.basePrice;

    return new KurlyProduct(
      String(domData.productId || "unknown"),
      domData.name,
      domData.mainImageUrl || "",
      originalPrice,
      domData.discountedPrice ?? domData.basePrice,
      KurlyProduct.mapSaleStatus(domData.status),
    );
  }
}

/**
 * 직렬화를 위한 일반 객체 타입
 */
export interface KurlyProductPlainObject {
  productId: string;
  productName: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: SaleStatus;
  discountRate: number;
}

/**
 * 컬리 DOM 추출 데이터 타입 (__NEXT_DATA__ 기반)
 */
export interface KurlyDOMResponse {
  productId?: string;
  name: string;
  mainImageUrl: string;
  retailPrice: number | null;
  basePrice: number;
  discountedPrice: number | null;
  isSoldOut: boolean | null;
  status: KurlyDomSaleStatus;
  _source?: string;
  _error?: string | null;
  [key: string]: any;
}

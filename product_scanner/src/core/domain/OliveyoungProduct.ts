/**
 * 올리브영 상품 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: 올리브영 상품 데이터만 표현
 * - 불변 객체 (Value Object 패턴)
 * - ISP: IProduct 인터페이스 구현
 */

import { IProduct, SaleStatus } from "@/core/interfaces/IProduct";

/**
 * DOM 추출 판매 상태 (올리브영 원본)
 */
export type OliveyoungDomSaleStatus = "SELNG" | "SLDOT" | "STSEL";

/**
 * 올리브영 상품 엔티티
 */
export class OliveyoungProduct implements IProduct {
  constructor(
    public readonly goodsNo: string,
    public readonly productName: string,
    public readonly brand: string,
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
    return this.goodsNo;
  }

  private validate(): void {
    if (!this.goodsNo) throw new Error("goodsNo is required");
    if (!this.productName) throw new Error("productName is required");
    if (!this.thumbnail) throw new Error("thumbnail is required");
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
   * 가격 차이 계산
   */
  getPriceDifference(other: OliveyoungProduct): number {
    return Math.abs(this.discountedPrice - other.discountedPrice);
  }

  /**
   * 가격 변동률 계산
   */
  getPriceChangeRate(other: OliveyoungProduct): number {
    if (other.discountedPrice === 0) return 0;
    return Math.abs(
      (this.discountedPrice - other.discountedPrice) / other.discountedPrice,
    );
  }

  /**
   * URL 정규화 (쿼리 파라미터 제거)
   */
  static normalizeUrl(url: string): string {
    return url.split("?")[0];
  }

  /**
   * DOM 판매 상태 → CSV 판매 상태 변환
   */
  static mapSaleStatus(domStatus: OliveyoungDomSaleStatus): SaleStatus {
    const mapping: Record<OliveyoungDomSaleStatus, SaleStatus> = {
      SELNG: "on_sale",
      SLDOT: "sold_out",
      STSEL: "off_sale",
    };
    return mapping[domStatus];
  }

  /**
   * 도메인 객체를 일반 객체로 변환
   */
  toPlainObject(): OliveyoungProductPlainObject {
    return {
      goodsNo: this.goodsNo,
      productName: this.productName,
      brand: this.brand,
      thumbnail: this.thumbnail,
      originalPrice: this.originalPrice,
      discountedPrice: this.discountedPrice,
      saleStatus: this.saleStatus,
      discountRate: this.getDiscountRate(),
    };
  }

  /**
   * 팩토리 메서드: 일반 객체로부터 OliveyoungProduct 생성
   */
  static fromPlainObject(obj: PlainObjectSource): OliveyoungProduct {
    return new OliveyoungProduct(
      String(obj.goodsNo || obj.id || ""),
      obj.productName || obj.name || "",
      obj.brand || "",
      obj.thumbnail || "",
      Number(obj.originalPrice || obj.consumer_price || 0),
      Number(obj.discountedPrice || obj.price || 0),
      obj.saleStatus || "off_sale",
    );
  }

  /**
   * 팩토리 메서드: DOM 데이터로부터 OliveyoungProduct 생성
   */
  static fromDOMData(domData: OliveyoungDOMResponse): OliveyoungProduct {
    return new OliveyoungProduct(
      String(domData.id || domData.goodsNo || "unknown"),
      domData.name,
      domData.brand || "",
      domData.title_images[0] || "",
      domData.consumer_price,
      domData.price,
      OliveyoungProduct.mapSaleStatus(domData.sale_status),
    );
  }
}

/**
 * 직렬화를 위한 일반 객체 타입
 */
export interface OliveyoungProductPlainObject {
  goodsNo: string;
  productName: string;
  brand: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: SaleStatus;
  discountRate: number;
}

/**
 * fromPlainObject 입력 타입 (다양한 소스 지원)
 */
export interface PlainObjectSource {
  goodsNo?: string;
  id?: string;
  productName?: string;
  name?: string;
  brand?: string;
  thumbnail?: string;
  originalPrice?: number;
  consumer_price?: number;
  discountedPrice?: number;
  price?: number;
  saleStatus?: SaleStatus;
}

/**
 * 올리브영 DOM 추출 데이터 타입
 */
export interface OliveyoungDOMResponse {
  id?: string;
  goodsNo?: string;
  name: string;
  brand?: string;
  title_images: string[];
  consumer_price: number;
  price: number;
  sale_status: OliveyoungDomSaleStatus;
  _source?: string;
  _redirected?: boolean;
  [key: string]: any;
}

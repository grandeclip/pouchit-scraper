/**
 * 무신사 상품 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: 무신사 상품 데이터만 표현
 * - 불변 객체 (Value Object 패턴)
 * - ISP: IProduct 인터페이스 구현
 */

import { IProduct, SaleStatus } from "@/core/interfaces/IProduct";

/**
 * DOM 추출 판매 상태 (무신사 원본)
 */
export type MusinsaDomSaleStatus = "SELNG" | "SLDOT" | "STSEL";

/**
 * 무신사 상품 엔티티
 */
export class MusinsaProduct implements IProduct {
  constructor(
    public readonly productNo: string,
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
    return this.productNo;
  }

  private validate(): void {
    if (!this.productNo) throw new Error("productNo is required");
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
  getPriceDifference(other: MusinsaProduct): number {
    return Math.abs(this.discountedPrice - other.discountedPrice);
  }

  /**
   * 가격 변동률 계산
   */
  getPriceChangeRate(other: MusinsaProduct): number {
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
  static mapSaleStatus(domStatus: MusinsaDomSaleStatus): SaleStatus {
    const mapping: Record<MusinsaDomSaleStatus, SaleStatus> = {
      SELNG: "on_sale",
      SLDOT: "sold_out",
      STSEL: "off_sale",
    };
    return mapping[domStatus];
  }

  /**
   * 도메인 객체를 일반 객체로 변환
   */
  toPlainObject(): MusinsaProductPlainObject {
    return {
      productNo: this.productNo,
      productName: this.productName,
      thumbnail: this.thumbnail,
      originalPrice: this.originalPrice,
      discountedPrice: this.discountedPrice,
      saleStatus: this.saleStatus,
      discountRate: this.getDiscountRate(),
    };
  }

  /**
   * 팩토리 메서드: 일반 객체로부터 MusinsaProduct 생성
   */
  static fromPlainObject(obj: PlainObjectSource): MusinsaProduct {
    return new MusinsaProduct(
      String(obj.productNo || obj.id || ""),
      obj.productName || obj.name || "",
      obj.thumbnail || "",
      Number(obj.originalPrice || obj.consumer_price || 0),
      Number(obj.discountedPrice || obj.price || 0),
      obj.saleStatus || "off_sale",
    );
  }

  /**
   * 팩토리 메서드: DOM 데이터로부터 MusinsaProduct 생성
   */
  static fromDOMData(domData: MusinsaDOMResponse): MusinsaProduct {
    return new MusinsaProduct(
      String(domData.id || domData.productNo || "unknown"),
      domData.name,
      domData.title_images[0] || "",
      domData.consumer_price,
      domData.price,
      MusinsaProduct.mapSaleStatus(domData.sale_status),
    );
  }

  /**
   * 팩토리 메서드: API 응답 데이터로부터 MusinsaProduct 생성
   * @deprecated Use fromProductData() with MusinsaExtractor instead
   */
  static fromApiResponse(apiData: {
    id: string;
    productNo: string;
    productName: string;
    thumbnail: string;
    originalPrice: number;
    discountedPrice: number;
    saleStatus: string;
  }): MusinsaProduct {
    return new MusinsaProduct(
      apiData.productNo,
      apiData.productName,
      apiData.thumbnail,
      apiData.originalPrice,
      apiData.discountedPrice,
      apiData.saleStatus as SaleStatus,
    );
  }

  /**
   * 팩토리 메서드: ProductData로부터 MusinsaProduct 생성 (Extractor 기반)
   *
   * 전략:
   * - MusinsaExtractor로 추출된 ProductData 사용
   * - YAML fieldMapping 불필요 (Extractor가 처리)
   * - SaleStatus enum (InStock/SoldOut/Discontinued) → CSV 형식 변환
   *
   * @param productNo 상품 번호 (API response.goodsNo)
   * @param productData Extractor로 추출된 상품 데이터
   */
  static fromProductData(
    productNo: string,
    productData: import("@/extractors/base").ProductData,
  ): MusinsaProduct {
    // SaleStatus enum → CSV 형식 변환 (공통 유틸 사용)
    const { mapSaleStatusEnumToCSV } = require("@/utils/saleStatusMapper");
    const saleStatus = mapSaleStatusEnumToCSV(
      productData.saleStatus.saleStatus,
    );

    return new MusinsaProduct(
      productNo,
      productData.metadata.productName,
      productData.metadata.thumbnail || "",
      productData.price.originalPrice || productData.price.price,
      productData.price.price,
      saleStatus,
    );
  }
}

/**
 * 직렬화를 위한 일반 객체 타입
 */
export interface MusinsaProductPlainObject {
  productNo: string;
  productName: string;
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
  productNo?: string;
  id?: string;
  productName?: string;
  name?: string;
  thumbnail?: string;
  originalPrice?: number;
  consumer_price?: number;
  discountedPrice?: number;
  price?: number;
  saleStatus?: SaleStatus;
}

/**
 * 무신사 DOM 추출 데이터 타입
 */
export interface MusinsaDOMResponse {
  id?: string;
  productNo?: string;
  name: string;
  title_images: string[];
  consumer_price: number;
  price: number;
  sale_status: MusinsaDomSaleStatus;
  _source?: string;
  _redirected?: boolean;
}

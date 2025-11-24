/**
 * 화해 상품 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: 화해 상품 데이터만 표현
 * - 불변 객체 (Value Object 패턴)
 * - ISP: IProduct 인터페이스 구현
 */

import { IProduct, SaleStatus } from "@/core/interfaces/IProduct";

/**
 * API 판매 상태 (화해 원본)
 */
export type ApiSaleStatus = "SELNG" | "SLDOT" | "STSEL";

/**
 * 화해 상품 엔티티
 */
export class HwahaeProduct implements IProduct {
  constructor(
    public readonly goodsId: string,
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
    return this.goodsId;
  }

  private validate(): void {
    if (!this.goodsId) throw new Error("goodsId is required");
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
  getPriceDifference(other: HwahaeProduct): number {
    return Math.abs(this.discountedPrice - other.discountedPrice);
  }

  /**
   * 가격 변동률 계산
   */
  getPriceChangeRate(other: HwahaeProduct): number {
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
   * API 판매 상태 → CSV 판매 상태 변환
   */
  static mapSaleStatus(apiStatus: ApiSaleStatus): SaleStatus {
    const mapping: Record<ApiSaleStatus, SaleStatus> = {
      SELNG: "on_sale",
      SLDOT: "sold_out",
      STSEL: "off_sale",
    };
    return mapping[apiStatus];
  }

  /**
   * CSV 판매 상태 → API 판매 상태 변환 (역매핑)
   */
  static reverseSaleStatus(csvStatus: SaleStatus): ApiSaleStatus {
    const reverseMapping: Record<SaleStatus, ApiSaleStatus> = {
      on_sale: "SELNG",
      sold_out: "SLDOT",
      off_sale: "STSEL",
    };
    return reverseMapping[csvStatus];
  }

  /**
   * 도메인 객체를 일반 객체로 변환
   */
  toPlainObject(): HwahaeProductPlainObject {
    return {
      goodsId: this.goodsId,
      productName: this.productName,
      thumbnail: this.thumbnail,
      originalPrice: this.originalPrice,
      discountedPrice: this.discountedPrice,
      saleStatus: this.saleStatus,
      discountRate: this.getDiscountRate(),
    };
  }

  /**
   * 팩토리 메서드: 일반 객체로부터 HwahaeProduct 생성
   */
  static fromPlainObject(obj: any): HwahaeProduct {
    return new HwahaeProduct(
      String(obj.goodsId || obj.id),
      obj.productName || obj.name,
      obj.thumbnail,
      Number(obj.originalPrice || obj.consumer_price),
      Number(obj.discountedPrice || obj.price),
      obj.saleStatus,
    );
  }

  /**
   * 팩토리 메서드: API 응답으로부터 HwahaeProduct 생성
   * @deprecated Use fromProductData() with HwahaeExtractor instead
   */
  static fromApiResponse(apiData: HwahaeApiResponse): HwahaeProduct {
    return new HwahaeProduct(
      String(apiData.id),
      apiData.name,
      apiData.title_images[0],
      apiData.consumer_price,
      apiData.price,
      HwahaeProduct.mapSaleStatus(apiData.sale_status),
    );
  }

  /**
   * 팩토리 메서드: ProductData로부터 HwahaeProduct 생성 (Extractor 기반)
   *
   * 전략:
   * - HwahaeExtractor로 추출된 ProductData 사용
   * - YAML fieldMapping 준수
   * - SaleStatus enum (InStock/SoldOut/Discontinued) → CSV 형식 변환
   *
   * @param goodsId 상품 ID (API response.id)
   * @param productData Extractor로 추출된 상품 데이터
   */
  static fromProductData(
    goodsId: string,
    productData: import("@/extractors/base").ProductData,
  ): HwahaeProduct {
    // SaleStatus enum → CSV 형식 변환 (공통 유틸 사용)
    const { mapSaleStatusEnumToCSV } = require("@/utils/saleStatusMapper");
    const saleStatus = mapSaleStatusEnumToCSV(
      productData.saleStatus.saleStatus,
    );

    return new HwahaeProduct(
      goodsId,
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
export interface HwahaeProductPlainObject {
  goodsId: string;
  productName: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: SaleStatus;
  discountRate: number;
}

/**
 * 화해 API 응답 타입
 */
export interface HwahaeApiResponse {
  id: number;
  name: string;
  title_images: string[];
  consumer_price: number;
  price: number;
  sale_status: ApiSaleStatus;
  [key: string]: any;
}

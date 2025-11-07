/**
 * ZigZag 상품 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: ZigZag 상품 데이터만 표현
 * - 불변 객체 (Value Object 패턴)
 * - ISP: IProduct 인터페이스 구현
 */

import { IProduct, SaleStatus } from "@/core/interfaces/IProduct";
import type { NextDataProductData } from "@/core/domain/NextDataProductData";

/**
 * __NEXT_DATA__ 추출 판매 상태 (ZigZag 원본)
 */
export type ZigzagSalesStatus = "ON_SALE" | "SOLD_OUT" | "SUSPENDED";

/**
 * ZigZag 노출 상태
 */
export type ZigzagDisplayStatus = "VISIBLE" | "HIDDEN";

/**
 * ZigZag 상품 엔티티
 */
export class ZigzagProduct implements IProduct {
  constructor(
    public readonly productId: string,
    public readonly productName: string,
    public readonly brand: string,
    public readonly thumbnail: string,
    public readonly originalPrice: number,
    public readonly discountedPrice: number,
    public readonly saleStatus: SaleStatus,
    public readonly isPurchasable: boolean,
    public readonly displayStatus: ZigzagDisplayStatus,
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
    if (!this.brand) throw new Error("brand is required");
    if (!this.thumbnail) throw new Error("thumbnail is required");
    if (this.originalPrice < 0) throw new Error("originalPrice must be >= 0");
    if (this.discountedPrice < 0)
      throw new Error("discountedPrice must be >= 0");
    if (!this.isValidSaleStatus(this.saleStatus)) {
      throw new Error(`Invalid saleStatus: ${this.saleStatus}`);
    }
    if (!this.isValidDisplayStatus(this.displayStatus)) {
      throw new Error(`Invalid displayStatus: ${this.displayStatus}`);
    }
  }

  private isValidSaleStatus(status: string): status is SaleStatus {
    return ["on_sale", "sold_out", "off_sale"].includes(status);
  }

  private isValidDisplayStatus(status: string): status is ZigzagDisplayStatus {
    return ["VISIBLE", "HIDDEN"].includes(status);
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
  getPriceDifference(other: ZigzagProduct): number {
    return Math.abs(this.discountedPrice - other.discountedPrice);
  }

  /**
   * 가격 변동률 계산
   */
  getPriceChangeRate(other: ZigzagProduct): number {
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
   * __NEXT_DATA__ 판매 상태 → CSV 판매 상태 변환
   */
  static mapSaleStatus(nextDataStatus: ZigzagSalesStatus): SaleStatus {
    const mapping: Record<ZigzagSalesStatus, SaleStatus> = {
      ON_SALE: "on_sale",
      SOLD_OUT: "sold_out",
      SUSPENDED: "off_sale",
    };
    return mapping[nextDataStatus];
  }

  /**
   * 도메인 객체를 일반 객체로 변환
   */
  toPlainObject(): ZigzagProductPlainObject {
    return {
      productId: this.productId,
      productName: this.productName,
      brand: this.brand,
      thumbnail: this.thumbnail,
      originalPrice: this.originalPrice,
      discountedPrice: this.discountedPrice,
      saleStatus: this.saleStatus,
      isPurchasable: this.isPurchasable,
      displayStatus: this.displayStatus,
      discountRate: this.getDiscountRate(),
    };
  }

  /**
   * 팩토리 메서드: 일반 객체로부터 ZigzagProduct 생성
   */
  static fromPlainObject(obj: PlainObjectSource): ZigzagProduct {
    return new ZigzagProduct(
      String(obj.productId || obj.id || ""),
      obj.productName || obj.name || "",
      obj.brand || "",
      obj.thumbnail || "",
      Number(obj.originalPrice || 0),
      Number(obj.discountedPrice || 0),
      obj.saleStatus || "off_sale",
      obj.isPurchasable !== undefined ? obj.isPurchasable : false,
      (obj.displayStatus as ZigzagDisplayStatus) || "HIDDEN",
    );
  }

  /**
   * 팩토리 메서드: __NEXT_DATA__ 데이터로부터 ZigzagProduct 생성
   *
   * NextDataSchemaExtractor가 반환하는 NextDataProductData를 받음
   */
  static fromNextData(nextData: NextDataProductData): ZigzagProduct {
    const salesStatus = (nextData.salesStatus ||
      "SUSPENDED") as ZigzagSalesStatus;

    return new ZigzagProduct(
      nextData.id,
      nextData.name,
      nextData.brand,
      nextData.thumbnail,
      nextData.originalPrice,
      nextData.discountedPrice,
      ZigzagProduct.mapSaleStatus(salesStatus),
      nextData.isPurchasable,
      nextData.displayStatus as ZigzagDisplayStatus,
    );
  }

  /**
   * 팩토리 메서드: 원본 __NEXT_DATA__ JSON으로부터 생성
   *
   * 테스트나 직접 파싱 시 사용
   */
  static fromRawNextData(nextData: ZigzagNextDataResponse): ZigzagProduct {
    // 브랜드 정보 추출
    const brand = nextData.shop?.name || nextData.product.shop_name || "";

    // 썸네일 추출
    const thumbnail =
      nextData.product.product_image_list?.find(
        (img: any) => img.image_type === "MAIN",
      )?.pdp_thumbnail_url || "";

    // 가격 정보 추출
    const originalPrice =
      nextData.product.product_price?.max_price_info?.price || 0;
    const discountedPrice =
      nextData.product.product_price?.final_discount_info?.discount_price ||
      originalPrice;

    return new ZigzagProduct(
      String(nextData.product.id),
      nextData.product.name,
      brand,
      thumbnail,
      originalPrice,
      discountedPrice,
      ZigzagProduct.mapSaleStatus(nextData.product.sales_status),
      nextData.product.is_purchasable,
      nextData.product.display_status,
    );
  }
}

/**
 * 직렬화를 위한 일반 객체 타입
 */
export interface ZigzagProductPlainObject {
  productId: string;
  productName: string;
  brand: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: SaleStatus;
  isPurchasable: boolean;
  displayStatus: ZigzagDisplayStatus;
  discountRate: number;
}

/**
 * fromPlainObject 입력 타입 (다양한 소스 지원)
 */
export interface PlainObjectSource {
  productId?: string;
  id?: string;
  productName?: string;
  name?: string;
  brand?: string;
  thumbnail?: string;
  originalPrice?: number;
  discountedPrice?: number;
  saleStatus?: SaleStatus;
  isPurchasable?: boolean;
  displayStatus?: string;
}

/**
 * ZigZag __NEXT_DATA__ 추출 데이터 타입
 */
export interface ZigzagNextDataResponse {
  product: {
    id: string;
    name: string;
    shop_name?: string;
    is_purchasable: boolean;
    sales_status: ZigzagSalesStatus;
    display_status: ZigzagDisplayStatus;
    product_price: {
      max_price_info: { price: number };
      final_discount_info: { discount_price: number };
    };
    product_image_list?: Array<{
      image_type: string;
      pdp_thumbnail_url: string;
    }>;
  };
  shop?: {
    id: number;
    name: string;
  };
  _source?: string;
}

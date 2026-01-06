/**
 * 쿠폰 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: 쿠폰 데이터 표현만 담당
 * - OCP: 새로운 쿠폰 유형 확장 가능
 * - ISP: ICoupon 인터페이스 구현
 */

import { PlatformId } from "./PlatformId";

/**
 * 쿠폰 유형
 */
export type CouponType =
  | "first_purchase" // 첫구매 쿠폰
  | "store" // 스토어/브랜드 쿠폰
  | "product" // 상품 특정 쿠폰
  | "category" // 카테고리 쿠폰
  | "membership" // 멤버십 쿠폰
  | "event" // 이벤트/세일 쿠폰
  | "payment"; // 결제수단 쿠폰

/**
 * 할인 유형
 */
export type DiscountType = "percent" | "fixed";

/**
 * 쿠폰 인터페이스
 */
export interface ICoupon {
  readonly platform: PlatformId;
  readonly type: CouponType;
  readonly name: string;
  readonly discountType: DiscountType;
  readonly discountValue: number;
  readonly requiresLogin: boolean;
  readonly visibleWithoutLogin: boolean;
}

/**
 * 쿠폰 할인 정보
 */
export interface CouponDiscount {
  type: DiscountType;
  value: number;
  maxDiscount?: number;
}

/**
 * 쿠폰 적용 조건
 */
export interface CouponConditions {
  minPurchase?: number;
  categories?: string[];
  products?: string[];
  paymentMethods?: string[];
  membershipRequired?: boolean;
}

/**
 * 쿠폰 유효기간
 */
export interface CouponValidity {
  startsAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
}

/**
 * 쿠폰 접근성 정보
 */
export interface CouponAccessibility {
  requiresLogin: boolean;
  visibleWithoutLogin: boolean;
  downloadUrl?: string;
}

/**
 * 쿠폰 엔티티
 */
export class Coupon implements ICoupon {
  constructor(
    public readonly platform: PlatformId,
    public readonly type: CouponType,
    public readonly name: string,
    public readonly discount: CouponDiscount,
    public readonly conditions: CouponConditions,
    public readonly accessibility: CouponAccessibility,
    public readonly validity: CouponValidity,
    public readonly sourceUrl?: string,
  ) {
    this.validate();
  }

  get discountType(): DiscountType {
    return this.discount.type;
  }

  get discountValue(): number {
    return this.discount.value;
  }

  get requiresLogin(): boolean {
    return this.accessibility.requiresLogin;
  }

  get visibleWithoutLogin(): boolean {
    return this.accessibility.visibleWithoutLogin;
  }

  private validate(): void {
    if (!this.platform) throw new Error("platform is required");
    if (!this.type) throw new Error("type is required");
    if (!this.name) throw new Error("name is required");
    if (this.discount.value < 0) throw new Error("discount value must be >= 0");
    if (this.discount.type === "percent" && this.discount.value > 100) {
      throw new Error("percent discount cannot exceed 100");
    }
  }

  /**
   * 할인 금액 계산
   */
  calculateDiscount(price: number): number {
    if (this.conditions.minPurchase && price < this.conditions.minPurchase) {
      return 0;
    }

    let discount: number;
    if (this.discount.type === "percent") {
      discount = Math.floor(price * (this.discount.value / 100));
    } else {
      discount = this.discount.value;
    }

    if (this.discount.maxDiscount) {
      discount = Math.min(discount, this.discount.maxDiscount);
    }

    return discount;
  }

  /**
   * 쿠폰 적용 가능 여부 확인
   */
  isApplicable(price: number, productId?: string): boolean {
    // 유효기간 확인
    if (!this.validity.isActive) return false;

    // 최소 구매 금액 확인
    if (this.conditions.minPurchase && price < this.conditions.minPurchase) {
      return false;
    }

    // 특정 상품 제한 확인
    if (
      productId &&
      this.conditions.products?.length &&
      !this.conditions.products.includes(productId)
    ) {
      return false;
    }

    return true;
  }

  /**
   * 할인 표시 문자열
   */
  getDiscountDisplay(): string {
    if (this.discount.type === "percent") {
      const maxStr = this.discount.maxDiscount
        ? ` (최대 ${this.discount.maxDiscount.toLocaleString()}원)`
        : "";
      return `${this.discount.value}%${maxStr}`;
    }
    return `${this.discount.value.toLocaleString()}원`;
  }

  /**
   * 일반 객체로 변환
   */
  toPlainObject(): CouponPlainObject {
    return {
      platform: this.platform,
      type: this.type,
      name: this.name,
      discount: this.discount,
      conditions: this.conditions,
      accessibility: this.accessibility,
      validity: {
        startsAt: this.validity.startsAt?.toISOString(),
        expiresAt: this.validity.expiresAt?.toISOString(),
        isActive: this.validity.isActive,
      },
      sourceUrl: this.sourceUrl,
    };
  }

  /**
   * 팩토리: 일반 객체에서 생성
   */
  static fromPlainObject(obj: CouponPlainObjectInput): Coupon {
    return new Coupon(
      obj.platform,
      obj.type,
      obj.name,
      obj.discount,
      obj.conditions || {},
      obj.accessibility || {
        requiresLogin: true,
        visibleWithoutLogin: false,
      },
      {
        startsAt: obj.validity?.startsAt
          ? new Date(obj.validity.startsAt)
          : undefined,
        expiresAt: obj.validity?.expiresAt
          ? new Date(obj.validity.expiresAt)
          : undefined,
        isActive: obj.validity?.isActive ?? true,
      },
      obj.sourceUrl,
    );
  }

  /**
   * 팩토리: 무신사 쿠폰 데이터에서 생성
   */
  static fromMusinsaData(data: MusinsaCouponData): Coupon {
    return new Coupon(
      "musinsa",
      data.type || "first_purchase",
      data.name,
      {
        type: data.discountType || "percent",
        value: data.discountValue,
        maxDiscount: data.maxDiscount,
      },
      {
        minPurchase: data.minPurchase,
      },
      {
        requiresLogin: data.requiresLogin ?? false,
        visibleWithoutLogin: data.visibleWithoutLogin ?? true,
        downloadUrl: data.downloadUrl,
      },
      {
        isActive: true,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
      data.sourceUrl,
    );
  }

  /**
   * 팩토리: 지그재그 쿠폰 데이터에서 생성
   */
  static fromZigzagData(data: ZigzagCouponData): Coupon {
    return new Coupon(
      "zigzag",
      data.coupon_type || "store",
      data.coupon_name,
      {
        type: data.discount_type === "rate" ? "percent" : "fixed",
        value: data.discount_value,
        maxDiscount: data.max_discount,
      },
      {
        minPurchase: data.min_purchase,
        products: data.applicable_products,
      },
      {
        requiresLogin: !data.coupon_available_status,
        visibleWithoutLogin:
          data.coupon_available_status === "COUPON_AVAILABLE",
      },
      {
        isActive: data.is_active ?? true,
      },
      data.source_url,
    );
  }
}

/**
 * 직렬화용 일반 객체 타입
 */
export interface CouponPlainObject {
  platform: PlatformId;
  type: CouponType;
  name: string;
  discount: CouponDiscount;
  conditions: CouponConditions;
  accessibility: CouponAccessibility;
  validity: {
    startsAt?: string;
    expiresAt?: string;
    isActive: boolean;
  };
  sourceUrl?: string;
}

/**
 * fromPlainObject 입력 타입
 */
export interface CouponPlainObjectInput {
  platform: PlatformId;
  type: CouponType;
  name: string;
  discount: CouponDiscount;
  conditions?: CouponConditions;
  accessibility?: CouponAccessibility;
  validity?: {
    startsAt?: string;
    expiresAt?: string;
    isActive?: boolean;
  };
  sourceUrl?: string;
}

/**
 * 무신사 쿠폰 원본 데이터 타입
 */
export interface MusinsaCouponData {
  name: string;
  type?: CouponType;
  discountType?: DiscountType;
  discountValue: number;
  maxDiscount?: number;
  minPurchase?: number;
  requiresLogin?: boolean;
  visibleWithoutLogin?: boolean;
  downloadUrl?: string;
  expiresAt?: string;
  sourceUrl?: string;
}

/**
 * 지그재그 쿠폰 원본 데이터 타입
 */
export interface ZigzagCouponData {
  coupon_name: string;
  coupon_type?: CouponType;
  discount_type: "rate" | "amount";
  discount_value: number;
  max_discount?: number;
  min_purchase?: number;
  applicable_products?: string[];
  coupon_available_status?: "COUPON_AVAILABLE" | "NOT_AVAILABLE";
  is_active?: boolean;
  source_url?: string;
}

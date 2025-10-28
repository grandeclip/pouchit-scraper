/**
 * 상품 도메인 모델
 * 모든 쇼핑몰의 상품 정보를 표현하는 통합 모델
 * 
 * SOLID 원칙:
 * - SRP: 상품 데이터만 표현
 * - 불변 객체 (Value Object 패턴)
 */

export type ShoppingMall = 'oliveyoung' | 'zigzag' | 'musinsa' | 'ably' | 'kurly' | 'hwahae'; // | 'coupang' (봇 탐지로 인해 비활성화)

/**
 * 상품 도메인 엔티티
 */
export class Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly brand: string,
    public readonly mall: ShoppingMall,
    public readonly url: string,
    public readonly thumbnail: string | null,
    public readonly price: ProductPrice,
    public readonly metadata: ProductMetadata = {}
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.name) throw new Error('Product name is required');
    if (!this.brand || this.brand.trim().length === 0) {
      throw new Error('Product brand is required');
    }
    if (!this.url) throw new Error('Product URL is required');
    // thumbnail은 null 허용
  }

  /**
   * 할인율 계산
   */
  getDiscountRate(): number {
    if (!this.price.original || this.price.original <= this.price.sale) {
      return 0;
    }
    return Math.round(
      ((this.price.original - this.price.sale) / this.price.original) * 100
    );
  }

  /**
   * 할인 여부 확인
   */
  isOnSale(): boolean {
    return this.getDiscountRate() > 0;
  }

  /**
   * 도메인 객체를 일반 객체로 변환
   */
  toPlainObject(): ProductPlainObject {
    return {
      productId: this.id,
      productName: this.name,
      brand: this.brand,
      productUrl: this.url,
      thumbnail: this.thumbnail,
      originalPrice: this.price.original,
      salePrice: this.price.sale,
      discountRate: this.getDiscountRate(),
      ...this.metadata,
    };
  }

  /**
   * 팩토리 메서드: 일반 객체로부터 Product 생성
   */
  static fromPlainObject(obj: any, mall: ShoppingMall): Product {
    return new Product(
      obj.productId || obj.id,
      obj.productName || obj.name,
      obj.brand,
      mall,
      obj.productUrl || obj.url,
      obj.thumbnail,
      {
        original: obj.originalPrice,
        sale: obj.salePrice,
      },
      obj
    );
  }
}

/**
 * 가격 정보 Value Object
 */
export interface ProductPrice {
  original: number | null; // 원가 (할인 전 가격)
  sale: number; // 판매가 (현재 가격)
}

/**
 * 상품 메타데이터 (쇼핑몰별 추가 정보)
 */
export interface ProductMetadata {
  // 올리브영
  goodsNo?: string;

  // 지그재그
  hasCoupon?: boolean;
  rating?: number;
  reviewCount?: number;

  // 무신사
  discountRate?: string;
  isExclusive?: boolean;

  // 컬리
  deliveryType?: string;
  isKurlyOnly?: boolean;
  description?: string;

  // 에이블리
  badges?: string[];
  purchaseCount?: string;
  isSoldout?: boolean;

  // 화해
  productId?: string;
  isDiscontinued?: boolean;

  // 공통
  [key: string]: any;
}

/**
 * 직렬화를 위한 일반 객체 타입
 */
export interface ProductPlainObject {
  productId: string;
  productName: string;
  brand: string;
  productUrl: string;
  thumbnail: string | null;
  originalPrice: number | null;
  salePrice: number;
  discountRate?: number;
  [key: string]: any;
}


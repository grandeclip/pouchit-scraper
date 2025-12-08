/**
 * 플랫폼 독립 상품 인터페이스
 * 모든 Platform Product는 이 인터페이스를 구현
 *
 * SOLID 원칙:
 * - ISP: 플랫폼별 공통 필드만 정의
 * - DIP: Scanner가 구체 타입이 아닌 이 인터페이스에 의존
 */

/**
 * 판매 상태 (공통)
 */
export type SaleStatus = "on_sale" | "sold_out" | "off_sale";

/**
 * 상품 인터페이스 (플랫폼 독립)
 */
export interface IProduct {
  /** 상품 ID (플랫폼별 형식 다를 수 있음) */
  readonly id: string;

  /** 상품명 */
  readonly productName: string;

  /** 썸네일 이미지 URL */
  readonly thumbnail: string;

  /** 정가 */
  readonly originalPrice: number;

  /** 판매가 */
  readonly discountedPrice: number;

  /** 판매 상태 */
  readonly saleStatus: SaleStatus;

  /**
   * 할인율 계산
   */
  getDiscountRate(): number;

  /**
   * 일반 객체로 변환 (직렬화)
   */
  toPlainObject(): Record<string, any>;
}

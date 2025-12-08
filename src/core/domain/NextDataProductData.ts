/**
 * Next.js __NEXT_DATA__ 추출 데이터 타입
 * Domain Layer - 인프라에 독립적인 데이터 구조
 *
 * SOLID 원칙:
 * - SRP: __NEXT_DATA__ 추출 결과만 표현
 * - OCP: 새로운 플랫폼 추가 시 확장 가능
 */

/**
 * __NEXT_DATA__ 추출 결과
 * ZigZag 플랫폼 SSR 데이터 구조
 */
export interface NextDataProductData {
  id: string;
  name: string;
  brand: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  salesStatus: string;
  isPurchasable: boolean;
  displayStatus: string;
  _source: string;
}

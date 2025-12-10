/**
 * Products Repository Interface
 *
 * products 테이블에서 상품 정보를 조회하는 Repository 추상화
 * (product_sets 테이블과 별개의 products 테이블)
 *
 * SOLID 원칙:
 * - ISP: products 테이블 조회만 담당
 * - DIP: 추상화에 의존
 */

/**
 * Product 엔티티 (products 테이블)
 */
export interface ProductEntity {
  /** 상품 ID (PK) */
  product_id: string;

  /** 상품명 */
  name: string;

  /** 브랜드 ID (FK to brands) */
  brand_id: string;
}

/**
 * Products Repository Interface
 */
export interface IProductsRepository {
  /**
   * 전체 상품 조회 (pagination 지원)
   *
   * @returns 전체 상품 목록
   */
  findAll(): Promise<ProductEntity[]>;

  /**
   * 상품 ID로 단일 상품 조회
   *
   * @param productId 상품 ID
   * @returns 상품 정보 또는 null
   */
  findById(productId: string): Promise<ProductEntity | null>;

  /**
   * 전체 상품 수 조회
   *
   * @returns 전체 상품 수
   */
  count(): Promise<number>;
}

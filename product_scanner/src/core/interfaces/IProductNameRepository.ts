/**
 * Product Name Repository Interface
 *
 * products 테이블에서 상품명(name)을 조회하기 위한 Repository 추상화
 *
 * SOLID 원칙:
 * - SRP: products.name 조회만 담당
 * - ISP: 필요한 메서드만 정의
 * - DIP: 구체 구현이 아닌 인터페이스에 의존
 */

/**
 * Product Name Repository Interface
 */
export interface IProductNameRepository {
  /**
   * 여러 product_id에 대한 name 조회
   *
   * @param productIds product_id 배열
   * @returns product_id → name 매핑
   */
  getNamesByIds(productIds: string[]): Promise<Map<string, string>>;

  /**
   * 단일 product_id에 대한 name 조회
   *
   * @param productId product_id
   * @returns name 또는 null
   */
  getNameById(productId: string): Promise<string | null>;
}

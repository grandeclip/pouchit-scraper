/**
 * Brand Repository Interface
 *
 * brands 테이블에서 브랜드 정보를 조회하는 Repository 추상화
 *
 * SOLID 원칙:
 * - ISP: 브랜드 조회만 담당
 * - DIP: 추상화에 의존
 */

/**
 * 브랜드 엔티티
 */
export interface BrandEntity {
  /** 브랜드 ID (PK) */
  brand_id: string;

  /** 브랜드명 */
  name: string;
}

/**
 * Brand Repository Interface
 */
export interface IBrandRepository {
  /**
   * 브랜드 ID로 브랜드명 조회
   *
   * @param brandId 브랜드 ID
   * @returns 브랜드명 또는 null
   */
  getNameById(brandId: string): Promise<string | null>;

  /**
   * 여러 브랜드 ID에 대한 브랜드명 일괄 조회
   *
   * @param brandIds 브랜드 ID 배열
   * @returns brand_id → name 매핑
   */
  getNamesByIds(brandIds: string[]): Promise<Map<string, string>>;
}

/**
 * Product Update Repository Interface
 *
 * Supabase product_sets 테이블 업데이트를 위한 Repository 추상화
 */

/**
 * 상품 업데이트 데이터 구조
 */
export interface ProductUpdateData {
  /** 상품 세트 ID (PK) */
  product_set_id: string;

  /** 상품명 */
  product_name?: string | null;

  /** 썸네일 이미지 URL */
  thumbnail?: string | null;

  /** 정가 */
  original_price?: number | null;

  /** 할인가 */
  discounted_price?: number | null;

  /** 판매 상태 (현재는 업데이트 제외) */
  sale_status?: string | null;

  /** 업데이트 타임스탬프 (ISO 8601 with timezone) */
  updated_at: string;

  /**
   * LLM Product Set Parsing - 메인 상품명
   * 메인 상품만 포함 (타입 + 용량)
   * 예: "세럼 50ml"
   */
  set_name?: string | null;

  /**
   * LLM Product Set Parsing - 간소화된 항목명
   * 모든 항목 포함 (타입 + 용량)
   * 예: "세럼 50ml + 크림 10g"
   */
  sanitized_item_name?: string | null;

  /**
   * LLM Product Set Parsing - 구조화된 항목명
   * 모든 항목 포함 (full_name + 용량)
   * 예: "다이브인 세럼 50ml + 시카 크림 10g"
   */
  structured_item_name?: string | null;
}

/**
 * 배치 업데이트 결과
 */
export interface BatchUpdateResult {
  /** 성공적으로 업데이트된 개수 */
  updated_count: number;

  /** 스킵된 개수 (변경 없음) */
  skipped_count: number;

  /** 실패한 개수 */
  failed_count: number;

  /** 성공적으로 업데이트된 product_set_id 목록 */
  updated_ids: string[];

  /** 실패한 항목들의 에러 정보 */
  errors: Array<{
    product_set_id: string;
    error: string;
  }>;
}

/**
 * Product Update Repository Interface
 *
 * 상품 정보 업데이트를 담당하는 Repository 인터페이스
 * - Strategy Pattern: UpdateProductSetNode에서 의존성 주입
 * - Repository Pattern: 데이터 액세스 로직 캡슐화
 */
export interface IProductUpdateRepository {
  /**
   * 단일 상품 업데이트
   *
   * @param data 업데이트할 상품 데이터
   * @returns 성공 여부
   */
  update(data: ProductUpdateData): Promise<boolean>;

  /**
   * 배치 업데이트
   *
   * 여러 상품을 일괄 업데이트합니다.
   * Supabase는 bulk update를 지원하지 않으므로 순차 처리됩니다.
   *
   * @param updates 업데이트할 상품 데이터 배열
   * @returns 배치 업데이트 결과 (성공/실패/스킵 카운트)
   */
  batchUpdate(updates: ProductUpdateData[]): Promise<BatchUpdateResult>;
}

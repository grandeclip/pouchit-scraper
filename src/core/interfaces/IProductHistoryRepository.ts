/**
 * Product History Repository Interface
 *
 * 히스토리 테이블 관리:
 * 1. history_product_review: 모든 처리 이력 감사 추적 (INSERT)
 * 2. product_price_histories: 일별 가격 변동 추적 (UPSERT)
 *
 * SOLID 원칙:
 * - SRP: 히스토리 기록만 담당
 * - DIP: 구현체가 인터페이스에 의존
 * - ISP: 클라이언트별 인터페이스 분리
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 */

/**
 * 리뷰 히스토리 데이터
 * history_product_review 테이블용
 */
export interface ReviewHistoryData {
  /** 제품 세트 ID */
  product_set_id: string;

  /** 제품 링크 URL */
  link_url: string;

  /** 처리 상태 */
  status: "verified" | "only_price" | "all" | "confused";

  /** 변경 사항 설명 (선택) */
  comment?: string;

  /** 처리 전 제품 정보 (DB 데이터) */
  before_products: Record<string, unknown>;

  /** 처리 후 제품 정보 (AI/크롤링 데이터) */
  after_products: Record<string, unknown>;
}

/**
 * 가격 히스토리 데이터
 * product_price_histories 테이블용
 */
export interface PriceHistoryData {
  /** 제품 세트 ID */
  product_set_id: string;

  /** 원가 */
  original_price: number;

  /** 할인가 (없으면 original_price와 동일) */
  discount_price: number;
}

/**
 * Product History Repository Interface
 *
 * 안전장치 패턴:
 * - 모든 메서드는 실패해도 예외를 발생시키지 않음
 * - boolean 반환으로 성공/실패 표시
 * - 메인 비즈니스 로직은 히스토리 기록 실패와 무관하게 계속 진행
 */
export interface IProductHistoryRepository {
  /**
   * 리뷰 히스토리 기록 (history_product_review)
   *
   * 동작:
   * - 항상 INSERT (새 레코드 생성)
   * - 모든 처리 이력을 완전히 보존
   *
   * 안전장치:
   * - 실패해도 예외 미발생
   * - 성공: true, 실패: false 반환
   *
   * @param data 리뷰 히스토리 데이터
   * @returns 성공 여부 (true: 성공, false: 실패)
   */
  recordReviewHistory(data: ReviewHistoryData): Promise<boolean>;

  /**
   * 가격 히스토리 기록 (product_price_histories)
   *
   * 동작:
   * - UPSERT (같은 날짜 있으면 UPDATE, 없으면 INSERT)
   * - 하루에 하나의 가격만 유지 (최신 가격으로 덮어쓰기)
   * - Unique 제약: (product_set_id, base_dt)
   *
   * 안전장치:
   * - 실패해도 예외 미발생
   * - 성공: true, 실패: false 반환
   *
   * @param data 가격 히스토리 데이터
   * @returns 성공 여부 (true: 성공, false: 실패)
   */
  recordPriceHistory(data: PriceHistoryData): Promise<boolean>;
}

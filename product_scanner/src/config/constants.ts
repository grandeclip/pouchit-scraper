/**
 * 애플리케이션 설정 상수
 *
 * 환경변수 기반 설정 관리
 * - 환경변수가 없으면 기본값 사용
 * - 타입 안전성 보장
 */

/**
 * 데이터베이스 설정
 */
export const DATABASE_CONFIG = {
  /**
   * Product Sets 테이블명
   * 환경변수: PRODUCT_TABLE_NAME
   * 기본값: "product_sets"
   */
  PRODUCT_TABLE_NAME: process.env.PRODUCT_TABLE_NAME || "product_sets",
} as const;

/**
 * API 설정
 */
export const API_CONFIG = {
  /**
   * 검색 결과 최대 개수
   * 환경변수: MAX_SEARCH_LIMIT
   * 기본값: 100
   */
  MAX_SEARCH_LIMIT: Number(process.env.MAX_SEARCH_LIMIT) || 100,

  /**
   * 검색 결과 기본 개수
   * 환경변수: DEFAULT_SEARCH_LIMIT
   * 기본값: 3
   */
  DEFAULT_SEARCH_LIMIT: Number(process.env.DEFAULT_SEARCH_LIMIT) || 3,
} as const;

/**
 * Repository 설정
 */
export const REPOSITORY_CONFIG = {
  /**
   * 기본 SELECT 필드 목록
   */
  DEFAULT_PRODUCT_FIELDS: [
    "product_set_id",
    "product_id",
    "product_name",
    "link_url",
    "thumbnail",
    "sale_status",
    "original_price",
    "discounted_price",
  ] as const,
} as const;

/**
 * 로깅 서비스 이름
 * 서비스별 로그 파일 라우팅에 사용
 */
export const SERVICE_NAMES = {
  /**
   * Express 서버
   * 로그 파일: logs/server-YYYYMMDD.log
   */
  SERVER: "server",

  /**
   * Workflow Worker
   * 로그 파일: logs/worker-YYYYMMDD.log
   */
  WORKER: "worker",

  /**
   * Redis Repository
   * 로그 파일: logs/worker-YYYYMMDD.log (worker와 통합)
   */
  REDIS_REPOSITORY: "redis-repository",
} as const;

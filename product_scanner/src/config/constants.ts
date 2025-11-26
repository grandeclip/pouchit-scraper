/**
 * 애플리케이션 설정 상수
 *
 * 환경변수 기반 설정 관리
 * - 환경변수가 없으면 기본값 사용
 * - 타입 안전성 보장
 */

/**
 * 애플리케이션 메타데이터
 *
 * ⚠️ VERSION 동기화 전략:
 * - package.json의 version 필드와 수동 동기화 필요
 * - 배포 전 반드시 확인: package.json v1.0.0 === constants.ts v1.0.0
 * - CI/CD 파이프라인에서 자동 검증 권장
 *
 * 이유:
 * - package.json은 src/ 밖에 있어 @/ 절대경로로 import 불가
 * - tsconfig의 resolveJsonModule은 상대경로 필요 (일관성 위반)
 * - 상수화로 타입 안전성 및 런타임 성능 향상
 */
export const APP_METADATA = {
  /**
   * 애플리케이션 버전
   * ⚠️ package.json의 "version": "1.0.0"과 동기화 필수
   */
  VERSION: "1.0.0",

  /**
   * 애플리케이션 이름
   */
  NAME: "Product Scanner",

  /**
   * 아키텍처 버전
   */
  ARCHITECTURE: "API v1 with Platform Routing",
} as const;

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
   * 검색 결과 최대 개수 (API 엔드포인트용)
   * 환경변수: MAX_SEARCH_LIMIT
   * 기본값: 100
   */
  MAX_SEARCH_LIMIT: Number(process.env.MAX_SEARCH_LIMIT) || 100,

  /**
   * 검색 결과 기본 개수 (API 엔드포인트용)
   * 환경변수: DEFAULT_SEARCH_LIMIT
   * 기본값: 3
   */
  DEFAULT_SEARCH_LIMIT: Number(process.env.DEFAULT_SEARCH_LIMIT) || 3,
} as const;

/**
 * Workflow 기본 설정
 */
export const WORKFLOW_DEFAULT_CONFIG = {
  /**
   * Supabase 검색 기본 limit
   * 환경변수: WORKFLOW_DEFAULT_LIMIT
   * 기본값: 1000
   *
   * 주의:
   * - Supabase PostgREST는 기본적으로 row 수 제한 없음
   * - 실제 제약은 Supabase 프로젝트 설정에 따라 다름 (일반적으로 1000~5000)
   * - 메모리: 1000개 ≈ 1-2MB (상품 데이터 기준)
   * - 더 큰 값 필요 시 환경변수로 오버라이드 가능
   */
  SUPABASE_SEARCH_LIMIT: Number(process.env.WORKFLOW_DEFAULT_LIMIT) || 1000,

  /**
   * Validation 최대 limit (검증 로직용)
   * 환경변수: WORKFLOW_MAX_LIMIT
   * 기본값: 10000
   */
  MAX_SEARCH_LIMIT: Number(process.env.WORKFLOW_MAX_LIMIT) || 10000,
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

/**
 * 파일 경로 설정
 */
export const PATH_CONFIG = {
  /**
   * 플랫폼 설정 디렉토리
   * ConfigLoader가 YAML 파일을 읽는 기준 경로
   */
  PLATFORMS_DIR: "platforms",
} as const;

/**
 * Workflow 설정
 * Multi-Platform Worker용 설정
 */
export const WORKFLOW_CONFIG = {
  /**
   * 지원 Platform 목록
   * 환경변수: WORKFLOW_PLATFORMS (쉼표로 구분)
   * 기본값: default(하위 호환) + 8개 쇼핑몰 플랫폼
   */
  PLATFORMS: (
    process.env.WORKFLOW_PLATFORMS ||
    "default,hwahae,oliveyoung,zigzag,musinsa,ably,kurly,single_product,url_extraction,multi_platform"
  )
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0),

  /**
   * Worker 폴링 간격 (ms)
   * 환경변수: WORKER_POLL_INTERVAL
   * 기본값: 5000ms (5초)
   */
  POLL_INTERVAL_MS: parseInt(process.env.WORKER_POLL_INTERVAL || "5000", 10),

  /**
   * Workflow 예약 파라미터 (template variable 용도)
   * 노드 Config 병합 시 제외됨
   */
  RESERVED_PARAMS: ["platform", "workflow_id"] as const,
} as const;

/**
 * 결과 출력 설정
 */
export const OUTPUT_CONFIG = {
  /**
   * 결과 파일 저장 디렉토리
   * 환경변수: RESULT_OUTPUT_DIR
   * 기본값: ./results (로컬) 또는 /app/results (Docker)
   */
  RESULT_DIR: process.env.RESULT_OUTPUT_DIR || "./results",

  /**
   * 스크린샷 저장 디렉토리
   * 환경변수: SCREENSHOT_OUTPUT_DIR
   * 기본값: RESULT_DIR과 동일 (하위 날짜/플랫폼 폴더에 저장)
   */
  SCREENSHOT_DIR:
    process.env.SCREENSHOT_OUTPUT_DIR ||
    process.env.RESULT_OUTPUT_DIR ||
    "./results",
} as const;

/**
 * Scraper 설정
 * Browser/API 스크래핑 공통 설정
 */
export const SCRAPER_CONFIG = {
  /**
   * 브라우저 기본 viewport
   */
  DEFAULT_VIEWPORT: {
    width: 1920,
    height: 1080,
  },

  /**
   * 네비게이션 타임아웃 (ms)
   */
  NAVIGATION_TIMEOUT_MS: 30000,

  /**
   * Selector 대기 타임아웃 (ms)
   */
  SELECTOR_TIMEOUT_MS: 5000,

  /**
   * Rate limit 기본 delay (ms)
   * 초당 0.5회 요청 (2000ms 간격)
   * 플랫폼별 요구사항에 따라 YAML에서 오버라이드 가능
   */
  RATE_LIMIT_DELAY_MS: 2000,

  /**
   * 기본 User Agent (환경변수로 오버라이드 가능)
   */
  DEFAULT_USER_AGENT:
    process.env.USER_AGENT ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

  /**
   * 기본 대기 시간 (ms)
   */
  DEFAULT_WAIT_TIME_MS: 1000,

  /**
   * 페이지 렌더링 대기 시간 (ms)
   * 동적 콘텐츠 로딩 대기용
   */
  PAGE_RENDER_DELAY_MS: 3000,

  /**
   * 스크린샷 저장 디렉토리
   * 환경변수: SCREENSHOT_DIR
   * 기본값: /app/results/screenshots (Docker 환경)
   */
  SCREENSHOT_DIR: process.env.SCREENSHOT_DIR || "/app/results/screenshots",
} as const;

/**
 * Zigzag 플랫폼 상수
 * Zigzag 특화 비즈니스 로직용
 */
export const ZIGZAG_CONSTANTS = {
  /**
   * 첫구매 배지 키워드 목록
   * 첫구매 제외 가격 계산 시 badge.text와 비교
   *
   * 사용처:
   * - ZigzagGraphQLScanner: discountedPrice 조건부 계산
   * - final_price_additional.badge.text에서 검사
   *
   * 확장 가능성:
   * - "첫 구매", "신규 구매" 등 변형 추가 가능
   */
  FIRST_PURCHASE_BADGE_KEYWORDS: ["첫구매", "첫 구매"] as const,
} as const;

/**
 * Product Update 설정
 * Supabase product_sets 업데이트 시 Rate Limiting 및 검증 설정
 */
export const UPDATE_CONFIG = {
  /**
   * 업데이트 간 지연 시간 (ms)
   * 환경변수: UPDATE_DELAY_MS
   * 기본값: 100ms
   *
   * 목적:
   * - Supabase API Rate Limiting 방지
   * - 부드러운 업데이트 처리 (gentle requests)
   * - DB 부하 분산
   *
   * 조정 가이드:
   * - 50ms: 빠른 처리 (초당 20개)
   * - 100ms: 기본값 (초당 10개) ✅
   * - 200ms: 안전한 처리 (초당 5개)
   * - 500ms: 매우 안전 (초당 2개)
   */
  DEFAULT_DELAY_MS: parseInt(process.env.UPDATE_DELAY_MS || "100", 10),

  /**
   * 최대 지연 시간 (ms)
   * 환경변수 값 검증용
   * 기본값: 5000ms (5초)
   */
  MAX_DELAY_MS: 5000,

  /**
   * 업데이트 검증 샘플 크기
   * 환경변수: VERIFICATION_SAMPLE_SIZE
   * 기본값: 10개
   *
   * 목적:
   * - 업데이트 성공 여부 검증 (Supabase SELECT)
   * - 성능과 신뢰성 균형
   *
   * 조정 가이드:
   * - 5개: 최소 검증 (빠름)
   * - 10개: 기본값 (균형) ✅
   * - 20개: 더 확실한 검증 (느림)
   * - 0: 검증 비활성화 (권장 안함)
   */
  VERIFICATION_SAMPLE_SIZE: parseInt(
    process.env.VERIFICATION_SAMPLE_SIZE || "10",
    10,
  ),
} as const;

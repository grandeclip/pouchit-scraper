/**
 * Extract Service 결과 타입 정의
 */

/**
 * 추출된 상품 데이터
 */
export interface ExtractedProduct {
  /** 플랫폼 식별자 */
  platform: string;
  /** 플랫폼 내 상품 ID */
  productId: string;
  /** 상품 URL */
  url: string;
  /** 상품명 */
  productName: string;
  /** 썸네일 URL */
  thumbnail: string | null;
  /** 원가 */
  originalPrice: number;
  /** 할인가 */
  discountedPrice: number;
  /** 판매 상태 */
  saleStatus: string;
  /** 추출 시각 (ISO 8601) */
  extractedAt: string;
  /** 플랫폼별 추가 데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * 추출 결과
 */
export interface ExtractResult {
  /** 성공 여부 */
  success: boolean;
  /** 추출된 상품 데이터 */
  product: ExtractedProduct | null;
  /** 추출 소요 시간 (ms) */
  durationMs: number;
  /** 에러 정보 (실패 시) */
  error?: ExtractError;
}

/**
 * 추출 에러
 */
export interface ExtractError {
  /** 에러 코드 */
  code: ExtractErrorCode;
  /** 에러 메시지 */
  message: string;
  /** 상세 정보 */
  details?: Record<string, unknown>;
}

/**
 * 에러 코드
 */
export type ExtractErrorCode =
  | "PRODUCT_SET_NOT_FOUND" // product_set_id로 조회 실패
  | "LINK_URL_MISSING" // link_url이 없음
  | "PLATFORM_NOT_DETECTED" // URL에서 플랫폼 감지 실패
  | "PLATFORM_NOT_SUPPORTED" // 지원하지 않는 플랫폼
  | "PRODUCT_NOT_FOUND" // 상품 페이지 없음
  | "EXTRACTION_FAILED" // 추출 실패
  | "SCANNER_ERROR" // Scanner 오류
  | "UNKNOWN_ERROR"; // 알 수 없는 오류


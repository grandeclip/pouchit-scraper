/**
 * Extract Service 파라미터 타입 정의
 *
 * 3가지 추출 모드 지원:
 * - by-product-set: Supabase product_set_id로 link_url 조회 후 추출
 * - by-url: URL 직접 제공, 플랫폼 자동 감지 후 추출
 * - by-id: 플랫폼 + 상품ID 직접 제공 후 추출
 */

/**
 * Extract 서비스 타입
 */
export type ExtractServiceType = "by-product-set" | "by-url" | "by-id";

/**
 * 모드 1: product_set_id 기반 추출
 * Supabase에서 link_url 조회 후 추출
 */
export interface ExtractByProductSetParams {
  mode: "by-product-set";
  productSetId: string; // UUID
}

/**
 * 모드 2: URL 직접 제공
 * 플랫폼 자동 감지 후 추출
 */
export interface ExtractByUrlParams {
  mode: "by-url";
  url: string;
}

/**
 * 모드 3: 플랫폼 + 상품ID 직접 제공
 */
export interface ExtractByIdParams {
  mode: "by-id";
  platform: string;
  productId: string;
}

/**
 * Extract 파라미터 Union Type
 */
export type ExtractParams =
  | ExtractByProductSetParams
  | ExtractByUrlParams
  | ExtractByIdParams;


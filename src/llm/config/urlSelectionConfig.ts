/**
 * URL Selection Configuration
 *
 * LLM 상품 설명 생성 시 사용할 URL 선택 설정
 * - 플랫폼 우선순위
 * - 선택 개수 제한
 *
 * @note 새 플랫폼 추가 시 이 파일만 수정
 */

/**
 * 플랫폼별 URL 도메인 패턴
 */
export const PLATFORM_DOMAINS: Record<string, string[]> = {
  oliveyoung: ["oliveyoung.co.kr"],
  musinsa: ["musinsa.com"],
  ably: ["a-bly.com"],
  zigzag: ["zigzag.kr"],
  hwahae: ["hwahae.co.kr"],
  kurly: ["kurly.com"],
};

/**
 * 플랫폼 우선순위 (인덱스가 낮을수록 높은 우선순위)
 */
export const PLATFORM_PRIORITY: string[] = [
  "oliveyoung",
  "musinsa",
  "ably",
  "zigzag",
  "hwahae",
  "kurly",
];

/**
 * URL 선택 제한 설정
 */
export const URL_SELECTION_LIMITS = {
  /** 총 선택 URL 최소 개수 */
  minTotal: 1,
  /** 총 선택 URL 최대 개수 */
  maxTotal: 3,
  /** 플랫폼당 최대 URL 개수 */
  maxPerPlatform: 2,
} as const;

export type UrlSelectionLimits = typeof URL_SELECTION_LIMITS;

/**
 * Platform ID 상수 및 타입
 * 플랫폼별 ID를 타입 안전하게 관리
 *
 * SOLID 원칙:
 * - OCP: 새로운 플랫폼 추가 시 확장 가능
 * - DIP: 문자열 리터럴 대신 타입 안전한 상수 사용
 */

/**
 * 지원하는 플랫폼 ID 상수
 */
export const PLATFORM_IDS = {
  HWAHAE: "hwahae",
  OLIVEYOUNG: "oliveyoung",
  MUSINSA: "musinsa",
  ZIGZAG: "zigzag",
  ABLY: "ably",
  KURLY: "kurly",
} as const;

/**
 * Platform ID 타입 (Union Type)
 */
export type PlatformId = (typeof PLATFORM_IDS)[keyof typeof PLATFORM_IDS];

/**
 * Platform ID 검증
 */
export function isValidPlatformId(value: string): value is PlatformId {
  return Object.values(PLATFORM_IDS).includes(value as PlatformId);
}

/**
 * Platform ID 목록 반환
 */
export function getAllPlatformIds(): PlatformId[] {
  return Object.values(PLATFORM_IDS);
}

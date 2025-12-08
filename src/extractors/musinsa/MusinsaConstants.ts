/**
 * MusinsaConstants
 *
 * 목적: 무신사 플랫폼 고유 상수 정의
 * 패턴: Constants Pattern
 * 참고: 플랫폼별 고정 값 중앙 관리
 */

/**
 * 무신사 CDN 이미지 Base URL
 *
 * API가 상대 경로를 반환하므로 prefix 필요
 * 예: "/thumbnails/test.jpg" → "https://image.msscdn.net/thumbnails/test.jpg"
 */
export const MUSINSA_IMAGE_CDN_BASE_URL = "https://image.msscdn.net";

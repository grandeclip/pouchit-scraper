/**
 * IPlatformScanner Interface
 *
 * Phase 4 ScanProductNode 리팩토링: 플랫폼별 스캐너 추상화
 *
 * SOLID 원칙:
 * - ISP: 플랫폼 스캐너에 필요한 최소 인터페이스만 정의
 * - DIP: ScanProductNode가 구체 클래스가 아닌 인터페이스에 의존
 * - OCP: 새로운 플랫폼은 이 인터페이스 구현으로 확장
 */

import type { Page } from "playwright";

/**
 * 플랫폼 스캔 결과
 *
 * ScanProductNode와 ValidateProductNode에서 사용하는 공통 결과 타입
 */
export interface PlatformScanResult {
  /** 스캔 성공 여부 */
  success: boolean;

  /** 상품 데이터 (성공 시) */
  data?: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  };

  /** 에러 메시지 (실패 시) */
  error?: string;

  /** 데이터 소스 (network_api, extractor, dom 등) */
  source?: string;

  /** NOT_FOUND 여부 (상품 삭제/판매중지) */
  isNotFound?: boolean;
}

/**
 * 플랫폼 스캐너 인터페이스
 *
 * 각 플랫폼별 스캐너가 구현해야 하는 인터페이스
 * Strategy Pattern + Template Method Pattern 조합
 */
export interface IPlatformScanner {
  /** 플랫폼 식별자 (ably, oliveyoung, kurly 등) */
  readonly platform: string;

  /** 스캔 방식 (browser: Playwright, api: HTTP/GraphQL) */
  readonly scanMethod: "browser" | "api";

  /**
   * URL에서 상품 ID 추출
   *
   * @param url 상품 URL
   * @returns 상품 ID 또는 null
   */
  extractProductId(url: string): string | null;

  /**
   * 상품 스캔 실행
   *
   * @param url 상품 URL
   * @param page Playwright Page (browser 방식에서만 사용)
   * @returns 스캔 결과
   */
  scan(url: string, page?: Page): Promise<PlatformScanResult>;

  /**
   * NOT_FOUND 상태 판별 (optional)
   *
   * 플랫폼별로 "상품 없음" 판별 로직이 다름
   * - Ably: 리다이렉트 감지
   * - Oliveyoung: "삭제된 상품" 텍스트
   * - Kurly: 특정 메시지 또는 빈 데이터
   *
   * @param result 스캔 결과
   * @param page Playwright Page (리다이렉트 URL 확인용)
   * @returns NOT_FOUND 여부
   */
  isNotFound?(result: PlatformScanResult, page?: Page): boolean;
}

/**
 * 플랫폼 스캐너 팩토리 함수 타입
 */
export type PlatformScannerFactory = () => IPlatformScanner;

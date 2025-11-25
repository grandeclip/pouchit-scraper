/**
 * Browser Controller Interface
 *
 * 브라우저 생명주기 및 네비게이션 관리 인터페이스
 *
 * SOLID 원칙:
 * - SRP: 브라우저 제어만 담당
 * - ISP: 최소 인터페이스 (브라우저 작업에 필요한 것만)
 * - DIP: 상위 모듈은 이 인터페이스에 의존
 */

import type { Browser, BrowserContext, Page } from "playwright";
import { PlaywrightStrategyConfig } from "@/core/domain/StrategyConfig";

/**
 * 브라우저 초기화 옵션
 */
export interface BrowserInitOptions {
  /** Playwright 전략 설정 */
  strategy: PlaywrightStrategyConfig;
  /** 외부 Browser 인스턴스 (Pool 사용 시) */
  externalBrowser?: Browser;
}

/**
 * 스크린샷 옵션
 */
export interface ScreenshotOptions {
  /** 스크린샷 활성화 여부 */
  enabled: boolean;
  /** 스크린샷 저장 경로 (디렉토리) */
  outputDir: string;
  /** Platform ID */
  platformId: string;
  /** Job ID (파일명에 사용) */
  jobId?: string;
}

/**
 * 네비게이션 결과
 */
export interface NavigationResult {
  /** 성공 여부 */
  success: boolean;
  /** 최종 URL */
  finalUrl: string;
  /** 페이지 타이틀 */
  pageTitle: string;
}

/**
 * 에러 페이지 타입
 */
export type ErrorPageType =
  | "not_found"
  | "server_error"
  | "rate_limited"
  | "none";

/**
 * 에러 페이지 감지 결과
 */
export interface ErrorPageDetectionResult {
  /** 에러 여부 */
  isError: boolean;
  /** 에러 타입 */
  errorType: ErrorPageType;
  /** 에러 메시지 */
  message?: string;
}

/**
 * Browser Controller Interface
 */
export interface IBrowserController {
  /**
   * 브라우저 초기화
   * @param options 초기화 옵션
   */
  initialize(options: BrowserInitOptions): Promise<void>;

  /**
   * 네비게이션 스텝 실행
   * @param id 상품 ID (플레이스홀더 치환용)
   * @returns 네비게이션 결과
   */
  executeNavigation(id: string): Promise<NavigationResult>;

  /**
   * 에러 페이지 감지
   * @param id 상품 ID (에러 메시지용)
   * @returns 에러 감지 결과
   */
  detectErrorPage(id: string): Promise<ErrorPageDetectionResult>;

  /**
   * Network Intercept 설정
   * @param id 상품 ID
   */
  setupNetworkIntercept(id: string): Promise<void>;

  /**
   * Intercept된 API 데이터 반환
   */
  getInterceptedData(): unknown | null;

  /**
   * 스크린샷 촬영
   * @param id 상품 ID
   * @param options 스크린샷 옵션
   * @param isError 에러 상태 여부
   */
  takeScreenshot(
    id: string,
    options: ScreenshotOptions,
    isError?: boolean,
  ): Promise<void>;

  /**
   * 현재 Page 인스턴스 반환
   */
  getPage(): Page | null;

  /**
   * 현재 Context 인스턴스 반환
   */
  getContext(): BrowserContext | null;

  /**
   * 현재 Browser 인스턴스 반환
   */
  getBrowser(): Browser | null;

  /**
   * 리소스 정리
   */
  cleanup(): Promise<void>;

  /**
   * 초기화 상태 확인
   */
  isInitialized(): boolean;
}

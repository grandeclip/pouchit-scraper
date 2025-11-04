/**
 * Browser Pool 인터페이스
 *
 * SOLID 원칙:
 * - ISP: Browser Pool 전용 인터페이스 분리
 * - DIP: 구현체가 아닌 추상화에 의존
 */

import type { Browser, BrowserContext } from "playwright";

/**
 * Browser Pool 인터페이스
 */
export interface IBrowserPool {
  /**
   * Pool 초기화 (브라우저 인스턴스 미리 생성)
   */
  initialize(): Promise<void>;

  /**
   * Browser 인스턴스 획득
   * @returns Browser 인스턴스
   * @throws {Error} Pool이 초기화되지 않았거나 사용 가능한 Browser 없음
   */
  acquireBrowser(): Promise<Browser>;

  /**
   * Browser 인스턴스 반환
   * @param browser 반환할 Browser 인스턴스
   */
  releaseBrowser(browser: Browser): Promise<void>;

  /**
   * Browser Context 생성 (Pool 관리 대상 아님)
   * @param browser Browser 인스턴스
   * @param options Context 옵션
   */
  createContext(
    browser: Browser,
    options?: Record<string, unknown>,
  ): Promise<BrowserContext>;

  /**
   * 모든 Browser 정리
   */
  cleanup(): Promise<void>;

  /**
   * Pool 상태
   */
  getStatus(): {
    poolSize: number;
    available: number;
    inUse: number;
  };
}

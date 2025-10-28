/**
 * 페이지 네비게이터 인터페이스
 * 브라우저 페이지 이동 및 대기 로직을 담당
 * 
 * SOLID 원칙:
 * - SRP: 페이지 네비게이션만 담당
 * - ISP: 네비게이션 관련 메서드만 정의
 */

import type { Page } from 'playwright';
import { NavigationConfig } from '../domain/NavigationStep';

/**
 * 페이지 네비게이터 인터페이스
 */
export interface IPageNavigator {
  /**
   * 네비게이션 실행
   * @param page Playwright Page 객체
   * @param config 네비게이션 설정
   * @param context 변수 치환을 위한 컨텍스트
   */
  navigate(
    page: Page,
    config: NavigationConfig,
    context: Record<string, any>
  ): Promise<void>;
}


/**
 * 네비게이션 액션 정의
 * Command Pattern을 위한 액션 타입 정의
 */

import type { Page } from 'playwright';

/**
 * 네비게이션 액션 타입
 */
export type NavigationActionType =
  | 'goto'
  | 'wait'
  | 'waitForSelector'
  | 'waitForLoadState'
  | 'scroll'
  | 'click'
  | 'fill'
  | 'press'
  | 'checkNoResults'      // 검색 결과 없음 체크
  | 'waitForEither'       // 둘 중 하나 대기 (Race Condition)
  | 'clickAndExtractUrl'; // 상품 클릭하여 URL 추출 (Ably용)

/**
 * 네비게이션 단계 설정
 */
export interface NavigationStepConfig {
  action: NavigationActionType;
  [key: string]: any;
}

/**
 * Goto 액션 설정
 */
export interface GotoActionConfig extends NavigationStepConfig {
  action: 'goto';
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

/**
 * Wait 액션 설정
 */
export interface WaitActionConfig extends NavigationStepConfig {
  action: 'wait';
  duration: number;
}

/**
 * WaitForSelector 액션 설정
 */
export interface WaitForSelectorActionConfig extends NavigationStepConfig {
  action: 'waitForSelector';
  selector: string;
  timeout?: number;
  optional?: boolean;
}

/**
 * WaitForLoadState 액션 설정
 */
export interface WaitForLoadStateActionConfig extends NavigationStepConfig {
  action: 'waitForLoadState';
  state?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
  optional?: boolean;
}

/**
 * Scroll 액션 설정
 */
export interface ScrollActionConfig extends NavigationStepConfig {
  action: 'scroll';
  x?: number;
  y?: number;
  behavior?: 'auto' | 'smooth';
}

/**
 * Click 액션 설정
 */
export interface ClickActionConfig extends NavigationStepConfig {
  action: 'click';
  selector: string;
  timeout?: number;
}

/**
 * Fill 액션 설정
 */
export interface FillActionConfig extends NavigationStepConfig {
  action: 'fill';
  selector: string;
  value: string;
  timeout?: number;
}

/**
 * Press 액션 설정
 */
export interface PressActionConfig extends NavigationStepConfig {
  action: 'press';
  selector: string;
  key: string;
  timeout?: number;
}

/**
 * CheckNoResults 액션 설정
 * 검색 결과 없음을 빠르게 감지
 */
export interface CheckNoResultsActionConfig extends NavigationStepConfig {
  action: 'checkNoResults';
  selectors: string[];           // 결과 없음을 나타내는 셀렉터 목록
  timeout?: number;              // 체크 타임아웃 (기본: 3000ms)
  onMatch?: 'returnEmpty';       // 매칭 시 동작 (빈 배열 반환)
}

/**
 * WaitForEither 액션 설정
 * 성공/실패 시그널 중 먼저 오는 것 처리 (Race Condition)
 */
export interface WaitForEitherActionConfig extends NavigationStepConfig {
  action: 'waitForEither';
  success: string[];             // 성공 시그널 셀렉터
  failure: string[];             // 실패 시그널 셀렉터
  timeout?: number;              // 전체 타임아웃 (기본: 5000ms)
  onFailure?: 'returnEmpty';     // 실패 시그널 매칭 시 동작
}

/**
 * ClickAndExtractUrl 액션 설정
 * 상품을 순차적으로 클릭하여 URL 추출 (SPA 쇼핑몰용)
 */
export interface ClickAndExtractUrlActionConfig extends NavigationStepConfig {
  action: 'clickAndExtractUrl';
  containerSelector: string;     // 상품 컨테이너 선택자 (예: 'main img[src*="GOODS_THUMB"]')
  clickSelector?: string;        // 컨테이너 내에서 클릭할 요소 선택자 (기본: 컨테이너 자체)
  maxProducts?: number;          // 최대 확인할 상품 수 (기본: 2)
  waitAfterClick?: number;       // 클릭 후 대기 시간 (기본: 1000ms)
  waitAfterBack?: number;        // 뒤로가기 후 대기 시간 (기본: 500ms)
  storeIn: string;               // URL을 저장할 context 키 (예: 'productUrls')
}

/**
 * 통합 액션 설정 타입
 */
export type ActionConfig =
  | GotoActionConfig
  | WaitActionConfig
  | WaitForSelectorActionConfig
  | WaitForLoadStateActionConfig
  | ScrollActionConfig
  | ClickActionConfig
  | FillActionConfig
  | PressActionConfig
  | CheckNoResultsActionConfig
  | WaitForEitherActionConfig
  | ClickAndExtractUrlActionConfig;

/**
 * 네비게이션 설정
 */
export interface NavigationConfig {
  steps: ActionConfig[];
}


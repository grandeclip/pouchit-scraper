/**
 * 스캐너 전략 설정
 * Strategy Pattern 구성 타입 정의
 *
 * SOLID 원칙:
 * - OCP: 새로운 전략 타입 추가 시 확장 가능
 * - ISP: 전략별 필요한 설정만 정의
 */

/**
 * 전략 타입
 */
export type StrategyType = "http" | "playwright";

/**
 * 공통 전략 설정
 */
export interface BaseStrategyConfig {
  id: string;
  type: StrategyType;
  priority: number;
  description?: string;
}

/**
 * HTTP 전략 설정
 */
export interface HttpStrategyConfig extends BaseStrategyConfig {
  type: "http";
  http: {
    method: string;
    headers: Record<string, string>;
    timeout: number;
    retryCount: number;
    retryDelay: number;
    requestDelay?: number; // Rate limiting 방지: 각 요청 사이 대기 시간 (ms)
  };
}

/**
 * Playwright 전략 설정
 */
export interface PlaywrightStrategyConfig extends BaseStrategyConfig {
  type: "playwright";
  playwright: {
    headless: boolean;
    timeout: number;
    navigationSteps: NavigationStep[];
    extraction: ExtractionConfig;
  };
}

/**
 * 네비게이션 스텝
 */
export interface NavigationStep {
  action: "navigate" | "wait" | "click" | "type" | "waitForSelector";
  selector?: string;
  value?: string;
  url?: string;
  timeout?: number;
}

/**
 * 추출 설정
 */
export interface ExtractionConfig {
  method: "evaluate" | "selector";
  script?: string;
  selectors?: Record<string, string>;
}

/**
 * 전략 설정 Union Type
 */
export type StrategyConfig = HttpStrategyConfig | PlaywrightStrategyConfig;

/**
 * 전략 타입 가드
 */
export function isHttpStrategy(
  config: StrategyConfig,
): config is HttpStrategyConfig {
  return config.type === "http";
}

export function isPlaywrightStrategy(
  config: StrategyConfig,
): config is PlaywrightStrategyConfig {
  return config.type === "playwright";
}

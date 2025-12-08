/**
 * StrategyConfig Type Guards
 *
 * 역할:
 * - 런타임 타입 안전성 보장
 * - Type casting 제거 (as HttpStrategyConfig → isHttpStrategy)
 *
 * SOLID 원칙:
 * - SRP: 타입 검증만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 */

import type {
  StrategyConfig,
  HttpStrategyConfig,
  GraphQLStrategyConfig,
  PlaywrightStrategyConfig,
} from "./StrategyConfig";

/**
 * HTTP 전략 여부 확인
 *
 * @param strategy - 검증할 전략 설정
 * @returns HTTP 전략이면 true
 *
 * @example
 * if (isHttpStrategy(strategy)) {
 *   // strategy.http 사용 가능 (타입 안전)
 * }
 */
export function isHttpStrategy(
  strategy: StrategyConfig,
): strategy is HttpStrategyConfig {
  return strategy.type === "http";
}

/**
 * GraphQL 전략 여부 확인
 *
 * @param strategy - 검증할 전략 설정
 * @returns GraphQL 전략이면 true
 *
 * @example
 * if (isGraphQLStrategy(strategy)) {
 *   // strategy.graphql 사용 가능 (타입 안전)
 * }
 */
export function isGraphQLStrategy(
  strategy: StrategyConfig,
): strategy is GraphQLStrategyConfig {
  return strategy.type === "graphql";
}

/**
 * Playwright 전략 여부 확인
 *
 * @param strategy - 검증할 전략 설정
 * @returns Playwright 전략이면 true
 *
 * @example
 * if (isPlaywrightStrategy(strategy)) {
 *   // strategy.playwright 사용 가능 (타입 안전)
 * }
 */
export function isPlaywrightStrategy(
  strategy: StrategyConfig,
): strategy is PlaywrightStrategyConfig {
  return strategy.type === "playwright";
}

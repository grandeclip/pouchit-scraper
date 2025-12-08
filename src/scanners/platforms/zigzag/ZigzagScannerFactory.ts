/**
 * ZigZag 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import { ZigzagProduct } from "@/core/domain/ZigzagProduct";
import { ZigzagConfig } from "@/core/domain/ZigzagConfig";
import {
  StrategyConfig,
  GraphQLStrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import {
  isGraphQLStrategy,
  isPlaywrightStrategy,
} from "@/core/domain/StrategyConfig.guards";
import { ZigzagGraphQLScanner } from "@/scanners/ZigzagGraphQLScanner";
import { ZigzagPlaywrightScanner } from "@/scanners/ZigzagPlaywrightScanner";

/**
 * ZigZag 스캐너 팩토리
 */
export class ZigzagScannerFactory {
  constructor(private readonly config: ZigzagConfig) {}

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<ZigzagProduct> {
    if (isGraphQLStrategy(strategy)) {
      return this.createGraphQLScanner(strategy);
    }

    if (isPlaywrightStrategy(strategy)) {
      return this.createBrowserScanner(strategy);
    }

    throw new Error(
      `지원하지 않는 strategy 타입: ${strategy.type}. ZigZag는 GraphQL, Playwright를 지원합니다.`,
    );
  }

  /**
   * GraphQL Scanner 생성
   */
  private createGraphQLScanner(
    strategy: GraphQLStrategyConfig,
  ): IScanner<ZigzagProduct> {
    return new ZigzagGraphQLScanner(this.config, strategy);
  }

  /**
   * Browser Scanner 생성
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<ZigzagProduct> {
    return new ZigzagPlaywrightScanner(this.config, strategy);
  }
}

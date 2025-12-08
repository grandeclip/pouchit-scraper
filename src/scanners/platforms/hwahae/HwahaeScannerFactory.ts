/**
 * 화해 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import {
  HwahaeProduct,
  HwahaeApiResponse,
} from "@/core/domain/HwahaeProduct";
import { HwahaeConfig } from "@/core/domain/HwahaeConfig";
import {
  StrategyConfig,
  HttpStrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import {
  isHttpStrategy,
  isPlaywrightStrategy,
} from "@/core/domain/StrategyConfig.guards";

import { HttpScanner } from "@/scanners/HttpScanner";
import { PlaywrightScanner } from "@/scanners/PlaywrightScanner";

/**
 * 화해 스캐너 팩토리
 */
export class HwahaeScannerFactory {
  constructor(private readonly config: HwahaeConfig) {}

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<HwahaeProduct> {
    if (isHttpStrategy(strategy)) {
      return this.createHttpScanner(strategy);
    }

    if (isPlaywrightStrategy(strategy)) {
      return this.createPlaywrightScanner(strategy);
    }

    throw new Error(
      `Hwahae에서 지원하지 않는 strategy 타입: ${strategy.type}`,
    );
  }

  /**
   * HTTP Scanner 생성
   */
  private createHttpScanner(
    strategy: HttpStrategyConfig,
  ): IScanner<HwahaeProduct> {
    return new HttpScanner(this.config, strategy);
  }

  /**
   * Playwright Scanner 생성
   */
  private createPlaywrightScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<HwahaeProduct> {
    return new PlaywrightScanner(this.config, strategy);
  }
}


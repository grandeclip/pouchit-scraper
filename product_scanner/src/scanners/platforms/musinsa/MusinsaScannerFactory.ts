/**
 * 무신사 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import {
  MusinsaProduct,
  MusinsaDOMResponse,
} from "@/core/domain/MusinsaProduct";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import {
  StrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";

import { BrowserScanner } from "@/scanners/strategies/BrowserScanner";

/**
 * 무신사 스캐너 팩토리
 */
export class MusinsaScannerFactory {
  constructor(private readonly config: PlatformConfig) {}

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<MusinsaProduct> {
    if (isPlaywrightStrategy(strategy)) {
      return this.createBrowserScanner(strategy);
    }

    throw new Error(
      `Musinsa에서 지원하지 않는 strategy 타입: ${strategy.type}`,
    );
  }

  /**
   * Browser Scanner 생성
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<MusinsaProduct> {
    return new BrowserScanner<
      MusinsaDOMResponse,
      MusinsaProduct,
      PlatformConfig
    >({
      config: this.config,
      strategy,
      parseDOM: async (
        domData: MusinsaDOMResponse,
        productNo: string,
      ): Promise<MusinsaProduct> => {
        return MusinsaProduct.fromDOMData({
          ...domData,
          id: productNo,
          productNo,
        });
      },
    });
  }
}


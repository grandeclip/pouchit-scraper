/**
 * 컬리 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import { KurlyProduct, KurlyDOMResponse } from "@/core/domain/KurlyProduct";
import { KurlyConfig } from "@/core/domain/KurlyConfig";
import {
  StrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";

import { BrowserScanner } from "@/scanners/strategies/BrowserScanner";

/**
 * 컬리 스캐너 팩토리
 */
export class KurlyScannerFactory {
  constructor(private readonly config: KurlyConfig) {}

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<KurlyProduct> {
    if (isPlaywrightStrategy(strategy)) {
      return this.createBrowserScanner(strategy);
    }

    throw new Error(`Kurly에서 지원하지 않는 strategy 타입: ${strategy.type}`);
  }

  /**
   * Browser Scanner 생성
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<KurlyProduct> {
    return new BrowserScanner<KurlyDOMResponse, KurlyProduct, KurlyConfig>({
      config: this.config,
      strategy,
      parseDOM: async (
        domData: KurlyDOMResponse,
        productId: string,
      ): Promise<KurlyProduct> => {
        return KurlyProduct.fromDOMData({
          ...domData,
          productId,
        });
      },
    });
  }
}

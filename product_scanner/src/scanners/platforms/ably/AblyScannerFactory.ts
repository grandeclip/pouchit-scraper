/**
 * A-bly 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import { AblyProduct, AblyDOMResponse } from "@/core/domain/AblyProduct";
import { AblyConfig } from "@/core/domain/AblyConfig";
import {
  StrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";

import { AblyBrowserScanner } from "./AblyBrowserScanner";

/**
 * A-bly 스캐너 팩토리
 */
export class AblyScannerFactory {
  constructor(private readonly config: AblyConfig) {}

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<AblyProduct> {
    if (isPlaywrightStrategy(strategy)) {
      return this.createBrowserScanner(strategy);
    }

    throw new Error(`A-bly에서 지원하지 않는 strategy 타입: ${strategy.type}`);
  }

  /**
   * Browser Scanner 생성 (Extractor 기반)
   *
   * 전략:
   * - AblyBrowserScanner 사용 (Extractor 패턴 적용)
   * - parseDOM 대신 Extractor가 Page에서 직접 추출
   * - AblyExtractor → ProductData → AblyProduct.fromProductData
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<AblyProduct> {
    return new AblyBrowserScanner({
      config: this.config,
      strategy,
      parseDOM: async (
        _domData: AblyDOMResponse,
        _goodsNo: string,
      ): Promise<AblyProduct> => {
        // parseDOM은 사용되지 않음 (AblyBrowserScanner가 parseData를 override)
        // 하지만 BrowserScanner constructor에서 required이므로 dummy 구현 제공
        throw new Error(
          "parseDOM should not be called - AblyBrowserScanner uses Extractor",
        );
      },
    });
  }
}

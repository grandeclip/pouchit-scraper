/**
 * 컬리 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * Phase 3 리팩토링:
 * - parseDOM 콜백 → KurlyProductMapper 사용
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner, IProductMapper)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import { KurlyProduct } from "@/core/domain/KurlyProduct";
import { KurlyConfig } from "@/core/domain/KurlyConfig";
import {
  StrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";
import type { ProductData } from "@/extractors/base";
import { SCRAPER_CONFIG } from "@/config/constants";

import { BrowserScanner } from "@/scanners/strategies/BrowserScanner";
import { KurlyProductMapper } from "@/scrapers/mappers";

/**
 * 컬리 스캐너 팩토리
 */
export class KurlyScannerFactory {
  private readonly mapper: KurlyProductMapper;

  constructor(private readonly config: KurlyConfig) {
    this.mapper = new KurlyProductMapper();
  }

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
   * Browser Scanner 생성 (Mapper 패턴)
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<KurlyProduct> {
    return new BrowserScanner<ProductData, KurlyProduct, KurlyConfig>({
      config: this.config,
      strategy,
      mapper: this.mapper,
      screenshot: {
        enabled: true,
        outputDir: SCRAPER_CONFIG.SCREENSHOT_DIR,
      },
    });
  }
}

/**
 * 무신사 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * Phase 3 리팩토링:
 * - parseDOM 콜백 → MusinsaProductMapper 사용
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner, IProductMapper)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import { MusinsaProduct } from "@/core/domain/MusinsaProduct";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import {
  StrategyConfig,
  HttpStrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import {
  isHttpStrategy,
  isPlaywrightStrategy,
} from "@/core/domain/StrategyConfig.guards";
import type { ProductData } from "@/extractors/base";
import { SCRAPER_CONFIG } from "@/config/constants";

import { MusinsaHttpScanner } from "./MusinsaHttpScanner";
import { BrowserScanner } from "@/scanners/strategies/BrowserScanner";
import { MusinsaProductMapper } from "@/scrapers/mappers";

/**
 * 무신사 스캐너 팩토리
 */
export class MusinsaScannerFactory {
  private readonly mapper: MusinsaProductMapper;

  constructor(private readonly config: PlatformConfig) {
    this.mapper = new MusinsaProductMapper();
  }

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<MusinsaProduct> {
    if (isHttpStrategy(strategy)) {
      return this.createHttpScanner(strategy);
    }

    if (isPlaywrightStrategy(strategy)) {
      return this.createBrowserScanner(strategy);
    }

    throw new Error(
      `Musinsa에서 지원하지 않는 strategy 타입: ${strategy.type}`,
    );
  }

  /**
   * HTTP Scanner 생성
   */
  private createHttpScanner(
    strategy: HttpStrategyConfig,
  ): IScanner<MusinsaProduct> {
    return new MusinsaHttpScanner(this.config, strategy);
  }

  /**
   * Browser Scanner 생성 (Mapper 패턴)
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<MusinsaProduct> {
    return new BrowserScanner<ProductData, MusinsaProduct, PlatformConfig>({
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

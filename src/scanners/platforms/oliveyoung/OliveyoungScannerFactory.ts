/**
 * 올리브영 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * Phase 3 리팩토링:
 * - parseDOM 콜백 → OliveyoungProductMapper 사용
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner, IProductMapper)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import { OliveyoungProduct } from "@/core/domain/OliveyoungProduct";
import { OliveyoungConfig } from "@/core/domain/OliveyoungConfig";
import {
  StrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";
import type { ProductData } from "@/extractors/base";
import { SCRAPER_CONFIG } from "@/config/constants";

import { BrowserScanner } from "@/scanners/strategies/BrowserScanner";
import { OliveyoungProductMapper } from "@/scrapers/mappers";

/**
 * 올리브영 스캐너 팩토리
 */
export class OliveyoungScannerFactory {
  private readonly mapper: OliveyoungProductMapper;

  constructor(private readonly config: OliveyoungConfig) {
    this.mapper = new OliveyoungProductMapper();
  }

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<OliveyoungProduct> {
    if (isPlaywrightStrategy(strategy)) {
      return this.createBrowserScanner(strategy);
    }

    throw new Error(
      `Oliveyoung에서 지원하지 않는 strategy 타입: ${strategy.type}`,
    );
  }

  /**
   * Browser Scanner 생성 (Mapper 패턴)
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<OliveyoungProduct> {
    return new BrowserScanner<ProductData, OliveyoungProduct, OliveyoungConfig>(
      {
        config: this.config,
        strategy,
        mapper: this.mapper,
        screenshot: {
          enabled: true,
          outputDir: SCRAPER_CONFIG.SCREENSHOT_DIR,
        },
      },
    );
  }
}

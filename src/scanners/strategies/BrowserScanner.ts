/**
 * Browser 스캐너 (플랫폼 독립 전략)
 * Playwright 브라우저 기반 상품 정보 스크래핑
 *
 * Strategy Pattern 구현체 - Browser 전략
 * BaseScanner의 Template Method 패턴을 따름
 *
 * Phase 3 리팩토링:
 * - BrowserController에 브라우저 생명주기 위임
 * - 데이터 추출/파싱 로직만 담당 (SRP)
 *
 * SOLID 원칙:
 * - SRP: 데이터 추출/파싱만 담당 (브라우저 제어는 BrowserController)
 * - LSP: BaseScanner를 대체 가능
 * - DIP: IBrowserController, IProduct에 의존
 *
 * @template TDomData DOM 추출 데이터 타입
 * @template TProduct Product 타입 (IProduct 구현체)
 * @template TConfig Platform Config 타입
 */

import type { Browser, Page } from "playwright";

import { BaseScanner } from "@/scanners/base/BaseScanner.generic";
import { IProduct } from "@/core/interfaces/IProduct";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import { ExtractorRegistry } from "@/extractors/ExtractorRegistry";
import { PlaywrightStrategyConfig } from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";
import { logger } from "@/config/logger";
import {
  JsonLdSchemaExtractor,
  JsonLdConfig,
} from "@/extractors/JsonLdSchemaExtractor";
import {
  BrowserController,
  IBrowserController,
  ScreenshotOptions,
} from "@/scrapers/controllers";
import type { IProductMapper } from "@/scrapers/mappers";
import type { ProductData } from "@/extractors/base";

/**
 * Browser 스캐너 옵션
 *
 * parseDOM과 mapper 중 하나 선택:
 * - parseDOM: 기존 콜백 방식 (하위 호환성)
 * - mapper: IProductMapper 기반 (권장)
 */
export interface BrowserScannerOptions<
  TDomData,
  TProduct extends IProduct,
  TConfig extends PlatformConfig,
> {
  /** Platform 설정 */
  config: TConfig;
  /** Playwright 전략 설정 */
  strategy: PlaywrightStrategyConfig;
  /**
   * DOM 데이터 → Product 변환 함수 (Legacy)
   * @deprecated Use mapper instead
   */
  parseDOM?: (domData: TDomData, id: string) => Promise<TProduct>;
  /**
   * Product Mapper (권장)
   * ProductData → Product 변환
   */
  mapper?: IProductMapper<TProduct>;
  /** 스크린샷 옵션 */
  screenshot?: {
    /** 스크린샷 활성화 여부 */
    enabled: boolean;
    /** 스크린샷 저장 경로 (디렉토리) */
    outputDir: string;
    /** Job ID (파일명에 사용) */
    jobId?: string;
  };
  /** 외부 Browser 인스턴스 (Pool 사용 시) */
  externalBrowser?: Browser;
  /** 외부 BrowserController (DI용, 테스트 등) */
  browserController?: IBrowserController;
}

/**
 * Browser 스캐너
 */
export class BrowserScanner<
  TDomData,
  TProduct extends IProduct,
  TConfig extends PlatformConfig = PlatformConfig,
> extends BaseScanner<TDomData, TProduct, TConfig> {
  private browserController: IBrowserController;
  private parseDOM?: (domData: TDomData, id: string) => Promise<TProduct>;
  private mapper?: IProductMapper<TProduct>;
  private lastScanId: string = "";
  private screenshotOptions?: {
    enabled: boolean;
    outputDir: string;
    jobId?: string;
  };
  private externalBrowser?: Browser;

  constructor(options: BrowserScannerOptions<TDomData, TProduct, TConfig>) {
    super(options.config, options.strategy);
    this.parseDOM = options.parseDOM;
    this.mapper = options.mapper;
    this.screenshotOptions = options.screenshot;
    this.externalBrowser = options.externalBrowser;

    // mapper 또는 parseDOM 중 하나 필수
    if (!this.mapper && !this.parseDOM) {
      throw new Error("BrowserScanner requires either mapper or parseDOM");
    }

    // BrowserController 주입 (DI) 또는 기본 생성
    this.browserController =
      options.browserController || new BrowserController();
  }

  /**
   * Playwright 전략 설정 반환 (Type Guard)
   */
  private get playwrightStrategy(): PlaywrightStrategyConfig {
    if (!isPlaywrightStrategy(this.strategy)) {
      throw new Error(
        `Playwright 전략이 필요하지만 다른 타입입니다: ${this.strategy.type}`,
      );
    }
    return this.strategy;
  }

  /**
   * 현재 페이지 반환 (helper)
   */
  private get page(): Page | null {
    return this.browserController.getPage();
  }

  /**
   * 스크린샷 옵션 변환
   */
  private getScreenshotOptions(): ScreenshotOptions {
    const platformId =
      (this.config as { platform?: { id?: string }; id?: string }).platform
        ?.id ||
      (this.config as { id?: string }).id ||
      "unknown";

    return {
      enabled: this.screenshotOptions?.enabled || false,
      outputDir: this.screenshotOptions?.outputDir || "/tmp",
      platformId,
      jobId: this.screenshotOptions?.jobId,
    };
  }

  /**
   * 초기화 (브라우저 실행) - BrowserController에 위임
   */
  protected async doInitialize(): Promise<void> {
    logger.info({ strategyId: this.strategy.id }, "브라우저 초기화 시작");

    await this.browserController.initialize({
      strategy: this.playwrightStrategy,
      externalBrowser: this.externalBrowser,
    });

    logger.info({ strategyId: this.strategy.id }, "브라우저 준비 완료");
  }

  /**
   * 데이터 추출 (브라우저 스크래핑)
   */
  protected async extractData(id: string): Promise<TDomData> {
    if (!this.page) {
      throw new Error(
        `Browser/Page가 초기화되지 않음 - strategy: ${this.strategy.id}, productId: ${id}. initialize() 호출 필요`,
      );
    }

    const screenshotOpts = this.getScreenshotOptions();

    try {
      // 1. Network Intercept 설정 (API 응답 캡처)
      await this.browserController.setupNetworkIntercept(id);

      // 2. 네비게이션 스텝 실행
      await this.browserController.executeNavigation(id);

      // 3. 에러 페이지 감지
      const errorResult = await this.browserController.detectErrorPage(id);
      if (errorResult.isError) {
        throw new Error(errorResult.message);
      }

      // 4. 데이터 추출
      const data = await this.extractFromPage();

      // 5. 성공 스크린샷
      await this.browserController.takeScreenshot(id, screenshotOpts, false);

      return data;
    } catch (error) {
      // 에러 스크린샷
      await this.browserController.takeScreenshot(id, screenshotOpts, true);

      // Playwright 타임아웃 에러 처리
      if (error instanceof Error && error.message.includes("Timeout")) {
        throw new Error(
          `페이지 로딩 시간 초과 - strategy: ${this.strategy.id}, productId: ${id}`,
        );
      }
      throw error;
    }
  }

  /**
   * 데이터 파싱 (DOM 데이터 → 도메인 모델)
   *
   * 전략:
   * - mapper가 있으면 mapper.map() 사용 (권장)
   * - parseDOM이 있으면 parseDOM() 사용 (하위 호환성)
   */
  protected async parseData(rawData: TDomData): Promise<TProduct> {
    // mapper 우선 사용 (rawData가 ProductData 형식이어야 함)
    if (this.mapper) {
      return this.mapper.map(
        this.lastScanId,
        rawData as unknown as ProductData,
      );
    }

    // parseDOM 사용 (하위 호환성)
    if (this.parseDOM) {
      return await this.parseDOM(rawData, this.lastScanId);
    }

    throw new Error("No mapper or parseDOM available");
  }

  /**
   * 전처리: ID 저장
   */
  protected async beforeScan(id: string): Promise<void> {
    this.lastScanId = id;
  }

  /**
   * 리소스 정리 - BrowserController에 위임
   */
  async cleanup(): Promise<void> {
    logger.info({ strategyId: this.strategy.id }, "브라우저 정리 시작");
    await this.browserController.cleanup();
    logger.info({ strategyId: this.strategy.id }, "브라우저 정리 완료");
  }

  /**
   * 페이지에서 데이터 추출 (BrowserScanner의 핵심 책임)
   */
  private async extractFromPage(): Promise<TDomData> {
    const currentPage = this.page;
    if (!currentPage) {
      throw new Error(`Page가 초기화되지 않음 - strategy: ${this.strategy.id}`);
    }

    const extractionConfig = this.playwrightStrategy.playwright.extraction;

    // 1. evaluate 방식
    if (extractionConfig.method === "evaluate" && extractionConfig.script) {
      logger.info(
        { strategyId: this.strategy.id, method: "evaluate" },
        "데이터 추출 중 (evaluate)",
      );

      const evalFunction = new Function(
        `return (${extractionConfig.script})`,
      )();

      const pageTitle = await currentPage.title();
      logger.debug(
        { strategyId: this.strategy.id, pageTitle },
        "페이지 제목 확인",
      );

      const result = await currentPage.evaluate(evalFunction);
      logger.debug(
        { strategyId: this.strategy.id, data: JSON.stringify(result) },
        "데이터 추출 완료",
      );

      return result as TDomData;
    }

    // 2. selector 방식
    if (extractionConfig.method === "selector" && extractionConfig.selectors) {
      logger.info(
        { strategyId: this.strategy.id, method: "selector" },
        "데이터 추출 중 (selector)",
      );

      const result: Record<string, string | null> = {};
      for (const [key, selector] of Object.entries(
        extractionConfig.selectors,
      )) {
        const element = await currentPage.$(selector);
        result[key] = element ? await element.textContent() : null;
      }

      return result as TDomData;
    }

    // 3. json_ld_schema 방식
    if (
      extractionConfig.method === "json_ld_schema" &&
      extractionConfig.config
    ) {
      logger.info(
        { strategyId: this.strategy.id, method: "json_ld_schema" },
        "데이터 추출 중 (json_ld_schema)",
      );

      const config = extractionConfig.config;
      if (
        !config ||
        typeof config !== "object" ||
        !("selector" in config) ||
        !("fallback" in config)
      ) {
        throw new Error(
          "Invalid json_ld_schema config: missing selector or fallback",
        );
      }

      const extractor = new JsonLdSchemaExtractor(
        config as unknown as JsonLdConfig,
      );

      // BrowserController에서 intercept된 데이터 사용
      const interceptedData = this.browserController.getInterceptedData();
      const result = await extractor.extract(currentPage, interceptedData);

      return result as TDomData;
    }

    // 4. extractor 방식 (Facade Pattern)
    if (extractionConfig.extractor) {
      logger.info(
        {
          strategyId: this.strategy.id,
          extractorId: extractionConfig.extractor,
        },
        "데이터 추출 중 (extractor)",
      );

      const registry = ExtractorRegistry.getInstance();
      const extractor = registry.get(extractionConfig.extractor);
      const result = await extractor.extract(currentPage);

      logger.debug(
        { strategyId: this.strategy.id, data: JSON.stringify(result) },
        "데이터 추출 완료",
      );

      return result as TDomData;
    }

    throw new Error(
      `잘못된 extraction 설정 - strategy: ${this.strategy.id}. method는 'evaluate'(+script), 'selector'(+selectors), 'json_ld_schema'(+config), 또는 extractor 필요`,
    );
  }
}

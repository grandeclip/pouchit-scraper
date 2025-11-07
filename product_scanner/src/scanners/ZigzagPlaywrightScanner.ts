/**
 * ZigZag Playwright 스캐너
 * __NEXT_DATA__ 기반 상품 정보 스크래핑
 *
 * SOLID 원칙:
 * - SRP: ZigZag 브라우저 스크래핑만 담당
 * - LSP: BaseScanner를 대체 가능
 * - DIP: 추상 인터페이스에 의존
 *
 * Design Pattern:
 * - Template Method: BaseScanner의 템플릿 메소드 패턴 따름
 * - Strategy: NextDataSchemaExtractor로 추출 전략 분리
 */

import { chromium as playwrightChromium } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";

import { BaseScanner } from "@/scanners/base/BaseScanner.generic";
import { ZigzagConfig } from "@/core/domain/ZigzagConfig";
import { PlaywrightStrategyConfig } from "@/core/domain/StrategyConfig";
import { ZigzagProduct } from "@/core/domain/ZigzagProduct";
import { logger } from "@/config/logger";
import { NextDataSchemaExtractor } from "@/extractors/NextDataSchemaExtractor";
import type { NextDataProductData } from "@/core/domain/NextDataProductData";

// Stealth 플러그인 적용
chromium.use(StealthPlugin());

/**
 * ZigZag Playwright 스캐너
 */
export class ZigzagPlaywrightScanner extends BaseScanner<
  NextDataProductData,
  ZigzagProduct,
  ZigzagConfig
> {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: ZigzagConfig, strategy: PlaywrightStrategyConfig) {
    super(config, strategy);
  }

  /**
   * Playwright 전략 설정 반환 (타입 캐스팅)
   */
  private get playwrightStrategy(): PlaywrightStrategyConfig {
    return this.strategy as PlaywrightStrategyConfig;
  }

  /**
   * 초기화 (브라우저 실행)
   */
  protected async doInitialize(): Promise<void> {
    logger.info({ strategy_id: this.strategy.id }, "브라우저 실행 중");

    // 브라우저 실행
    this.browser = await chromium.launch({
      headless: this.playwrightStrategy.playwright.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    // 컨텍스트 생성 (YAML contextOptions 적용)
    const contextOptions =
      this.playwrightStrategy.playwright.contextOptions || {};

    this.context = await this.browser.newContext({
      viewport: contextOptions.viewport || { width: 375, height: 812 },
      userAgent:
        contextOptions.userAgent ||
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      locale: contextOptions.locale || "ko-KR",
      timezoneId: contextOptions.timezoneId || "Asia/Seoul",
      isMobile: contextOptions.isMobile ?? true,
      hasTouch: contextOptions.hasTouch ?? true,
      deviceScaleFactor: contextOptions.deviceScaleFactor || 2,
      extraHTTPHeaders: contextOptions.extraHTTPHeaders || {},
    });

    // 추가 anti-detection 설정
    await this.context.addInitScript(() => {
      // webdriver 속성 제거
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    // 페이지 생성
    this.page = await this.context.newPage();

    logger.info({ strategy_id: this.strategy.id }, "브라우저 준비 완료");
  }

  /**
   * 데이터 추출 (브라우저 스크래핑)
   */
  protected async extractData(productId: string): Promise<NextDataProductData> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    // 네비게이션 스텝 실행
    await this.executeNavigationSteps(productId);

    // 데이터 추출
    const rawData = await this.extractFromPage();

    /**
     * productId를 rawData에 추가
     * 이유: BaseScanner.scan() 흐름에서 extractData() → parseData() 순서로 진행되며,
     *       parseData()에서 도메인 모델 생성 시 id가 필요하므로 여기서 주입
     */
    return {
      ...rawData,
      id: productId,
    };
  }

  /**
   * 데이터 파싱 (원시 데이터 → 도메인 모델)
   */
  protected async parseData(
    rawData: NextDataProductData,
  ): Promise<ZigzagProduct> {
    return ZigzagProduct.fromNextData(rawData);
  }

  /**
   * 리소스 정리 (브라우저 종료)
   */
  async cleanup(): Promise<void> {
    logger.info({ strategy_id: this.strategy.id }, "브라우저 정리 중");

    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    logger.info({ strategy_id: this.strategy.id }, "브라우저 정리 완료");
  }

  /**
   * 네비게이션 스텝 실행
   */
  private async executeNavigationSteps(productId: string): Promise<void> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const steps = this.playwrightStrategy.playwright.navigationSteps;

    for (const step of steps) {
      const url = step.url?.replace("${productId}", productId);

      switch (step.action) {
        case "navigate":
          if (url) {
            const waitUntil = step.waitUntil || "networkidle";
            logger.info(
              { strategy_id: this.strategy.id, url, waitUntil },
              "페이지 이동",
            );
            await this.page.goto(url, {
              waitUntil,
              timeout: step.timeout || 30000,
            });
          }
          break;

        case "waitForSelector":
          if (step.selector) {
            logger.info(
              { strategy_id: this.strategy.id, selector: step.selector },
              "셀렉터 대기",
            );
            await this.page.waitForSelector(step.selector, {
              timeout: step.timeout || 5000,
            });
          }
          break;

        case "wait":
          const waitTime = step.timeout || 1000;
          logger.info(
            { strategy_id: this.strategy.id, wait_ms: waitTime },
            "대기",
          );
          await this.page.waitForTimeout(waitTime);
          break;

        case "click":
          if (step.selector) {
            logger.info(
              { strategy_id: this.strategy.id, selector: step.selector },
              "클릭",
            );
            await this.page.click(step.selector);
          }
          break;

        case "type":
          if (step.selector && step.value) {
            logger.info(
              { strategy_id: this.strategy.id, selector: step.selector },
              "입력",
            );
            await this.page.fill(step.selector, step.value);
          }
          break;

        case "evaluate":
          if (step.script) {
            logger.info({ strategy_id: this.strategy.id }, "JavaScript 실행");
            await this.page.evaluate(step.script);
          }
          break;

        default:
          logger.warn(
            { strategy_id: this.strategy.id, action: step.action },
            "알 수 없는 액션",
          );
      }
    }
  }

  /**
   * 페이지에서 데이터 추출
   */
  private async extractFromPage(): Promise<NextDataProductData> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const extractionConfig = this.playwrightStrategy.playwright.extraction;

    // NextDataSchemaExtractor 사용
    if (
      extractionConfig.method === "next_data_schema" &&
      extractionConfig.extractor === "NextDataSchemaExtractor"
    ) {
      logger.info(
        { strategy_id: this.strategy.id },
        "__NEXT_DATA__ Schema 추출",
      );
      const nextDataExtractor = new NextDataSchemaExtractor(
        extractionConfig.config,
      );
      const result = await nextDataExtractor.extract(this.page);

      logger.info(
        { strategy_id: this.strategy.id, data: JSON.stringify(result) },
        "__NEXT_DATA__ 추출 완료",
      );

      return result;
    }

    throw new Error(
      "Invalid extraction configuration - NextDataSchemaExtractor required",
    );
  }
}

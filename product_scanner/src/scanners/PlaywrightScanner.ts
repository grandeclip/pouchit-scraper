/**
 * Playwright 스캐너
 * 브라우저 기반 상품 정보 스크래핑
 *
 * product_search 패턴 참조
 *
 * SOLID 원칙:
 * - SRP: 브라우저 스크래핑만 담당
 * - LSP: BaseScanner를 대체 가능
 * - DIP: 설정에 의존
 */

import { chromium as playwrightChromium } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";

import { BaseScanner } from "@/scanners/base/BaseScanner.generic";
import { HwahaeConfig } from "@/core/domain/HwahaeConfig";
import { PlaywrightStrategyConfig } from "@/core/domain/StrategyConfig";
import { HwahaeProduct, HwahaeApiResponse } from "@/core/domain/HwahaeProduct";
import { logger } from "@/config/logger";
import { JsonLdSchemaExtractor } from "@/extractors/JsonLdSchemaExtractor";

// Stealth 플러그인 적용
chromium.use(StealthPlugin());

/**
 * Playwright 스캐너
 */
export class PlaywrightScanner extends BaseScanner<
  HwahaeApiResponse,
  HwahaeProduct,
  HwahaeConfig
> {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: HwahaeConfig, strategy: PlaywrightStrategyConfig) {
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
      viewport: contextOptions.viewport || { width: 1920, height: 1080 },
      userAgent:
        contextOptions.userAgent ||
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: contextOptions.locale || "ko-KR",
      timezoneId: contextOptions.timezoneId || "Asia/Seoul",
      isMobile: contextOptions.isMobile || false,
      hasTouch: contextOptions.hasTouch || false,
      deviceScaleFactor: contextOptions.deviceScaleFactor || 1,
    });

    // 추가 anti-detection 설정
    await this.context.addInitScript(() => {
      // webdriver 속성 제거
      // @ts-expect-error - Browser context에서 실행되는 코드 (navigator는 브라우저 전역 객체)
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
  protected async extractData(goodsId: string): Promise<any> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    // 네비게이션 스텝 실행
    await this.executeNavigationSteps(goodsId);

    // 데이터 추출
    const rawData = await this.extractFromPage();

    /**
     * goodsId를 rawData에 추가
     * 이유: BaseScanner.scan() 흐름에서 extractData() → parseData() 순서로 진행되며,
     *       parseData()에서 도메인 모델 생성 시 id가 필요하므로 여기서 주입
     * 책임: extractData()는 '원시 데이터 추출 + 메타데이터 보강' 담당
     */
    return {
      ...rawData,
      id: goodsId,
    };
  }

  /**
   * 데이터 파싱 (원시 데이터 → 도메인 모델)
   */
  protected async parseData(rawData: any): Promise<HwahaeProduct> {
    // 브라우저에서 추출한 데이터를 API 응답 형식으로 변환
    const apiResponse: HwahaeApiResponse = {
      id: rawData.id || 0,
      name: rawData.name || "",
      title_images: rawData.title_images || [],
      consumer_price: rawData.consumer_price || 0,
      price: rawData.price || 0,
      sale_status: rawData.sale_status || "SELNG",
    };

    return HwahaeProduct.fromApiResponse(apiResponse);
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
  private async executeNavigationSteps(goodsId: string): Promise<void> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const steps = this.playwrightStrategy.playwright.navigationSteps;

    for (const step of steps) {
      const url = step.url?.replace("${goodsId}", goodsId);

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
  private async extractFromPage(): Promise<any> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const extractionConfig = this.playwrightStrategy.playwright.extraction;

    // JSON-LD Schema.org Extractor 사용
    if (
      extractionConfig.method === "json_ld_schema" &&
      extractionConfig.extractor === "JsonLdSchemaExtractor"
    ) {
      logger.info({ strategy_id: this.strategy.id }, "JSON-LD Schema.org 추출");
      const jsonLdExtractor = new JsonLdSchemaExtractor(
        extractionConfig.config,
      );
      const result = await jsonLdExtractor.extract(this.page);

      logger.info(
        { strategy_id: this.strategy.id, data: JSON.stringify(result) },
        "JSON-LD 추출 완료",
      );

      return {
        ...result,
        _redirected: false,
      };
    }

    if (extractionConfig.method === "evaluate" && extractionConfig.script) {
      // page.evaluate 방식
      logger.info({ strategy_id: this.strategy.id }, "evaluate로 데이터 추출");
      const evalFunction = new Function(
        `return (${extractionConfig.script})`,
      )();
      // Debug: Check page title before extraction
      const pageTitle = await this.page.title();
      logger.info(
        { strategy_id: this.strategy.id, page_title: pageTitle },
        "페이지 제목",
      );

      const result = await this.page.evaluate(evalFunction);
      logger.info(
        { strategy_id: this.strategy.id, data: JSON.stringify(result) },
        "추출 완료",
      );
      return result;
    }

    if (extractionConfig.method === "selector" && extractionConfig.selectors) {
      // Playwright selector 방식
      logger.info({ strategy_id: this.strategy.id }, "셀렉터로 데이터 추출");
      const result: any = {};

      for (const [key, selector] of Object.entries(
        extractionConfig.selectors,
      )) {
        const element = await this.page.$(selector);
        result[key] = element ? await element.textContent() : null;
      }

      return result;
    }

    throw new Error("Invalid extraction configuration");
  }
}

/**
 * Browser 스캐너 (플랫폼 독립 전략)
 * Playwright 브라우저 기반 상품 정보 스크래핑
 *
 * Strategy Pattern 구현체 - Browser 전략
 * BaseScanner의 Template Method 패턴을 따름
 *
 * SOLID 원칙:
 * - SRP: 브라우저 스크래핑만 담당
 * - LSP: BaseScanner를 대체 가능
 * - DIP: 추상화에 의존 (IProduct, PlatformConfig)
 *
 * @template TDomData DOM 추출 데이터 타입
 * @template TProduct Product 타입 (IProduct 구현체)
 * @template TConfig Platform Config 타입
 */

import { chromium as playwrightChromium } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";
import * as path from "path";
import * as fs from "fs/promises";

import { BaseScanner } from "@/scanners/base/BaseScanner.generic";
import { IProduct } from "@/core/interfaces/IProduct";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import {
  PlaywrightStrategyConfig,
  StrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";
import { logger } from "@/config/logger";
import { SCRAPER_CONFIG } from "@/config/constants";

// Stealth 플러그인 적용
chromium.use(StealthPlugin());

/**
 * Browser 스캐너 옵션
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
  /** DOM 데이터 → Product 변환 함수 */
  parseDOM: (domData: TDomData, id: string) => Promise<TProduct>;
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
}

/**
 * Browser 스캐너
 */
export class BrowserScanner<
  TDomData,
  TProduct extends IProduct,
  TConfig extends PlatformConfig = PlatformConfig,
> extends BaseScanner<TDomData, TProduct, TConfig> {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private parseDOM: (domData: TDomData, id: string) => Promise<TProduct>;
  private lastScanId: string = "";
  private screenshotOptions?: {
    enabled: boolean;
    outputDir: string;
    jobId?: string;
  };
  private externalBrowser: Browser | null = null;
  private usingExternalBrowser: boolean = false;

  constructor(options: BrowserScannerOptions<TDomData, TProduct, TConfig>) {
    super(options.config, options.strategy);
    this.parseDOM = options.parseDOM;
    this.screenshotOptions = options.screenshot;
    this.externalBrowser = options.externalBrowser || null;
    this.usingExternalBrowser = !!options.externalBrowser;
  }

  /**
   * Playwright 전략 설정 반환 (Type Guard)
   *
   * @throws {Error} Playwright 전략이 아닌 경우
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
   * 초기화 (브라우저 실행)
   */
  protected async doInitialize(): Promise<void> {
    logger.info({ strategyId: this.strategy.id }, "브라우저 실행 중...");

    const pwConfig = this.playwrightStrategy.playwright;

    // 외부 Browser 사용 시 (Pool에서 주입)
    if (this.usingExternalBrowser && this.externalBrowser) {
      logger.info(
        { strategyId: this.strategy.id },
        "외부 Browser 사용 (Pool에서 주입)",
      );
      this.browser = this.externalBrowser;
    } else {
      // 자체 Browser 생성
      this.browser = await chromium.launch({
        headless: pwConfig.headless,
        args: pwConfig.browserOptions?.args || [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });
    }

    // 컨텍스트 생성
    const contextOptions = pwConfig.contextOptions || {};
    this.context = await this.browser.newContext({
      viewport: contextOptions.viewport || SCRAPER_CONFIG.DEFAULT_VIEWPORT,
      userAgent: contextOptions.userAgent || SCRAPER_CONFIG.DEFAULT_USER_AGENT,
      locale: contextOptions.locale || "ko-KR",
      timezoneId: contextOptions.timezoneId || "Asia/Seoul",
      isMobile: contextOptions.isMobile || false,
      hasTouch: contextOptions.hasTouch || false,
      deviceScaleFactor: contextOptions.deviceScaleFactor || 1,
    });

    // 추가 anti-detection 설정
    await this.context.addInitScript(() => {
      // webdriver 속성 제거
      // @ts-expect-error - Browser context에서 실행되는 코드
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    // 페이지 생성
    this.page = await this.context.newPage();

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

    try {
      // 네비게이션 스텝 실행
      await this.executeNavigationSteps(id);

      // 에러 페이지 감지
      await this.detectErrorPage(id);

      // 데이터 추출
      return await this.extractFromPage();
    } catch (error) {
      // Playwright 타임아웃 에러 처리
      if (error instanceof Error) {
        if (error.message.includes("Timeout")) {
          throw new Error(
            `페이지 로딩 시간 초과 - strategy: ${this.strategy.id}, productId: ${id}`,
          );
        }
      }
      throw error;
    }
  }

  /**
   * 에러 페이지 감지 (404, 500 등)
   */
  private async detectErrorPage(id: string): Promise<void> {
    if (!this.page) return;

    const pageTitle = await this.page.title();
    const pageUrl = this.page.url();

    // 404 Not Found 감지
    if (
      pageTitle.includes("404") ||
      pageTitle.includes("Not Found") ||
      pageTitle.includes("페이지를 찾을 수 없습니다") ||
      pageUrl.includes("/error") ||
      pageUrl.includes("/404")
    ) {
      throw new Error(
        `상품을 찾을 수 없음 (삭제되었거나 존재하지 않음) - strategy: ${this.strategy.id}, productId: ${id}`,
      );
    }

    // 500 Server Error 감지
    if (
      pageTitle.includes("500") ||
      pageTitle.includes("Server Error") ||
      pageTitle.includes("서버 오류")
    ) {
      throw new Error(
        `서버 에러 발생 - strategy: ${this.strategy.id}, productId: ${id}`,
      );
    }

    // Rate Limiting 감지 (일부 사이트는 차단 페이지로 리다이렉트)
    if (
      pageTitle.includes("Access Denied") ||
      pageTitle.includes("차단") ||
      pageTitle.includes("Blocked") ||
      pageUrl.includes("/blocked")
    ) {
      throw new Error(
        `Rate limit 또는 접근 차단 - strategy: ${this.strategy.id}, productId: ${id}`,
      );
    }
  }

  /**
   * 데이터 파싱 (DOM 데이터 → 도메인 모델)
   */
  protected async parseData(rawData: TDomData): Promise<TProduct> {
    // 플랫폼별 파싱 로직은 외부에서 주입받음
    return await this.parseDOM(rawData, this.lastScanId);
  }

  /**
   * 전처리: ID 저장
   */
  protected async beforeScan(id: string): Promise<void> {
    this.lastScanId = id;
  }

  /**
   * 리소스 정리 (브라우저 종료)
   */
  async cleanup(): Promise<void> {
    logger.info({ strategyId: this.strategy.id }, "브라우저 정리 중...");

    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    // 외부 Browser 사용 시 종료하지 않음 (Pool에서 관리)
    if (this.browser && !this.usingExternalBrowser) {
      await this.browser.close();
      this.browser = null;
    } else if (this.usingExternalBrowser) {
      logger.info(
        { strategyId: this.strategy.id },
        "외부 Browser는 Pool에서 관리 - 종료 스킵",
      );
      this.browser = null; // 참조만 제거
    }

    logger.info({ strategyId: this.strategy.id }, "브라우저 정리 완료");
  }

  /**
   * 네비게이션 스텝 실행
   */
  private async executeNavigationSteps(id: string): Promise<void> {
    if (!this.page) {
      throw new Error(
        `Page가 초기화되지 않음 - strategy: ${this.strategy.id}, productId: ${id}`,
      );
    }

    const steps = this.playwrightStrategy.playwright.navigationSteps;

    for (const step of steps) {
      // 플랫폼별 ID placeholder 치환 (goodsId, productId 등)
      const url = this.replaceIdPlaceholder(step.url, id);

      switch (step.action) {
        case "navigate":
          if (url) {
            logger.info({ strategyId: this.strategy.id, url }, "페이지 이동");
            await this.page.goto(url, {
              waitUntil: "networkidle",
              timeout: SCRAPER_CONFIG.NAVIGATION_TIMEOUT_MS,
            });
          }
          break;

        case "waitForSelector":
          if (step.selector) {
            logger.info(
              { strategyId: this.strategy.id, selector: step.selector },
              "selector 대기 중",
            );
            await this.page.waitForSelector(step.selector, {
              timeout: step.timeout || SCRAPER_CONFIG.SELECTOR_TIMEOUT_MS,
            });
          }
          break;

        case "wait":
          const waitTime = step.timeout || SCRAPER_CONFIG.DEFAULT_WAIT_TIME_MS;
          logger.info(
            { strategyId: this.strategy.id, waitTimeMs: waitTime },
            "대기 중",
          );
          await this.page.waitForTimeout(waitTime);
          break;

        case "click":
          if (step.selector) {
            logger.info(
              { strategyId: this.strategy.id, selector: step.selector },
              "요소 클릭",
            );
            await this.page.click(step.selector);
          }
          break;

        case "type":
          if (step.selector && step.value) {
            logger.info(
              { strategyId: this.strategy.id, selector: step.selector },
              "텍스트 입력",
            );
            await this.page.fill(step.selector, step.value);
          }
          break;

        default:
          logger.warn(
            { strategyId: this.strategy.id, action: step.action },
            "알 수 없는 action",
          );
      }
    }
  }

  /**
   * ID placeholder 치환 (플랫폼별 변수명 대응)
   */
  private replaceIdPlaceholder(
    template: string | undefined,
    id: string,
  ): string | undefined {
    if (!template) return undefined;

    // 다양한 ID 변수명 지원
    return template
      .replace("${goodsId}", id)
      .replace("${goodsNo}", id)
      .replace("${productId}", id)
      .replace("${id}", id);
  }

  /**
   * 페이지에서 데이터 추출
   */
  private async extractFromPage(): Promise<TDomData> {
    if (!this.page) {
      throw new Error(`Page가 초기화되지 않음 - strategy: ${this.strategy.id}`);
    }

    const extractionConfig = this.playwrightStrategy.playwright.extraction;

    if (extractionConfig.method === "evaluate" && extractionConfig.script) {
      // page.evaluate 방식
      logger.info(
        { strategyId: this.strategy.id, method: "evaluate" },
        "데이터 추출 중 (evaluate)",
      );
      const evalFunction = new Function(
        `return (${extractionConfig.script})`,
      )();

      // Debug: Check page title before extraction
      const pageTitle = await this.page.title();
      logger.debug(
        { strategyId: this.strategy.id, pageTitle },
        "페이지 제목 확인",
      );

      const result = await this.page.evaluate(evalFunction);
      logger.debug(
        { strategyId: this.strategy.id, data: JSON.stringify(result) },
        "데이터 추출 완료",
      );
      return result as TDomData;
    }

    if (extractionConfig.method === "selector" && extractionConfig.selectors) {
      // Playwright selector 방식
      logger.info(
        { strategyId: this.strategy.id, method: "selector" },
        "데이터 추출 중 (selector)",
      );
      const result: Record<string, string | null> = {};

      for (const [key, selector] of Object.entries(
        extractionConfig.selectors,
      )) {
        const element = await this.page.$(selector);
        result[key] = element ? await element.textContent() : null;
      }

      return result as TDomData;
    }

    throw new Error(
      `잘못된 extraction 설정 - strategy: ${this.strategy.id}. method는 'evaluate'(+script) 또는 'selector'(+selectors) 필요`,
    );
  }

  /**
   * 스크린샷 저장
   */
  private async takeScreenshot(
    id: string,
    isError: boolean = false,
  ): Promise<void> {
    // 스크린샷 비활성화 시 스킵
    if (!this.screenshotOptions?.enabled || !this.page) {
      return;
    }

    try {
      const { outputDir, jobId } = this.screenshotOptions;

      // Platform ID 추출 (config에서)
      const platform =
        (this.config as any).platform?.id ||
        (this.config as any).id ||
        "unknown";

      // 디렉토리 생성: outputDir/platform/
      const platformDir = path.join(outputDir, platform);
      await fs.mkdir(platformDir, { recursive: true });

      // 파일명 생성: {jobId}_{product_set_id}_{status}.png
      const status = isError ? "error" : "success";
      const filename = jobId
        ? `${jobId}_${id}_${status}.png`
        : `${id}_${status}.png`;

      const filepath = path.join(platformDir, filename);

      // 스크린샷 저장
      await this.page.screenshot({
        path: filepath,
      });

      logger.debug(
        { strategyId: this.strategy.id, filepath, status },
        "스크린샷 저장 완료",
      );
    } catch (error) {
      // 스크린샷 실패는 무시 (원래 작업에 영향 주지 않음)
      logger.warn(
        { strategyId: this.strategy.id, error },
        "스크린샷 저장 실패 - 무시",
      );
    }
  }
}

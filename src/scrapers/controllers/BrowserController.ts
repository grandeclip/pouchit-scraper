/**
 * Browser Controller 구현체
 *
 * 브라우저 생명주기 및 네비게이션 관리
 *
 * SOLID 원칙:
 * - SRP: 브라우저 제어만 담당 (추출/파싱 X)
 * - OCP: 전략 설정으로 확장 가능
 * - LSP: IBrowserController 대체 가능
 * - DIP: 인터페이스에 의존
 *
 * 책임:
 * 1. 브라우저/컨텍스트/페이지 생명주기 관리
 * 2. 네비게이션 스텝 실행
 * 3. 에러 페이지 감지
 * 4. Network Intercept 설정
 * 5. 스크린샷 촬영
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext, Page } from "playwright";
import * as path from "path";
import * as fs from "fs/promises";

import {
  IBrowserController,
  BrowserInitOptions,
  NavigationResult,
  ErrorPageDetectionResult,
  ErrorPageType,
  ScreenshotOptions,
} from "./IBrowserController";
import { PlaywrightStrategyConfig } from "@/core/domain/StrategyConfig";
import { logger } from "@/config/logger";
import { SCRAPER_CONFIG } from "@/config/constants";

// Stealth 플러그인 적용 (모듈 레벨)
chromium.use(StealthPlugin());

/**
 * Browser Controller 구현체
 */
export class BrowserController implements IBrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private strategy: PlaywrightStrategyConfig | null = null;
  private usingExternalBrowser: boolean = false;
  private interceptedApiData: unknown | null = null;
  private _initialized: boolean = false;

  /**
   * 브라우저 초기화
   */
  async initialize(options: BrowserInitOptions): Promise<void> {
    if (this._initialized) {
      logger.debug(
        { strategyId: options.strategy.id },
        "BrowserController 이미 초기화됨",
      );
      return;
    }

    this.strategy = options.strategy;
    const pwConfig = options.strategy.playwright;

    logger.info({ strategyId: options.strategy.id }, "브라우저 초기화 시작");

    // 외부 Browser 사용 시 (Pool에서 주입)
    if (options.externalBrowser) {
      logger.info(
        { strategyId: options.strategy.id },
        "외부 Browser 사용 (Pool에서 주입)",
      );
      this.browser = options.externalBrowser;
      this.usingExternalBrowser = true;
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
      this.usingExternalBrowser = false;
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

    // Anti-detection 설정
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    // 페이지 생성
    this.page = await this.context.newPage();
    this._initialized = true;

    logger.info({ strategyId: options.strategy.id }, "브라우저 초기화 완료");
  }

  /**
   * 네비게이션 스텝 실행
   */
  async executeNavigation(id: string): Promise<NavigationResult> {
    if (!this.page || !this.strategy) {
      throw new Error("BrowserController가 초기화되지 않음");
    }

    const steps = this.strategy.playwright.navigationSteps;

    for (const step of steps) {
      const url = this.replaceIdPlaceholder(step.url, id);

      switch (step.action) {
        case "navigate":
          if (url) {
            logger.info({ strategyId: this.strategy.id, url }, "페이지 이동");
            await this.page.goto(url, {
              waitUntil:
                (step.waitUntil as
                  | "networkidle"
                  | "load"
                  | "domcontentloaded"
                  | "commit") || "networkidle",
              timeout: step.timeout || SCRAPER_CONFIG.NAVIGATION_TIMEOUT_MS,
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

    return {
      success: true,
      finalUrl: this.page.url(),
      pageTitle: await this.page.title(),
    };
  }

  /**
   * 에러 페이지 감지
   */
  async detectErrorPage(id: string): Promise<ErrorPageDetectionResult> {
    if (!this.page || !this.strategy) {
      return { isError: false, errorType: "none" };
    }

    const pageTitle = await this.page.title();
    const pageUrl = this.page.url();
    const strategyId = this.strategy.id;

    // 404 Not Found 감지
    if (
      pageTitle.includes("404") ||
      pageTitle.includes("Not Found") ||
      pageTitle.includes("페이지를 찾을 수 없습니다") ||
      pageUrl.includes("/error") ||
      pageUrl.includes("/404")
    ) {
      return {
        isError: true,
        errorType: "not_found",
        message: `상품을 찾을 수 없음 (삭제되었거나 존재하지 않음) - strategy: ${strategyId}, productId: ${id}`,
      };
    }

    // 500 Server Error 감지
    if (
      pageTitle.includes("500") ||
      pageTitle.includes("Server Error") ||
      pageTitle.includes("서버 오류")
    ) {
      return {
        isError: true,
        errorType: "server_error",
        message: `서버 에러 발생 - strategy: ${strategyId}, productId: ${id}`,
      };
    }

    // Rate Limiting 감지
    if (
      pageTitle.includes("Access Denied") ||
      pageTitle.includes("차단") ||
      pageTitle.includes("Blocked") ||
      pageUrl.includes("/blocked")
    ) {
      return {
        isError: true,
        errorType: "rate_limited",
        message: `Rate limit 또는 접근 차단 - strategy: ${strategyId}, productId: ${id}`,
      };
    }

    return { isError: false, errorType: "none" };
  }

  /**
   * Network Intercept 설정
   */
  async setupNetworkIntercept(id: string): Promise<void> {
    if (!this.page || !this.strategy) {
      return;
    }

    // 무신사 상품 API URL 패턴
    const apiUrlPattern = `/api2/goods/${id}`;
    this.interceptedApiData = null;

    this.page.on("response", async (response) => {
      try {
        const url = response.url();

        if (
          url.includes(apiUrlPattern) &&
          !url.includes("/options") &&
          !url.includes("/curation")
        ) {
          const bodyText = await response.text();

          try {
            this.interceptedApiData = JSON.parse(bodyText);
            logger.info(
              {
                strategyId: this.strategy?.id,
                url,
                status: response.status(),
                hasData: !!(this.interceptedApiData as { data?: unknown })
                  ?.data,
              },
              "API 응답 intercept 완료",
            );
          } catch {
            this.interceptedApiData = null;
            logger.warn(
              { strategyId: this.strategy?.id, url },
              "API 응답 JSON 파싱 실패",
            );
          }
        }
      } catch (error) {
        logger.debug(
          { strategyId: this.strategy?.id, error },
          "Response intercept 에러 (무시)",
        );
      }
    });

    logger.debug(
      { strategyId: this.strategy.id, pattern: apiUrlPattern },
      "Network intercept 설정 완료",
    );
  }

  /**
   * Intercept된 API 데이터 반환
   */
  getInterceptedData(): unknown | null {
    return this.interceptedApiData;
  }

  /**
   * 스크린샷 촬영
   */
  async takeScreenshot(
    id: string,
    options: ScreenshotOptions,
    isError: boolean = false,
  ): Promise<void> {
    if (!options.enabled || !this.page) {
      return;
    }

    try {
      const { outputDir, platformId, jobId } = options;

      // 디렉토리 생성: outputDir/platform/
      const platformDir = path.join(outputDir, platformId);
      await fs.mkdir(platformDir, { recursive: true, mode: 0o777 });

      // 파일명 생성: {jobId}_{product_set_id}_{status}.png
      const status = isError ? "error" : "success";
      const filename = jobId
        ? `${jobId}_${id}_${status}.png`
        : `${id}_${status}.png`;

      const filepath = path.join(platformDir, filename);

      // 스크린샷 저장
      await this.page.screenshot({ path: filepath });

      // 파일 권한 설정 (666)
      await fs.chmod(filepath, 0o666);

      logger.debug(
        { strategyId: this.strategy?.id, filepath, status },
        "스크린샷 저장 완료",
      );
    } catch (error) {
      logger.warn(
        { strategyId: this.strategy?.id, error },
        "스크린샷 저장 실패 - 무시",
      );
    }
  }

  /**
   * 현재 Page 인스턴스 반환
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * 현재 Context 인스턴스 반환
   */
  getContext(): BrowserContext | null {
    return this.context;
  }

  /**
   * 현재 Browser 인스턴스 반환
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    const strategyId = this.strategy?.id || "unknown";
    logger.info({ strategyId }, "BrowserController 정리 중...");

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
      logger.info({ strategyId }, "외부 Browser는 Pool에서 관리 - 종료 스킵");
      this.browser = null;
    }

    this._initialized = false;
    this.interceptedApiData = null;

    logger.info({ strategyId }, "BrowserController 정리 완료");
  }

  /**
   * 초기화 상태 확인
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * ID placeholder 치환 (private helper)
   */
  private replaceIdPlaceholder(
    template: string | undefined,
    id: string,
  ): string | undefined {
    if (!template) return undefined;

    return template
      .replace("${goodsId}", id)
      .replace("${goodsNo}", id)
      .replace("${productId}", id)
      .replace("${id}", id);
  }
}

/**
 * PlaywrightApiSearcher - Playwright API 인터셉트 기반 검색 Base Class
 * Template Method Pattern + Strategy Pattern
 *
 * 역할:
 * - Playwright 브라우저로 페이지 접속
 * - API 응답 인터셉트하여 상품 데이터 추출
 * - 독립 브라우저 생성/정리 (플랫폼별 격리)
 *
 * 사용 플랫폼:
 * - OliveYoung, Musinsa, Ably, Kurly (Cloudflare 보호)
 *
 * SOLID 원칙:
 * - SRP: Playwright API 인터셉트 검색만 담당
 * - OCP: 플랫폼별 확장 가능 (parseApiResponse 오버라이드)
 * - LSP: BaseSearcher 대체 가능
 * - DIP: SearchConfig에 의존
 */

import type { Browser, BrowserContext, Page, Response } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { BaseSearcher } from "@/searchers/base/BaseSearcher";
import type {
  SearchRequest,
  SearchProduct,
} from "@/core/domain/search/SearchProduct";
import type {
  SearchConfig,
  SearchStrategyConfig,
  PlaywrightApiStrategy,
  ApiInterceptConfig,
} from "@/core/domain/search/SearchConfig";
import { logger } from "@/config/logger";
import { BROWSER_ARGS } from "@/config/BrowserArgs";

// Stealth 플러그인 적용
const stealth = StealthPlugin();
chromium.use(stealth);

/**
 * API 인터셉트 결과
 */
export interface ApiInterceptResult<T = unknown> {
  data: T;
  totalCount: number;
}

/**
 * Playwright API Searcher Base Class
 */
export abstract class PlaywrightApiSearcher<
  TApiResponse = unknown,
> extends BaseSearcher<TApiResponse, SearchConfig> {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;

  constructor(config: SearchConfig, strategy: SearchStrategyConfig) {
    super(config, strategy);
  }

  /**
   * Playwright 전략 설정 반환
   */
  protected get playwrightStrategy(): PlaywrightApiStrategy {
    if (!this.strategy.playwright) {
      throw new Error("Playwright strategy configuration is required");
    }
    return this.strategy.playwright;
  }

  /**
   * API 인터셉트 설정 반환
   */
  protected get apiConfig(): ApiInterceptConfig {
    if (!this.strategy.api) {
      throw new Error("API intercept configuration is required");
    }
    return this.strategy.api;
  }

  /**
   * 초기화 (독립 브라우저 생성)
   * 각 플랫폼이 독립적으로 브라우저를 생성하여 격리된 환경에서 실행
   */
  protected async doInitialize(): Promise<void> {
    // 브라우저 직접 생성 (Pool 사용 안함)
    this.browser = await chromium.launch({
      headless: this.playwrightStrategy.headless,
      args: BROWSER_ARGS.DEFAULT,
    });

    // Context 생성 (모바일 설정)
    this.context = await this.browser.newContext({
      viewport: this.playwrightStrategy.viewport,
      isMobile: this.playwrightStrategy.isMobile,
      hasTouch: this.playwrightStrategy.hasTouch,
      deviceScaleFactor: this.playwrightStrategy.deviceScaleFactor,
      userAgent: this.playwrightStrategy.userAgent,
    });

    this.page = await this.context.newPage();

    logger.debug(
      { platform: this.config.platform },
      "PlaywrightApiSearcher initialized (independent browser)",
    );
  }

  /**
   * 검색 실행 (API 인터셉트)
   */
  protected async doSearch(request: SearchRequest): Promise<TApiResponse> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const interceptPattern = this.apiConfig.interceptPattern;
    const page = this.page;
    const timeout = this.apiConfig.responseTimeout;

    // 결과 저장을 위한 wrapper
    let apiResponse: TApiResponse | null = null;
    let timeoutError: Error | null = null;
    let responseHandler: ((response: Response) => void) | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    // Response handler 설정
    const setupResponseHandler = (): Promise<void> => {
      return new Promise((resolveSetup) => {
        responseHandler = async (response: Response) => {
          if (resolved) return;

          const url = response.url();

          // 패턴 매칭
          if (url.includes(interceptPattern)) {
            // excludePattern 체크
            if (
              this.apiConfig.excludePattern &&
              url.includes(this.apiConfig.excludePattern)
            ) {
              return;
            }

            try {
              const json = await response.json();
              if (!resolved) {
                resolved = true;
                if (timeoutId) {
                  clearTimeout(timeoutId);
                  timeoutId = null;
                }
                apiResponse = json as TApiResponse;
              }
            } catch (error) {
              logger.warn({ url, error }, "API 응답 파싱 실패");
            }
          }
        };

        page.on("response", responseHandler);
        resolveSetup();
      });
    };

    // Timeout 설정
    const startTimeout = (): void => {
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          timeoutError = new Error(`API response timeout (${timeout}ms)`);
        }
      }, timeout);
    };

    // 정리 함수
    const cleanup = (): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (responseHandler && page) {
        try {
          page.off("response", responseHandler);
        } catch {
          // 무시
        }
        responseHandler = null;
      }
    };

    try {
      // 1. Response handler 설정
      await setupResponseHandler();

      // 2. Timeout 시작
      startTimeout();

      // 3. 네비게이션 실행
      await this.executeNavigation(request);

      // 4. 결과 대기 (polling)
      const pollInterval = 100;
      const maxPolls = Math.ceil(timeout / pollInterval) + 10;
      let polls = 0;

      while (!resolved && polls < maxPolls) {
        await this.sleep(pollInterval);
        polls++;
      }

      // 5. 결과 확인
      cleanup();

      if (timeoutError) {
        throw timeoutError;
      }

      if (!apiResponse) {
        throw new Error("Failed to intercept API response");
      }

      return apiResponse;
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  /**
   * 네비게이션 실행
   */
  protected async executeNavigation(request: SearchRequest): Promise<void> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const variables = {
      keyword: request.keyword,
      encodedKeyword: encodeURIComponent(request.keyword),
    };

    for (const step of this.apiConfig.navigation) {
      switch (step.action) {
        case "goto": {
          const url = this.replaceVariables(step.url || "", variables);
          await this.page.goto(url, {
            waitUntil: step.waitUntil || "domcontentloaded",
            timeout: step.timeout || 30000,
          });
          break;
        }

        case "wait": {
          await this.sleep(step.timeout || 1000);
          break;
        }

        case "fill": {
          if (step.selector) {
            const value = this.replaceVariables(step.value || "", variables);
            await this.page.locator(step.selector).first().fill(value);
          }
          break;
        }

        case "click": {
          if (step.selector) {
            await this.page.locator(step.selector).first().click();
          }
          break;
        }

        case "press": {
          if (step.key) {
            await this.page.keyboard.press(step.key);
          }
          break;
        }

        default:
          logger.warn({ action: step.action }, "Unknown navigation action");
      }
    }
  }

  /**
   * 리소스 정리
   * 브라우저를 직접 종료하여 리소스 완전 해제
   */
  async cleanup(): Promise<void> {
    try {
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

      // initialized 플래그 리셋
      this.initialized = false;

      logger.debug(
        { platform: this.config.platform },
        "PlaywrightApiSearcher cleanup completed (browser closed)",
      );
    } catch (error) {
      logger.warn({ error }, "PlaywrightApiSearcher cleanup failed");
    }
  }

  /**
   * API 응답 파싱 (하위 클래스에서 구현)
   * 플랫폼별 응답 구조가 다르므로 추상 메서드로 정의
   */
  protected abstract parseApiResponse(
    response: TApiResponse,
    limit: number,
  ): SearchProduct[];

  /**
   * 총 결과 수 추출 (하위 클래스에서 구현)
   */
  protected abstract extractTotalCountFromApi(response: TApiResponse): number;

  /**
   * parseResults 구현 (Template Method)
   */
  protected async parseResults(
    rawData: TApiResponse,
    limit: number,
  ): Promise<SearchProduct[]> {
    return this.parseApiResponse(rawData, limit);
  }

  /**
   * extractTotalCount 구현 (Template Method)
   */
  protected extractTotalCount(rawData: TApiResponse): number {
    return this.extractTotalCountFromApi(rawData);
  }
}

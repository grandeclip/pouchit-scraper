/**
 * ScanProductNode - Phase 4 Typed Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 브라우저 스캔만 담당
 * - OCP: 설정 기반 확장 가능
 * - DIP: IBrowserController, BrowserPool 인터페이스에 의존
 *
 * 목적:
 * - Phase 3 BrowserController 활용한 상품 스캔
 * - 병렬 처리 지원 (BrowserPool)
 * - 메모리 관리 (Page/Context Rotation)
 */

import type { Browser, BrowserContext, Page } from "playwright";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  IValidationResult,
  createSuccessResult,
  createErrorResult,
  validationSuccess,
  validationFailure,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";
import { BrowserPool, BrowserPoolOptions } from "@/scanners/base/BrowserPool";
import { BrowserController } from "@/scrapers/controllers/BrowserController";
import { PlaywrightStrategyConfig } from "@/core/domain/StrategyConfig";
import { RateLimiter } from "@/utils/RateLimiter";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { BROWSER_ARGS } from "@/config/BrowserArgs";
import { ScanProductInput, ScanProductOutput, SingleScanResult } from "./types";

/**
 * ScanProductNode 설정
 */
export interface ScanProductNodeConfig {
  /** 기본 동시 실행 수 */
  default_concurrency: number;

  /** 최대 동시 실행 수 */
  max_concurrency: number;

  /** 기본 대기 시간 (ms) */
  default_wait_time_ms: number;

  /** Page Rotation 주기 */
  page_rotation_interval: number;

  /** Context Rotation 주기 */
  context_rotation_interval: number;

  /** 연속 실패 허용 횟수 */
  max_consecutive_failures: number;
}

/** 기본 스캔 타임아웃 (ms) */
const DEFAULT_SCAN_TIMEOUT = 30000;

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: ScanProductNodeConfig = {
  default_concurrency: 5,
  max_concurrency: 10,
  default_wait_time_ms: 3000,
  page_rotation_interval: 10,
  context_rotation_interval: 50,
  max_consecutive_failures: 2,
};

/**
 * ScanProductNode - 브라우저 스캔 노드
 */
export class ScanProductNode
  implements ITypedNodeStrategy<ScanProductInput, ScanProductOutput>
{
  public readonly type = "scan_product";
  public readonly name = "ScanProductNode";

  private readonly nodeConfig: ScanProductNodeConfig;
  private browserPool: BrowserPool | null = null;
  private rateLimiter: RateLimiter | null = null;

  constructor(config?: Partial<ScanProductNodeConfig>) {
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 노드 실행
   */
  async execute(
    input: ScanProductInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<ScanProductOutput>> {
    const { logger, platform, platformConfig, config } = context;

    // 입력 검증
    const validation = this.validate(input);
    if (!validation.valid) {
      return createErrorResult<ScanProductOutput>(
        validation.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        validation.errors,
      );
    }

    // Concurrency 설정
    const { concurrency, waitTimeMs } = this.resolveConcurrency(
      config,
      platformConfig,
    );

    logger.info(
      {
        type: this.type,
        platform,
        product_count: input.products.length,
        concurrency,
      },
      "스캔 시작",
    );

    try {
      // 리소스 초기화
      await this.initializeResources(concurrency, waitTimeMs);

      // 배치 분할
      const batches = this.splitIntoBatches(input.products, concurrency);

      logger.debug(
        {
          type: this.type,
          batch_count: batches.length,
          items_per_batch: batches.map((b) => b.length),
        },
        "배치 분할 완료",
      );

      // 결과 수집
      const allResults: SingleScanResult[] = [];

      // 병렬 실행
      await Promise.all(
        batches.map(async (batch, batchIndex) => {
          const batchResults = await this.scanBatch(batch, batchIndex, context);
          allResults.push(...batchResults);
        }),
      );

      // 결과 집계
      const successCount = allResults.filter((r) => r.success).length;
      const failureCount = allResults.filter((r) => !r.success).length;

      const output: ScanProductOutput = {
        results: allResults,
        success_count: successCount,
        failure_count: failureCount,
      };

      logger.info(
        {
          type: this.type,
          platform,
          total: allResults.length,
          success: successCount,
          failure: failureCount,
        },
        "스캔 완료",
      );

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          type: this.type,
          platform,
          error: message,
        },
        "스캔 실패",
      );

      return createErrorResult<ScanProductOutput>(
        message,
        "SCAN_PRODUCT_ERROR",
      );
    } finally {
      await this.cleanupResources();
    }
  }

  /**
   * 입력 검증
   */
  validate(input: ScanProductInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    if (!input.products || !Array.isArray(input.products)) {
      errors.push({
        field: "products",
        message: "products must be an array",
        code: "INVALID_PRODUCTS",
      });
    } else if (input.products.length === 0) {
      errors.push({
        field: "products",
        message: "products array cannot be empty",
        code: "EMPTY_PRODUCTS",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * 롤백
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info(
      { type: this.type },
      "Rollback - cleaning up resources",
    );
    await this.cleanupResources();
  }

  /**
   * 단일 배치 스캔
   */
  private async scanBatch(
    products: ProductSetSearchResult[],
    batchIndex: number,
    context: INodeContext,
  ): Promise<SingleScanResult[]> {
    const { logger, platform, platformConfig } = context;
    const results: SingleScanResult[] = [];

    if (!this.browserPool) {
      throw new Error("BrowserPool이 초기화되지 않음");
    }

    let browser: Browser | null = null;
    let browserContext: BrowserContext | null = null;
    let page: Page | null = null;
    let consecutiveFailures = 0;

    // Memory Management 설정
    const memoryConfig = platformConfig.workflow?.memory_management;
    const PAGE_ROTATION_INTERVAL =
      memoryConfig?.page_rotation_interval ??
      this.nodeConfig.page_rotation_interval;
    const CONTEXT_ROTATION_INTERVAL =
      memoryConfig?.context_rotation_interval ??
      this.nodeConfig.context_rotation_interval;

    try {
      // Browser 획득
      browser = await this.browserPool.acquireBrowser();

      // Context/Page 생성
      ({ context: browserContext, page } = await this.createBrowserContext(
        browser,
        platformConfig,
      ));

      for (let i = 0; i < products.length; i++) {
        const product = products[i];

        // Context Rotation
        if (i > 0 && i % CONTEXT_ROTATION_INTERVAL === 0) {
          logger.debug(
            { type: this.type, batchIndex, productIndex: i },
            "Context Rotation",
          );

          await this.rotateContext(
            browser,
            platformConfig,
            page,
            browserContext,
          );
          ({ context: browserContext, page } = await this.createBrowserContext(
            browser,
            platformConfig,
          ));
        }
        // Page Rotation
        else if (i > 0 && i % PAGE_ROTATION_INTERVAL === 0) {
          logger.debug(
            { type: this.type, batchIndex, productIndex: i },
            "Page Rotation",
          );

          if (page) {
            await page.close().catch(() => {});
          }
          page = await browserContext!.newPage();
        }

        // Rate Limiting
        if (i > 0 && this.rateLimiter) {
          await this.rateLimiter.throttle(`${this.type}:batch${batchIndex}`);
        }

        try {
          const result = await this.scanSingleProduct(product, page!, context);
          results.push(result);

          // 성공 시 연속 실패 카운터 리셋
          if (result.success) {
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);

          logger.error(
            {
              type: this.type,
              batchIndex,
              product_set_id: product.product_set_id,
              error: message,
            },
            "단일 상품 스캔 실패",
          );

          results.push(this.createFailedResult(product, message));
          consecutiveFailures++;
        }

        // Session Recovery: 연속 실패 시 Context 재생성
        if (consecutiveFailures >= this.nodeConfig.max_consecutive_failures) {
          logger.warn(
            {
              type: this.type,
              batchIndex,
              consecutiveFailures,
            },
            "연속 실패 - Context 재생성",
          );

          await this.rotateContext(
            browser,
            platformConfig,
            page,
            browserContext,
          );
          ({ context: browserContext, page } = await this.createBrowserContext(
            browser,
            platformConfig,
          ));
          consecutiveFailures = 0;
        }
      }
    } finally {
      // Context/Page 정리
      if (page) {
        await page.close().catch(() => {});
      }
      if (browserContext) {
        await browserContext.close().catch(() => {});
      }

      // Browser 반환
      if (browser && this.browserPool) {
        await this.browserPool.releaseBrowser(browser);
      }
    }

    return results;
  }

  /**
   * 단일 상품 스캔
   */
  private async scanSingleProduct(
    product: ProductSetSearchResult,
    page: Page,
    context: INodeContext,
  ): Promise<SingleScanResult> {
    const { logger, platform, platformConfig } = context;

    // URL 확인
    if (!product.link_url) {
      return this.createFailedResult(product, "No URL provided");
    }

    // Playwright 전략 찾기
    const strategies = platformConfig.strategies as
      | Array<{ type: string }>
      | undefined;
    const pwStrategy = strategies?.find((s) => s.type === "playwright") as
      | PlaywrightStrategyConfig
      | undefined;

    if (!pwStrategy) {
      return this.createFailedResult(product, "No playwright strategy found");
    }

    try {
      // BrowserController 생성 및 초기화
      const controller = new BrowserController();

      // 외부 Browser 사용 (이미 Page가 있으므로 새 Context 생성하지 않음)
      // Note: 이 경우 controller는 기존 page를 직접 사용
      // TODO: BrowserController에 setPage() 메서드 추가 필요

      // 직접 네비게이션 실행 (BrowserController 우회)
      const url = product.link_url;
      const navigationTimeout =
        pwStrategy.playwright?.navigationSteps?.[0]?.timeout ??
        DEFAULT_SCAN_TIMEOUT;

      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: navigationTimeout,
      });

      // DOM 추출 (플랫폼별 로직)
      // TODO: Extractor 연동
      const scannedData = await this.extractProductData(page, platform);

      if (!scannedData) {
        return {
          product_set_id: product.product_set_id,
          product_id: product.product_id,
          success: false,
          error: "Failed to extract product data",
          url: product.link_url,
          scanned_at: getTimestampWithTimezone(),
        };
      }

      return {
        product_set_id: product.product_set_id,
        product_id: product.product_id,
        success: true,
        scanned_data: scannedData,
        url: product.link_url,
        scanned_at: getTimestampWithTimezone(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.createFailedResult(product, message);
    }
  }

  /**
   * 상품 데이터 추출 (플랫폼별)
   * TODO: Phase 1 Extractor 연동으로 확장
   */
  private async extractProductData(
    page: Page,
    platform: string,
  ): Promise<SingleScanResult["scanned_data"] | null> {
    try {
      // 기본 추출 로직 (플랫폼별 확장 필요)
      const data = await page.evaluate(() => {
        // 공통 셀렉터 시도
        const name =
          document.querySelector("h1")?.textContent?.trim() ||
          document.querySelector("[class*='name']")?.textContent?.trim() ||
          document.querySelector("[class*='title']")?.textContent?.trim() ||
          "";

        const thumbnail =
          document.querySelector("img[src*='product']")?.getAttribute("src") ||
          document
            .querySelector("[class*='thumbnail'] img")
            ?.getAttribute("src") ||
          document.querySelector("[class*='image'] img")?.getAttribute("src") ||
          "";

        const priceText =
          document.querySelector("[class*='price']")?.textContent || "0";
        const price = parseInt(priceText.replace(/[^0-9]/g, ""), 10) || 0;

        return {
          product_name: name,
          thumbnail: thumbnail,
          original_price: price,
          discounted_price: price,
          sale_status: "on_sale",
        };
      });

      return data.product_name ? data : null;
    } catch {
      return null;
    }
  }

  /**
   * 실패 결과 생성
   */
  private createFailedResult(
    product: ProductSetSearchResult,
    error: string,
  ): SingleScanResult {
    return {
      product_set_id: product.product_set_id,
      product_id: product.product_id,
      success: false,
      error,
      url: product.link_url,
      scanned_at: getTimestampWithTimezone(),
    };
  }

  /**
   * Context Rotation 헬퍼
   */
  private async rotateContext(
    browser: Browser,
    platformConfig: INodeContext["platformConfig"],
    page: Page | null,
    context: BrowserContext | null,
  ): Promise<void> {
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
  }

  /**
   * Browser Context 생성
   */
  private async createBrowserContext(
    browser: Browser,
    platformConfig: INodeContext["platformConfig"],
  ): Promise<{ context: BrowserContext; page: Page }> {
    const strategies = platformConfig.strategies as
      | Array<{ type: string }>
      | undefined;
    const pwStrategy = strategies?.find((s) => s.type === "playwright") as
      | PlaywrightStrategyConfig
      | undefined;

    const contextOptions = pwStrategy?.playwright?.contextOptions || {};

    const context = await browser.newContext({
      viewport: contextOptions.viewport || { width: 1920, height: 1080 },
      userAgent: contextOptions.userAgent,
      locale: contextOptions.locale || "ko-KR",
      timezoneId: contextOptions.timezoneId || "Asia/Seoul",
      isMobile: contextOptions.isMobile || false,
    });

    // Anti-detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    const page = await context.newPage();
    return { context, page };
  }

  /**
   * Concurrency 설정 해석
   */
  private resolveConcurrency(
    config: Record<string, unknown>,
    platformConfig: INodeContext["platformConfig"],
  ): { concurrency: number; waitTimeMs: number } {
    const waitTimeMs =
      platformConfig.workflow?.rate_limit?.wait_time_ms ??
      this.nodeConfig.default_wait_time_ms;

    const maxConcurrency =
      platformConfig.workflow?.concurrency?.max ??
      this.nodeConfig.max_concurrency;

    const requestedConcurrency =
      (config.concurrency as number) ||
      platformConfig.workflow?.concurrency?.default ||
      this.nodeConfig.default_concurrency;

    const concurrency = Math.min(requestedConcurrency, maxConcurrency);

    return { concurrency, waitTimeMs };
  }

  /**
   * 리소스 초기화
   */
  private async initializeResources(
    concurrency: number,
    waitTimeMs: number,
  ): Promise<void> {
    // Browser Pool 초기화
    this.browserPool = BrowserPool.getInstance({
      poolSize: concurrency,
      browserOptions: {
        headless: true,
        args: BROWSER_ARGS.DEFAULT,
      },
    });

    await this.browserPool.initialize();

    // Rate Limiter 초기화
    this.rateLimiter = new RateLimiter(waitTimeMs);
  }

  /**
   * 리소스 정리
   */
  private async cleanupResources(): Promise<void> {
    if (this.browserPool) {
      await this.browserPool.cleanup();
      this.browserPool = null;
    }
    this.rateLimiter = null;
  }

  /**
   * 배치 분할
   */
  private splitIntoBatches<T>(items: T[], batchCount: number): T[][] {
    if (batchCount <= 0 || items.length === 0) {
      return [items];
    }

    const batchSize = Math.ceil(items.length / batchCount);
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }
}

/**
 * Base Validation Node Strategy (Abstract)
 *
 * SOLID 원칙:
 * - SRP: 검증 워크플로우만 담당
 * - OCP: 플랫폼별 확장 가능
 * - LSP: 모든 구현체는 동일한 인터페이스 제공
 * - DIP: 추상 메서드에 의존
 *
 * Design Pattern:
 * - Template Method Pattern: 공통 워크플로우 정의, 플랫폼별 구현 위임
 *
 * 목적:
 * - ValidationNode 간 코드 중복 제거 (DRY)
 * - 병렬 처리 + Streaming Write 통합
 * - Browser Pool, Rate Limiting, Screenshot 통합
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { ConfigLoader } from "@/config/ConfigLoader";
import type { PlatformConfig } from "@/core/domain/PlatformConfig";
import { logger } from "@/config/logger";
import { logImportant } from "@/utils/logger-context";
import { BrowserPool } from "@/scanners/base/BrowserPool";
import type { Browser, BrowserContext, Page } from "playwright";
import { SCRAPER_CONFIG } from "@/config/constants";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { RateLimiter } from "@/utils/RateLimiter";
import { ScreenshotService } from "@/utils/ScreenshotService";
import { BROWSER_ARGS } from "@/config/BrowserArgs";

/**
 * Validation Config (공통)
 */
export const VALIDATION_CONFIG = {
  /** 기본 최대 동시 실행 수 */
  DEFAULT_MAX_CONCURRENCY: 10,
  /** 연속 실패 허용 횟수 (Session Recovery 임계값) */
  MAX_CONSECUTIVE_FAILURES: parseInt(
    process.env.VALIDATION_MAX_CONSECUTIVE_FAILURES || "2",
    10,
  ),
  /** 스크린샷 저장 디렉토리 */
  SCREENSHOT_OUTPUT_DIR: process.env.SCREENSHOT_OUTPUT_DIR || "/app/results",
} as const;

/**
 * 단일 상품 검증 결과 (공통)
 */
export interface ProductValidationResult {
  [key: string]: unknown; // 인덱스 시그니처 (StreamingResultWriter 호환성)
  product_set_id: string;
  product_id: string;
  url: string | null;
  db: {
    product_name: string | null;
    thumbnail?: string | null;
    original_price?: number | null;
    discounted_price?: number | null;
    sale_status?: string | null;
  };
  fetch: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  } | null;
  comparison: {
    product_name: boolean;
    thumbnail: boolean;
    original_price: boolean;
    discounted_price: boolean;
    sale_status: boolean;
  };
  match: boolean;
  status: "success" | "failed" | "not_found";
  error?: string;
  validated_at: string;
}

/**
 * 플랫폼별 상품 데이터 (인터페이스)
 */
export interface PlatformProductData {
  productName: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: string;
}

/**
 * Base Validation Node Strategy (추상 클래스)
 */
export abstract class BaseValidationNode implements INodeStrategy {
  public abstract readonly type: string;
  protected configLoader: ConfigLoader;
  protected browserPool: BrowserPool | null = null;
  protected platformConfig: PlatformConfig | null = null;
  protected rateLimiter: RateLimiter | null = null;
  protected screenshotService: ScreenshotService | null = null;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * 노드 실행 (Template Method)
   * 공통 워크플로우 정의, 플랫폼별 구현 위임
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { input, params, config, workflow_id } = context;

    // Platform ID 추출
    const platform = this.extractPlatform(params);

    // 이전 노드 결과 검증
    const products = this.extractProductsFromInput(input);
    if (!products) {
      return this.createErrorResult(
        "No products found from previous node",
        "MISSING_INPUT_DATA",
      );
    }

    // Platform Config 로드
    this.platformConfig = this.configLoader.loadConfig(
      platform,
    ) as PlatformConfig;

    // Concurrency 설정
    const { concurrency, waitTimeMs } = this.resolveConcurrency(
      config,
      this.platformConfig,
    );

    logger.info(
      { type: this.type, count: products.length, concurrency },
      "병렬 검증 시작",
    );

    try {
      // 초기화
      await this.initializeResources(concurrency, waitTimeMs);

      const jobId = context.job_id;

      // StreamingResultWriter 초기화
      const outputDir = config.output_dir
        ? String(config.output_dir)
        : process.env.RESULT_OUTPUT_DIR || "/app/results";

      const streamWriter = new StreamingResultWriter({
        outputDir,
        platform,
        jobId,
        workflowId: workflow_id,
        useDateSubdir: true,
      });

      await streamWriter.initialize();

      // 배치 분할 및 병렬 실행
      const batches = this.splitIntoBatches(products, concurrency);

      logger.debug(
        {
          type: this.type,
          batchCount: batches.length,
          itemsPerBatch: batches.map((b) => b.length),
        },
        "배치 분할 완료",
      );

      // 병렬 실행: 배치별 독립 Browser 사용 (Pool에서 획득)
      await Promise.all(
        batches.map(async (batch, index) => {
          return this.validateBatchWithPool(
            batch,
            index,
            platform,
            waitTimeMs,
            jobId,
            streamWriter,
          );
        }),
      );

      // 최종 Summary 계산 및 파일 닫기
      const result = await streamWriter.finalize();

      logImportant(logger, `[${this.type}] 전체 검증 완료`, {
        summary: result.summary,
      });

      return {
        success: true,
        data: {
          [`${platform}_validation`]: {
            jsonl_path: result.filePath,
            summary: result.summary,
            record_count: result.recordCount,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ type: this.type, error: message }, "검증 실패");

      return this.createErrorResult(
        message,
        `${platform.toUpperCase()}_VALIDATION_ERROR`,
      );
    } finally {
      // Browser Pool 정리
      await this.cleanupResources();
    }
  }

  /**
   * Platform ID 추출 (Hook Method)
   */
  protected abstract extractPlatform(params: Record<string, unknown>): string;

  /**
   * 상품 ID 추출 (Abstract Method - 플랫폼별 구현)
   */
  protected abstract extractProductId(linkUrl: string): string | null;

  /**
   * 상품 검증 (Abstract Method - 플랫폼별 구현)
   */
  protected abstract validateProductWithPage(
    product: ProductSetSearchResult,
    page: Page,
    platformConfig: PlatformConfig,
  ): Promise<ProductValidationResult>;

  /**
   * 상품 비교 (공통 로직)
   */
  protected compareProducts(
    supabase: ProductSetSearchResult,
    platformData: PlatformProductData,
  ): ProductValidationResult {
    const comparison = {
      product_name: supabase.product_name === platformData.productName,
      thumbnail: supabase.thumbnail === platformData.thumbnail,
      original_price: supabase.original_price === platformData.originalPrice,
      discounted_price:
        supabase.discounted_price === platformData.discountedPrice,
      sale_status: supabase.sale_status === platformData.saleStatus,
    };

    // 모든 필드가 true인지 확인
    const match = Object.values(comparison).every((value) => value === true);

    return {
      product_set_id: supabase.product_set_id,
      product_id: supabase.product_id,
      url: supabase.link_url,
      db: {
        product_name: supabase.product_name,
        thumbnail: supabase.thumbnail,
        original_price: supabase.original_price,
        discounted_price: supabase.discounted_price,
        sale_status: supabase.sale_status,
      },
      fetch: {
        product_name: platformData.productName,
        thumbnail: platformData.thumbnail,
        original_price: platformData.originalPrice,
        discounted_price: platformData.discountedPrice,
        sale_status: platformData.saleStatus,
      },
      comparison,
      match,
      status: "success",
      validated_at: getTimestampWithTimezone(),
    };
  }

  /**
   * 실패 검증 결과 생성 (공통)
   */
  protected createFailedValidation(
    product: ProductSetSearchResult,
    errorMessage: string,
  ): ProductValidationResult {
    return {
      product_set_id: product.product_set_id,
      product_id: product.product_id,
      url: product.link_url,
      db: {
        product_name: product.product_name,
        thumbnail: product.thumbnail,
        original_price: product.original_price,
        discounted_price: product.discounted_price,
        sale_status: product.sale_status,
      },
      fetch: null,
      comparison: {
        product_name: false,
        thumbnail: false,
        original_price: false,
        discounted_price: false,
        sale_status: false,
      },
      match: false,
      status: "failed",
      error: errorMessage,
      validated_at: getTimestampWithTimezone(),
    };
  }

  /**
   * Not Found 검증 결과 생성 (공통)
   */
  protected createNotFoundValidation(
    product: ProductSetSearchResult,
    platformName: string,
  ): ProductValidationResult {
    return {
      ...this.createFailedValidation(
        product,
        `Product not found in ${platformName}`,
      ),
      status: "not_found",
    };
  }

  /**
   * 이전 노드 결과에서 상품 목록 추출 (공통)
   */
  private extractProductsFromInput(
    input: Record<string, unknown>,
  ): ProductSetSearchResult[] | null {
    const supabaseResult = input.supabase_search as
      | { products: ProductSetSearchResult[]; count: number }
      | undefined;

    if (!supabaseResult || !supabaseResult.products) {
      return null;
    }

    return supabaseResult.products;
  }

  /**
   * Concurrency 설정 해석 (공통)
   */
  private resolveConcurrency(
    config: Record<string, unknown>,
    platformConfig: PlatformConfig,
  ): { concurrency: number; waitTimeMs: number } {
    const waitTimeMs =
      platformConfig.workflow?.rate_limit?.wait_time_ms || 3000;
    const maxConcurrency =
      platformConfig.workflow?.concurrency?.max ||
      VALIDATION_CONFIG.DEFAULT_MAX_CONCURRENCY;

    // Concurrency 설정: config → YAML default → 1 (순차)
    const requestedConcurrency =
      (config.concurrency as number) ||
      platformConfig.workflow?.concurrency?.default ||
      1;
    const concurrency = Math.min(requestedConcurrency, maxConcurrency);

    // Concurrency 제한 경고
    if (requestedConcurrency > maxConcurrency) {
      logger.warn(
        {
          type: this.type,
          requested: requestedConcurrency,
          max: maxConcurrency,
          applied: concurrency,
        },
        "Concurrency 제한 적용됨",
      );
    }

    return { concurrency, waitTimeMs };
  }

  /**
   * 리소스 초기화 (Browser Pool, Rate Limiter, Screenshot Service)
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

    // Screenshot Service 초기화
    this.screenshotService = new ScreenshotService(
      VALIDATION_CONFIG.SCREENSHOT_OUTPUT_DIR,
    );
  }

  /**
   * 리소스 정리 (Browser Pool)
   */
  private async cleanupResources(): Promise<void> {
    if (this.browserPool) {
      await this.browserPool.cleanup();
      this.browserPool = null;
    }
  }

  /**
   * 상품 목록을 N개 배치로 분할 (공통)
   */
  private splitIntoBatches<T>(items: T[], batchCount: number): T[][] {
    if (batchCount <= 0) {
      throw new Error("batchCount must be positive");
    }

    if (batchCount === 1) {
      return [items];
    }

    const batchSize = Math.ceil(items.length / batchCount);
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Browser Pool을 사용한 단일 배치 검증 (Session Recovery 포함)
   *
   * 메모리 누수 방지:
   * - Page Rotation: 10개마다 Page 재생성 (메모리 정리)
   * - Context 유지: Context는 배치당 1개 유지 (성능 최적화)
   */
  private async validateBatchWithPool(
    products: ProductSetSearchResult[],
    batchIndex: number,
    platform: string,
    waitTimeMs: number,
    jobId: string | undefined,
    streamWriter: StreamingResultWriter,
  ): Promise<void> {
    if (!this.browserPool) {
      throw new Error("BrowserPool이 초기화되지 않음");
    }

    let consecutiveFailures = 0;
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    // Memory Management 설정 (YAML에서 로드)
    const memoryConfig = this.platformConfig?.workflow?.memory_management;
    const PAGE_ROTATION_INTERVAL = memoryConfig?.page_rotation_interval || 10;
    const CONTEXT_ROTATION_INTERVAL =
      memoryConfig?.context_rotation_interval || 50;
    const ENABLE_GC_HINTS = memoryConfig?.enable_gc_hints ?? true;

    logger.debug(
      {
        type: this.type,
        batchIndex,
        count: products.length,
        pageRotation: PAGE_ROTATION_INTERVAL,
        contextRotation: CONTEXT_ROTATION_INTERVAL,
      },
      "배치 검증 시작 (Browser Pool 사용)",
    );

    try {
      // Browser 획득
      browser = await this.browserPool.acquireBrowser();

      // Context 생성 (배치당 1개 유지)
      ({ context, page } = await this.createBrowserContext(browser));

      for (let i = 0; i < products.length; i++) {
        const product = products[i];

        // Context Rotation: N개마다 Context 재생성 (장기 실행 메모리 누수 방지)
        if (i > 0 && i % CONTEXT_ROTATION_INTERVAL === 0) {
          logger.debug(
            { type: this.type, batchIndex, productIndex: i },
            `Context Rotation: ${CONTEXT_ROTATION_INTERVAL}개 처리 완료 - Context 재생성`,
          );

          // 기존 Context/Page 정리
          if (page) {
            await page.close().catch(() => {});
            page = null;
          }
          if (context) {
            await context.close().catch(() => {});
            context = null;
          }

          // V8 GC 힌트 (메모리 정리 유도)
          if (ENABLE_GC_HINTS && global.gc) {
            global.gc();
            logger.debug(
              { type: this.type, batchIndex, productIndex: i },
              "V8 GC 힌트 실행",
            );
          }

          // 새 Context/Page 생성
          ({ context, page } = await this.createBrowserContext(browser));

          logger.debug(
            { type: this.type, batchIndex, productIndex: i },
            "Context 재생성 완료",
          );
        }
        // Page Rotation: N개마다 Page 재생성 (메모리 정리)
        else if (i > 0 && i % PAGE_ROTATION_INTERVAL === 0) {
          logger.debug(
            { type: this.type, batchIndex, productIndex: i },
            `Page Rotation: ${PAGE_ROTATION_INTERVAL}개 처리 완료 - Page 재생성`,
          );

          // 기존 Page 정리
          if (page) {
            await page.close().catch(() => {});
          }

          // 새 Page 생성 (Context는 유지)
          page = await context.newPage();

          logger.debug(
            { type: this.type, batchIndex, productIndex: i },
            "Page 재생성 완료",
          );
        }

        // Rate Limiting
        if (i > 0 && this.rateLimiter) {
          await this.rateLimiter.throttle(`${this.type}:batch${batchIndex}`);
        }

        try {
          const validation = await this.validateProductWithPage(
            product,
            page,
            this.platformConfig!,
          );

          // Streaming write (실시간 저장)
          await streamWriter.append(validation);

          // 상품별 검증 결과 즉시 출력
          logImportant(logger, `[${this.type}] 상품 검증 완료`, {
            product_set_id: product.product_set_id,
            url: product.link_url,
            status: validation.status,
            ...(validation.status === "failed" && { error: validation.error }),
            ...(validation.status === "success" && {
              match: validation.match,
            }),
          });

          // 스크린샷 저장
          if (jobId && this.screenshotService) {
            await this.screenshotService.capture(page, {
              platform,
              jobId,
              productSetId: product.product_set_id,
            });
          }

          // 성공 시 연속 실패 카운터 리셋
          consecutiveFailures = 0;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(
            {
              type: this.type,
              batchIndex,
              productSetId: product.product_set_id,
              error: message,
            },
            "상품 검증 실패",
          );

          const failedValidation = this.createFailedValidation(
            product,
            message,
          );
          await streamWriter.append(failedValidation);

          // 스크린샷 저장 (실패)
          if (jobId && this.screenshotService) {
            await this.screenshotService.capture(page, {
              platform,
              jobId,
              productSetId: product.product_set_id,
            });
          }

          // 연속 실패 카운터 증가
          consecutiveFailures++;

          // Session Recovery: 연속 N회 실패 시 재시작
          if (
            consecutiveFailures >= VALIDATION_CONFIG.MAX_CONSECUTIVE_FAILURES
          ) {
            logger.warn(
              {
                type: this.type,
                batchIndex,
                consecutiveFailures,
                threshold: VALIDATION_CONFIG.MAX_CONSECUTIVE_FAILURES,
              },
              "연속 실패 임계값 도달 - Browser/Context 재시작",
            );

            // 기존 Context/Page 정리
            if (page) {
              await page.close().catch(() => {});
              page = null;
            }
            if (context) {
              await context.close().catch(() => {});
              context = null;
            }

            // 새 Context/Page 생성
            ({ context, page } = await this.createBrowserContext(browser));

            // 카운터 리셋
            consecutiveFailures = 0;

            logger.info(
              { type: this.type, batchIndex },
              "Browser/Context 재시작 완료",
            );
          }
        }
      }

      logger.info(
        { type: this.type, batchIndex, count: products.length },
        "배치 검증 완료",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { type: this.type, batchIndex, error: message },
        "배치 검증 중 치명적 오류 발생",
      );

      logger.warn(
        { type: this.type, batchIndex },
        "치명적 오류로 인한 나머지 상품 실패 처리 생략 (이미 처리된 항목은 파일에 저장됨)",
      );
    } finally {
      // Context/Page 정리
      if (page) {
        await page.close().catch((error) => {
          logger.warn({ type: this.type, batchIndex, error }, "Page 종료 실패");
        });
      }
      if (context) {
        await context.close().catch((error) => {
          logger.warn(
            { type: this.type, batchIndex, error },
            "Context 종료 실패",
          );
        });
      }

      // Browser 반환 (Pool로)
      if (browser) {
        await this.browserPool.releaseBrowser(browser);
      }
    }
  }

  /**
   * Browser에서 Context/Page 생성 (공통)
   */
  private async createBrowserContext(browser: Browser): Promise<{
    context: BrowserContext;
    page: Page;
  }> {
    // Platform Config에서 설정 가져오기
    const pwStrategy = this.platformConfig?.strategies?.find(
      (s: { type: string }) => s.type === "playwright",
    );
    const contextOptions = pwStrategy?.playwright?.contextOptions || {};

    // Context 생성
    const context = await browser.newContext({
      viewport: contextOptions.viewport || SCRAPER_CONFIG.DEFAULT_VIEWPORT,
      userAgent: contextOptions.userAgent || SCRAPER_CONFIG.DEFAULT_USER_AGENT,
      locale: contextOptions.locale || "ko-KR",
      timezoneId: contextOptions.timezoneId || "Asia/Seoul",
      isMobile: contextOptions.isMobile || false,
      hasTouch: contextOptions.hasTouch || false,
      deviceScaleFactor: contextOptions.deviceScaleFactor || 1,
    });

    // Anti-detection 설정
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    // Page 생성
    const page = await context.newPage();

    return { context, page };
  }

  /**
   * 에러 결과 생성 (공통)
   */
  private createErrorResult(message: string, code: string): NodeResult {
    return {
      success: false,
      data: {},
      error: {
        message,
        code,
      },
    };
  }

  /**
   * Config 검증 (공통)
   */
  validateConfig(config: Record<string, unknown>): void {
    if (
      config.strategy_id !== undefined &&
      typeof config.strategy_id !== "string"
    ) {
      throw new Error("strategy_id must be a string");
    }

    if (config.concurrency !== undefined) {
      const concurrency = config.concurrency as number;
      if (typeof concurrency !== "number" || concurrency <= 0) {
        throw new Error("concurrency must be a positive number");
      }
    }

    if (config.timeout_ms !== undefined) {
      const timeoutMs = config.timeout_ms as number;
      if (typeof timeoutMs !== "number" || timeoutMs <= 0) {
        throw new Error("timeout_ms must be a positive number");
      }
    }
  }
}

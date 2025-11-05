/**
 * Oliveyoung Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 올리브영 검증 및 비교만 담당
 * - DIP: OliveyoungScanService에 의존
 * - Strategy Pattern: INodeStrategy 구현
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
import { OliveyoungConfig } from "@/core/domain/OliveyoungConfig";
import { SCRAPER_CONFIG } from "@/config/constants";
import * as path from "path";
import * as fs from "fs/promises";
import { PlaywrightScriptExecutor } from "@/utils/PlaywrightScriptExecutor";
import {
  OliveyoungProduct,
  OliveyoungDomSaleStatus,
} from "@/core/domain/OliveyoungProduct";

/**
 * 단일 상품 검증 결과
 */
interface ProductValidationResult {
  product_set_id: string;
  product_id: string;
  url: string | null; // 검증 시도한 link_url
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
 * Validation Node 설정
 */
const VALIDATION_CONFIG = {
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
 * Oliveyoung Validation Node Strategy
 */
export class OliveyoungValidationNode implements INodeStrategy {
  public readonly type = "oliveyoung_validation";
  private configLoader: ConfigLoader;
  private browserPool: BrowserPool | null = null;
  private platformConfig: PlatformConfig | null = null;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * 노드 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { input, params, config } = context;

    // Platform ID 추출 (params 우선, 없으면 "oliveyoung")
    const platform = (params.platform as string) || "oliveyoung";

    // 이전 노드(SupabaseSearchNode)의 결과 가져오기
    const supabaseResult = input.supabase_search as
      | { products: ProductSetSearchResult[]; count: number }
      | undefined;

    if (!supabaseResult || !supabaseResult.products) {
      return {
        success: false,
        data: {},
        error: {
          message: "No products found from previous node",
          code: "MISSING_INPUT_DATA",
        },
      };
    }

    const products = supabaseResult.products;

    // Platform Config에서 설정 로드
    this.platformConfig = this.configLoader.loadConfig(
      platform,
    ) as PlatformConfig;
    const waitTimeMs =
      this.platformConfig.workflow?.rate_limit?.wait_time_ms || 3000;
    const maxConcurrency =
      this.platformConfig.workflow?.concurrency?.max ||
      VALIDATION_CONFIG.DEFAULT_MAX_CONCURRENCY;

    // Concurrency 설정: config → YAML default → 1 (순차)
    const requestedConcurrency =
      (config.concurrency as number) ||
      this.platformConfig.workflow?.concurrency?.default ||
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

    logger.info(
      { type: this.type, count: products.length, concurrency },
      "병렬 검증 시작",
    );

    try {
      // Browser Pool 초기화
      this.browserPool = BrowserPool.getInstance({
        poolSize: concurrency,
        browserOptions: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
          ],
        },
      });

      await this.browserPool.initialize();

      // Job ID 추출 (스크린샷 파일명에 사용)
      const jobId = context.job_id;

      // 배치 분할
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
      const batchResults = await Promise.all(
        batches.map(async (batch, index) => {
          return this.validateBatchWithPool(
            batch,
            index,
            platform,
            this.platformConfig! as OliveyoungConfig,
            waitTimeMs,
            jobId,
          );
        }),
      );

      // 결과 병합
      const validations = batchResults.flat();
      const summary = this.calculateSummary(validations);

      logImportant(logger, `[${this.type}] 전체 검증 완료`, { summary });

      return {
        success: true,
        data: {
          oliveyoung_validation: {
            validations,
            summary,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ type: this.type, error: message }, "검증 실패");

      return {
        success: false,
        data: {},
        error: {
          message,
          code: "OLIVEYOUNG_VALIDATION_ERROR",
        },
      };
    } finally {
      // Browser Pool 정리
      if (this.browserPool) {
        await this.browserPool.cleanup();
        this.browserPool = null;
      }
    }
  }

  /**
   * 상품 목록을 N개 배치로 분할
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
   */
  private async validateBatchWithPool(
    products: ProductSetSearchResult[],
    batchIndex: number,
    platform: string,
    platformConfig: OliveyoungConfig,
    waitTimeMs: number,
    jobId?: string,
  ): Promise<ProductValidationResult[]> {
    if (!this.browserPool) {
      throw new Error("BrowserPool이 초기화되지 않음");
    }

    const validations: ProductValidationResult[] = [];
    let consecutiveFailures = 0;
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    logger.debug(
      { type: this.type, batchIndex, count: products.length },
      "배치 검증 시작 (Browser Pool 사용)",
    );

    try {
      // Browser 획득
      browser = await this.browserPool.acquireBrowser();

      // Context/Page 생성
      ({ context, page } = await this.createBrowserContext(browser));

      for (let i = 0; i < products.length; i++) {
        const product = products[i];

        // Rate Limiting
        if (i > 0) {
          await this.sleep(waitTimeMs);
        }

        try {
          const validation = await this.validateProductWithPage(
            product,
            page,
            platformConfig,
          );
          validations.push(validation);

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

          // 스크린샷 저장 (성공)
          if (jobId) {
            await this.takeScreenshot(
              page,
              jobId,
              product.product_set_id,
              false,
            );
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
          validations.push(this.createFailedValidation(product, message));

          // 스크린샷 저장 (실패)
          if (jobId) {
            await this.takeScreenshot(
              page,
              jobId,
              product.product_set_id,
              true,
            );
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
        { type: this.type, batchIndex, count: validations.length },
        "배치 검증 완료",
      );

      return validations;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { type: this.type, batchIndex, error: message },
        "배치 검증 중 치명적 오류 발생",
      );

      // 실패한 상품들에 대해 모두 실패 처리
      const remaining = products.slice(validations.length);
      return [
        ...validations,
        ...remaining.map((p) => this.createFailedValidation(p, message)),
      ];
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
   * Browser에서 Context/Page 생성
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
      // @ts-expect-error - Browser context에서 실행되는 코드
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    // Page 생성
    const page = await context.newPage();

    return { context, page };
  }

  /**
   * Page를 사용한 단일 상품 검증
   */
  private async validateProductWithPage(
    product: ProductSetSearchResult,
    page: Page,
    platformConfig: OliveyoungConfig,
  ): Promise<ProductValidationResult> {
    try {
      // link_url에서 goodsNo 추출
      if (!product.link_url) {
        return this.createFailedValidation(product, "link_url is null");
      }

      const goodsNo = this.extractGoodsNo(product.link_url);

      if (!goodsNo) {
        return this.createFailedValidation(
          product,
          "Failed to extract goodsNo from link_url",
        );
      }

      logger.debug(
        { type: this.type, productSetId: product.product_set_id, goodsNo },
        "상품 검증 중",
      );

      // YAML 기반 스크래핑 실행
      const domData = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        goodsNo,
        platformConfig,
      );

      // "삭제된 상품" 체크 (not_found 처리)
      if (domData.name === "삭제된 상품" || domData._source === "not_found") {
        return this.createNotFoundValidation(product);
      }

      // OliveyoungProduct 도메인 객체로 변환
      const oliveyoungProduct = OliveyoungProduct.fromDOMData({
        ...domData,
        id: goodsNo,
        goodsNo,
        sale_status: domData.sale_status as OliveyoungDomSaleStatus,
      });
      const plainObject = oliveyoungProduct.toPlainObject();

      // 비교 결과 생성
      return this.compareProducts(product, {
        productName: plainObject.productName as string,
        thumbnail: plainObject.thumbnail as string,
        originalPrice: plainObject.originalPrice as number,
        discountedPrice: plainObject.discountedPrice as number,
        saleStatus: plainObject.saleStatus as string,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found") || message.includes("삭제된 상품")) {
        return this.createNotFoundValidation(product);
      }

      return this.createFailedValidation(product, message);
    }
  }

  /**
   * goodsNo 추출
   *
   * 지원 패턴:
   * - 정상: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822
   * - Query params: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822&srsltid=...
   *
   * 추출 전략:
   * 1. URL에서 goodsNo query parameter 추출
   */
  private extractGoodsNo(linkUrl: string): string | null {
    // oliveyoung URL인지 확인
    if (!linkUrl.includes("oliveyoung.co.kr")) {
      return null;
    }

    try {
      const url = new URL(linkUrl);
      return url.searchParams.get("goodsNo");
    } catch {
      return null;
    }
  }

  /**
   * 상품 비교
   */
  private compareProducts(
    supabase: ProductSetSearchResult,
    oliveyoung: {
      productName: string;
      thumbnail: string;
      originalPrice: number;
      discountedPrice: number;
      saleStatus: string;
    },
  ): ProductValidationResult {
    const comparison = {
      product_name: supabase.product_name === oliveyoung.productName,
      thumbnail: supabase.thumbnail === oliveyoung.thumbnail,
      original_price: supabase.original_price === oliveyoung.originalPrice,
      discounted_price:
        supabase.discounted_price === oliveyoung.discountedPrice,
      sale_status: supabase.sale_status === oliveyoung.saleStatus,
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
        product_name: oliveyoung.productName,
        thumbnail: oliveyoung.thumbnail,
        original_price: oliveyoung.originalPrice,
        discounted_price: oliveyoung.discountedPrice,
        sale_status: oliveyoung.saleStatus,
      },
      comparison,
      match,
      status: "success",
      validated_at: getTimestampWithTimezone(),
    };
  }

  /**
   * 실패 검증 결과 생성
   */
  private createFailedValidation(
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
   * Not Found 검증 결과 생성
   */
  private createNotFoundValidation(
    product: ProductSetSearchResult,
  ): ProductValidationResult {
    return {
      ...this.createFailedValidation(
        product,
        "Product not found in Oliveyoung",
      ),
      status: "not_found",
    };
  }

  /**
   * 요약 통계 계산
   */
  private calculateSummary(validations: ProductValidationResult[]) {
    const total = validations.length;
    const success = validations.filter((v) => v.status === "success").length;
    const failed = validations.filter((v) => v.status === "failed").length;
    const notFound = validations.filter((v) => v.status === "not_found").length;

    // 매칭된 상품 수 계산 (모든 필드가 true인 상품)
    const totalMatched = validations.filter((v) => v.match === true).length;

    // 매칭률 계산 (전체 상품 중 완전히 일치하는 상품 비율)
    const matchRate = total > 0 ? (totalMatched / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      not_found: notFound,
      total_matched: totalMatched,
      match_rate: Math.round(matchRate * 100) / 100,
    };
  }

  /**
   * Sleep 유틸리티 (Rate Limiting용)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 스크린샷 저장 (ValidationNode 레벨)
   */
  private async takeScreenshot(
    page: Page | null,
    jobId: string,
    productSetId: string,
    isError: boolean,
  ): Promise<void> {
    if (!page) {
      return;
    }

    try {
      const platform = "oliveyoung";
      const outputDir = VALIDATION_CONFIG.SCREENSHOT_OUTPUT_DIR;

      // 오늘 날짜 폴더명 (YYYY-MM-DD)
      const today = new Date().toISOString().split("T")[0];

      // 디렉토리 생성: outputDir/YYYY-MM-DD/platform/jobId/
      const jobDir = path.join(outputDir, today, platform, jobId);
      await fs.mkdir(jobDir, { recursive: true });

      // 파일명: {product_set_id}.png
      const filename = `${productSetId}.png`;
      const filepath = path.join(jobDir, filename);

      // 스크린샷 저장
      await page.screenshot({
        path: filepath,
      });

      logger.debug(
        { type: this.type, filepath, productSetId },
        "스크린샷 저장 완료",
      );
    } catch (error) {
      // 스크린샷 실패는 무시 (원래 작업에 영향 주지 않음)
      logger.warn(
        { type: this.type, error, productSetId },
        "스크린샷 저장 실패 - 무시",
      );
    }
  }

  /**
   * Config 검증
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

/**
 * ScanProductNode - Phase 4 Typed Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 상품 스캔만 담당 (Browser + API 지원)
 * - OCP: 설정 기반 확장 가능
 * - DIP: IBrowserController, BrowserPool, ScannerRegistry 인터페이스에 의존
 *
 * 목적:
 * - 브라우저 기반 스캔 (oliveyoung 등)
 * - API 기반 스캔 (hwahae 등)
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
import { SCRAPER_CONFIG, OUTPUT_CONFIG } from "@/config/constants";
import { ScreenshotService } from "@/utils/ScreenshotService";
import { getPlatformConfig } from "./platform/PlatformValidationConfig";
import { ExtractorRegistry } from "@/extractors/ExtractorRegistry";
import { SaleStatus } from "@/extractors/base";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { ScannerRegistry } from "@/services/ScannerRegistry";
import type {
  HttpStrategyConfig,
  GraphQLStrategyConfig,
} from "@/core/domain/StrategyConfig";
import type { IProduct } from "@/core/interfaces/IProduct";
import {
  ScanProductInput,
  ScanProductOutput,
  SingleScanResult,
  SingleComparisonResult,
} from "./types";
import {
  PlatformScannerRegistry,
  type IPlatformScanner,
} from "@/scanners/platform";

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
  private screenshotService: ScreenshotService;

  constructor(config?: Partial<ScanProductNodeConfig>) {
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
    this.screenshotService = new ScreenshotService(
      OUTPUT_CONFIG.SCREENSHOT_DIR,
    );
  }

  /**
   * 스크린샷 저장 여부 확인
   * PlatformValidationConfig.scanConfig.skipScreenshot 참조
   */
  private shouldSaveScreenshot(platform: string): boolean {
    const config = getPlatformConfig(platform);
    if (!config) return true; // 설정 없으면 기본 저장
    return !config.scanConfig.skipScreenshot;
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
    const { logger, platform, platformConfig, sharedState } = context;
    const results: SingleScanResult[] = [];

    if (!this.browserPool) {
      throw new Error("BrowserPool이 초기화되지 않음");
    }

    // StreamingResultWriter 가져오기 (FetchProductNode에서 초기화됨)
    const resultWriter = sharedState.get(
      "result_writer",
    ) as StreamingResultWriter | null;

    // original_products 맵 생성 (빠른 조회용)
    const originalProducts = sharedState.get("original_products") as
      | ProductSetSearchResult[]
      | undefined;
    const originalMap = new Map<string, ProductSetSearchResult>();
    if (originalProducts) {
      for (const p of originalProducts) {
        originalMap.set(p.product_set_id, p);
      }
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

        let scanResult: SingleScanResult;
        try {
          scanResult = await this.scanSingleProduct(product, page!, context);
          results.push(scanResult);

          // 성공 시 연속 실패 카운터 리셋
          if (scanResult.success) {
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

          scanResult = this.createFailedResult(product, message);
          results.push(scanResult);
          consecutiveFailures++;
        }

        // Streaming 방식: 스캔 완료 즉시 비교 결과 생성하여 JSONL에 append
        if (resultWriter) {
          const comparisonResult = this.createComparisonResult(
            scanResult,
            product,
            originalMap,
          );
          await resultWriter.append({
            ...comparisonResult,
            status: comparisonResult.status,
          });
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
   *
   * Phase 4 리팩토링:
   * - PlatformScannerRegistry를 통해 플랫폼별 스캐너 위임
   * - Browser 기반: AblyPlatformScanner, OliveyoungPlatformScanner, KurlyPlatformScanner
   * - API 기반: ApiPlatformScanner (hwahae, musinsa, zigzag)
   * - 레거시 fallback: 기존 extractProductData() 유지
   */
  private async scanSingleProduct(
    product: ProductSetSearchResult,
    page: Page | null,
    context: INodeContext,
  ): Promise<SingleScanResult> {
    const { logger, platform, platformConfig } = context;

    // URL 확인
    if (!product.link_url) {
      return this.createFailedResult(product, "No URL provided");
    }

    // 1. PlatformScannerRegistry 확인 (Phase 4 신규 방식)
    const platformScanner = this.getPlatformScanner(platform);

    if (platformScanner) {
      logger.debug(
        {
          type: this.type,
          platform,
          scanMethod: platformScanner.scanMethod,
        },
        "PlatformScanner 사용",
      );

      return this.scanViaPlatformScanner(
        product,
        page,
        platformScanner,
        context,
      );
    }

    // 2. 레거시 방식: HTTP/GraphQL/Playwright 전략
    logger.debug(
      { type: this.type, platform },
      "PlatformScanner 미등록 - 레거시 방식 사용",
    );

    return this.scanViaLegacy(product, page, context);
  }

  /**
   * PlatformScanner 조회
   */
  private getPlatformScanner(platform: string): IPlatformScanner | undefined {
    const registry = PlatformScannerRegistry.getInstance();
    return registry.get(platform);
  }

  /**
   * PlatformScanner를 통한 스캔
   *
   * Phase 4 신규 방식:
   * - Browser 기반: page를 PlatformScanner에 전달
   * - API 기반: page 없이 스캔
   */
  private async scanViaPlatformScanner(
    product: ProductSetSearchResult,
    page: Page | null,
    scanner: IPlatformScanner,
    context: INodeContext,
  ): Promise<SingleScanResult> {
    const { logger, platform } = context;
    const url = product.link_url!;

    logger.info(
      {
        type: this.type,
        product_set_id: product.product_set_id,
        platform,
        scanMethod: scanner.scanMethod,
      },
      "PlatformScanner 스캔 시작",
    );

    const scanStart = Date.now();

    try {
      // PlatformScanner.scan() 호출
      const result = await scanner.scan(url, page ?? undefined);

      // Browser 기반 스캔인 경우 screenshot 저장
      if (page && this.shouldSaveScreenshot(platform)) {
        await this.screenshotService.capture(page, {
          platform,
          jobId: context.job_id,
          productSetId: product.product_set_id,
        });
      }

      logger.info(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          elapsed_ms: Date.now() - scanStart,
          success: result.success,
          isNotFound: result.isNotFound,
          source: result.source,
        },
        "PlatformScanner 스캔 완료",
      );

      // NOT_FOUND 처리
      if (result.isNotFound) {
        return {
          product_set_id: product.product_set_id,
          product_id: product.product_id,
          success: false,
          error: result.error || "Product not found",
          url: product.link_url,
          scanned_at: getTimestampWithTimezone(),
        };
      }

      // 스캔 실패 처리
      if (!result.success || !result.data) {
        return {
          product_set_id: product.product_set_id,
          product_id: product.product_id,
          success: false,
          error: result.error || "Failed to scan product",
          url: product.link_url,
          scanned_at: getTimestampWithTimezone(),
        };
      }

      // 성공 결과
      return {
        product_set_id: product.product_set_id,
        product_id: product.product_id,
        success: true,
        scanned_data: result.data,
        url: product.link_url,
        scanned_at: getTimestampWithTimezone(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          platform,
          error: message,
        },
        "PlatformScanner 스캔 에러",
      );
      return this.createFailedResult(product, message);
    }
  }

  /**
   * 레거시 방식 스캔 (HTTP/GraphQL/Playwright 전략)
   *
   * PlatformScannerRegistry에 등록되지 않은 플랫폼용 fallback
   */
  private async scanViaLegacy(
    product: ProductSetSearchResult,
    page: Page | null,
    context: INodeContext,
  ): Promise<SingleScanResult> {
    const { logger, platform, platformConfig } = context;

    // 전략 타입 확인 (HTTP/GraphQL 우선)
    const strategies = platformConfig.strategies as
      | Array<{ type: string; id?: string }>
      | undefined;
    const httpStrategy = strategies?.find((s) => s.type === "http") as
      | HttpStrategyConfig
      | undefined;
    const graphqlStrategy = strategies?.find((s) => s.type === "graphql") as
      | GraphQLStrategyConfig
      | undefined;
    const pwStrategy = strategies?.find((s) => s.type === "playwright") as
      | PlaywrightStrategyConfig
      | undefined;

    // HTTP 전략이 있으면 API 기반 스캔
    if (httpStrategy) {
      return this.scanViaApi(product, context, httpStrategy);
    }

    // GraphQL 전략이 있으면 API 기반 스캔 (HTTP와 동일하게 처리)
    if (graphqlStrategy) {
      return this.scanViaApi(product, context, graphqlStrategy);
    }

    // Playwright 전략이 없으면 실패
    if (!pwStrategy) {
      return this.createFailedResult(
        product,
        "No scan strategy found (http, graphql, or playwright)",
      );
    }

    // Browser가 없으면 실패 (API 전략 없이 browser도 없는 경우)
    if (!page) {
      return this.createFailedResult(
        product,
        "Browser page not available for playwright strategy",
      );
    }

    try {
      // 직접 네비게이션 실행
      const url = product.link_url!;
      const navigationStep = pwStrategy.playwright?.navigationSteps?.[0];
      const navigationTimeout =
        navigationStep?.timeout ?? SCRAPER_CONFIG.NAVIGATION_TIMEOUT_MS;
      // waitUntil 설정: 플랫폼 config에서 가져오거나 기본값 "domcontentloaded" 사용
      // "networkidle"은 SPA에서 무한 대기할 수 있으므로 피함
      const waitUntil =
        (navigationStep?.waitUntil as
          | "load"
          | "domcontentloaded"
          | "networkidle"
          | "commit") ?? "domcontentloaded";

      logger.info(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          url,
          waitUntil,
        },
        "페이지 이동 시작 (레거시)",
      );

      const navStart = Date.now();
      await page.goto(url, {
        waitUntil,
        timeout: navigationTimeout,
      });

      logger.info(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          elapsed_ms: Date.now() - navStart,
        },
        "페이지 이동 완료 (레거시)",
      );

      // 스크린샷 저장 (디버깅용, 페이지 로드 직후)
      if (this.shouldSaveScreenshot(platform)) {
        await this.screenshotService.capture(page, {
          platform,
          jobId: context.job_id,
          productSetId: product.product_set_id,
        });
      }

      // DOM 추출 (플랫폼별 Extractor)
      logger.info(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          platform,
        },
        "데이터 추출 시작 (레거시)",
      );

      const extractStart = Date.now();
      const scannedData = await this.extractProductData(page, platform, logger);

      logger.info(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          elapsed_ms: Date.now() - extractStart,
          has_data: !!scannedData,
          product_name: scannedData?.product_name?.substring(0, 30),
        },
        "데이터 추출 완료 (레거시)",
      );

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
   * 상품 데이터 추출 (플랫폼별 Extractor 사용)
   *
   * ExtractorRegistry에서 플랫폼별 Extractor를 조회하여 사용
   * 데이터 포맷을 SingleScanResult 형식으로 변환
   */
  private async extractProductData(
    page: Page,
    platform: string,
    logger: INodeContext["logger"],
  ): Promise<SingleScanResult["scanned_data"] | null> {
    try {
      const registry = ExtractorRegistry.getInstance();

      // 플랫폼별 Extractor 존재 확인
      if (!registry.has(platform)) {
        logger.debug(
          { type: this.type, platform, extractor: "fallback" },
          "Extractor 미등록 - fallback 사용",
        );
        return this.extractProductDataFallback(page);
      }

      // 플랫폼별 Extractor 사용
      logger.debug(
        { type: this.type, platform, extractor: platform },
        "플랫폼별 Extractor 사용",
      );

      const extractor = registry.get(platform);
      const productData = await extractor.extract(page);

      // ProductData → SingleScanResult.scanned_data 변환
      const scannedData: SingleScanResult["scanned_data"] = {
        product_name: productData.metadata.productName || "",
        thumbnail: productData.metadata.thumbnail || "",
        original_price:
          productData.price.originalPrice || productData.price.price || 0,
        discounted_price: productData.price.price || 0,
        sale_status: this.convertSaleStatus(productData.saleStatus.saleStatus),
      };

      return scannedData.product_name ? scannedData : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        { type: this.type, platform, error: message },
        "Extractor 실패 - fallback 시도",
      );
      return this.extractProductDataFallback(page);
    }
  }

  /**
   * Fallback 추출 로직 (Extractor 미등록 플랫폼용)
   */
  private async extractProductDataFallback(
    page: Page,
  ): Promise<SingleScanResult["scanned_data"] | null> {
    try {
      const data = await page.evaluate(() => {
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
   * SaleStatus enum → 문자열 변환
   *
   * @param saleStatus SaleStatus enum 값
   * @returns 문자열 판매 상태
   */
  private convertSaleStatus(saleStatus: SaleStatus): string {
    switch (saleStatus) {
      case SaleStatus.InStock:
        return "on_sale";
      case SaleStatus.OutOfStock:
        return "out_of_stock";
      case SaleStatus.SoldOut:
        return "sold_out";
      case SaleStatus.Discontinued:
        return "discontinued";
      default:
        return "unknown";
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
   * 비교 결과 생성 (Streaming 저장용)
   */
  private createComparisonResult(
    scanResult: SingleScanResult,
    product: ProductSetSearchResult,
    originalMap: Map<string, ProductSetSearchResult>,
  ): SingleComparisonResult {
    const original = originalMap.get(product.product_set_id);

    // 스캔 실패인 경우
    if (!scanResult.success || !scanResult.scanned_data) {
      return {
        product_set_id: product.product_set_id,
        product_id: product.product_id,
        url: product.link_url,
        db: {
          product_name: original?.product_name ?? null,
          thumbnail: original?.thumbnail,
          original_price: original?.original_price,
          discounted_price: original?.discounted_price,
          sale_status: original?.sale_status,
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
        error: scanResult.error || "Scan failed",
        compared_at: getTimestampWithTimezone(),
      };
    }

    // 원본 데이터 없음
    if (!original) {
      return {
        product_set_id: product.product_set_id,
        product_id: product.product_id,
        url: product.link_url,
        db: { product_name: null },
        fetch: scanResult.scanned_data,
        comparison: {
          product_name: false,
          thumbnail: false,
          original_price: false,
          discounted_price: false,
          sale_status: false,
        },
        match: false,
        status: "not_found",
        error: "Original product not found in DB",
        compared_at: getTimestampWithTimezone(),
      };
    }

    // 필드별 비교
    const scannedData = scanResult.scanned_data;
    const comparison = {
      product_name: this.compareString(
        original.product_name,
        scannedData.product_name,
      ),
      thumbnail: this.compareString(original.thumbnail, scannedData.thumbnail),
      original_price: original.original_price === scannedData.original_price,
      discounted_price:
        original.discounted_price === scannedData.discounted_price,
      sale_status: this.compareString(
        original.sale_status,
        scannedData.sale_status,
      ),
    };

    // 전체 일치 여부
    const isMatch = Object.values(comparison).every((v) => v);

    return {
      product_set_id: product.product_set_id,
      product_id: product.product_id,
      url: product.link_url,
      db: {
        product_name: original.product_name ?? null,
        thumbnail: original.thumbnail,
        original_price: original.original_price,
        discounted_price: original.discounted_price,
        sale_status: original.sale_status,
      },
      fetch: scannedData,
      comparison,
      match: isMatch,
      status: "success",
      compared_at: getTimestampWithTimezone(),
    };
  }

  /**
   * 문자열 비교 헬퍼
   */
  private compareString(
    dbValue: string | null | undefined,
    scannedValue: string,
  ): boolean {
    if (dbValue === null || dbValue === undefined) {
      return scannedValue === "";
    }
    return dbValue.trim() === scannedValue.trim();
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
   * Browser Context 생성 (BrowserPool.createContext 사용 - Stealth 자동 적용)
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

    // BrowserPool.createContext() 사용 - Stealth Scripts 자동 적용됨
    const context = await this.browserPool!.createContext(browser, {
      viewport: contextOptions.viewport || { width: 1920, height: 1080 },
      userAgent: contextOptions.userAgent,
      locale: contextOptions.locale || "ko-KR",
      timezoneId: contextOptions.timezoneId || "Asia/Seoul",
      isMobile: contextOptions.isMobile || false,
    });

    // Note: Anti-detection 스크립트는 BrowserPool.createContext()에서 자동 적용됨

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
   * API 기반 스캔 (hwahae, musinsa, zigzag 등)
   *
   * HTTP/GraphQL 전략을 사용하는 플랫폼의 상품 스캔
   * - ScannerRegistry에서 Scanner 조회
   * - Scanner가 IProduct 구현체를 반환
   */
  private async scanViaApi(
    product: ProductSetSearchResult,
    context: INodeContext,
    apiStrategy: HttpStrategyConfig | GraphQLStrategyConfig,
  ): Promise<SingleScanResult> {
    const { logger, platform } = context;

    // link_url null 체크
    if (!product.link_url) {
      return this.createFailedResult(product, "link_url is null");
    }

    // 상품 ID 추출 (URL에서)
    const productId = this.extractProductIdFromUrl(product.link_url, platform);
    if (!productId) {
      return this.createFailedResult(
        product,
        "Failed to extract product ID from URL",
      );
    }

    logger.info(
      {
        type: this.type,
        product_set_id: product.product_set_id,
        product_id: productId,
        platform,
      },
      "API 스캔 시작",
    );

    try {
      const scanStart = Date.now();

      // Scanner 가져오기
      const scannerRegistry = ScannerRegistry.getInstance();
      const scanner = scannerRegistry.getScanner(
        platform,
        apiStrategy.id || "api",
      );

      // API 스캔 실행 - Scanner가 IProduct 구현체를 반환 (HwahaeProduct, MusinsaProduct 등)
      const scannedProduct = (await scanner.scan(productId)) as IProduct;

      logger.info(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          elapsed_ms: Date.now() - scanStart,
        },
        "API 응답 수신 완료",
      );

      // IProduct → SingleScanResult.scanned_data 변환
      const scannedData: SingleScanResult["scanned_data"] = {
        product_name: scannedProduct.productName || "",
        thumbnail: scannedProduct.thumbnail || "",
        original_price: scannedProduct.originalPrice || 0,
        discounted_price: scannedProduct.discountedPrice || 0,
        sale_status: scannedProduct.saleStatus,
      };

      logger.info(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          elapsed_ms: Date.now() - scanStart,
          has_data: !!scannedData.product_name,
          product_name: scannedData.product_name?.substring(0, 30),
        },
        "API 데이터 추출 완료",
      );

      if (!scannedData.product_name) {
        return {
          product_set_id: product.product_set_id,
          product_id: product.product_id,
          success: false,
          error: "Failed to extract product data from API response",
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
      logger.warn(
        {
          type: this.type,
          product_set_id: product.product_set_id,
          platform,
          error: message,
        },
        "API 스캔 실패",
      );
      return this.createFailedResult(product, message);
    }
  }

  /**
   * URL에서 상품 ID 추출
   */
  private extractProductIdFromUrl(
    url: string,
    platform: string,
  ): string | null {
    const urlWithoutQuery = url.split("?")[0];

    if (platform === "hwahae") {
      // hwahae: /goods/12345 또는 /products/xxx/12345
      const pathMatch = urlWithoutQuery.match(
        /\/(?:goods|products)\/(.+?)(?:\/)?$/,
      );
      if (!pathMatch) return null;
      const allNumbers = pathMatch[1].match(/\d+/g);
      return allNumbers ? allNumbers[allNumbers.length - 1] : null;
    }

    if (platform === "musinsa") {
      // musinsa: /products/12345
      const pathMatch = urlWithoutQuery.match(/\/products\/(\d+)/);
      return pathMatch ? pathMatch[1] : null;
    }

    if (platform === "zigzag") {
      // zigzag: /catalog/products/12345
      const pathMatch = urlWithoutQuery.match(/\/catalog\/products\/(\d+)/);
      return pathMatch ? pathMatch[1] : null;
    }

    if (platform === "ably") {
      // ably: /goods/12345
      const pathMatch = urlWithoutQuery.match(/\/goods\/(\d+)/);
      return pathMatch ? pathMatch[1] : null;
    }

    // 기본: URL 경로의 마지막 숫자
    const match = url.match(/\/(\d+)(?:[/?]|$)/);
    return match ? match[1] : null;
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

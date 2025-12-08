/**
 * Extract URL Node Strategy
 *
 * URL 기반 상품 추출 노드
 * Supabase 조회 없이 URL에서 직접 플랫폼 감지 및 스캔
 *
 * 플랫폼별 스캔 방식:
 * - Playwright: oliveyoung, ably, kurly (PlaywrightScriptExecutor)
 * - HTTP API: hwahae (HwahaeScanService), musinsa (MusinsaHttpScanner)
 * - GraphQL: zigzag (ZigzagScanService)
 *
 * SOLID 원칙:
 * - SRP: URL 기반 상품 추출만 담당
 * - DIP: INodeStrategy 인터페이스 구현
 *
 * ResultWriterNode 호환:
 * - `url_extraction_validation` 키로 결과 반환
 * - db: null, comparison: null (Supabase 조회 없음)
 * - product_set_id: "" (empty string)
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { logger } from "@/config/logger";
import { logImportant } from "@/utils/LoggerContext";
import { getTimestampWithTimezone } from "@/utils/timestamp";

// 플랫폼별 서비스 (ValidationNode와 동일한 방식)
import { HwahaeScanService } from "@/services/HwahaeScanService";
import { ZigzagScanService } from "@/services/ZigzagScanService";
import { MusinsaHttpScanner } from "@/scanners/platforms/musinsa/MusinsaHttpScanner";
import { PlaywrightScriptExecutor } from "@/utils/PlaywrightScriptExecutor";
import { ConfigLoader } from "@/config/ConfigLoader";
import type { PlatformConfig } from "@/core/domain/PlatformConfig";
import { BrowserPool } from "@/scanners/base/BrowserPool";
import type { Browser, BrowserContext, Page } from "playwright";
import { BROWSER_ARGS } from "@/config/BrowserArgs";

/**
 * 플랫폼별 스캔 결과 (정규화된 형식)
 */
interface PlatformScanResult {
  productName: string | null;
  thumbnail: string | null;
  originalPrice: number | null;
  discountedPrice: number | null;
  saleStatus: string | null;
  isNotFound: boolean;
}

/**
 * URL 추출 결과 인터페이스
 * - db: null (Supabase 조회 없음)
 * - comparison: null (비교 대상 없음)
 * - product_set_id: "" (empty string)
 */
export interface UrlExtractionResult {
  [key: string]: unknown;
  product_set_id: string; // "" (empty string)
  product_id: string;
  url: string;
  platform: string;
  db: null; // Supabase 조회 없음
  fetch: {
    product_name: string | null;
    thumbnail: string | null;
    original_price: number | null;
    discounted_price: number | null;
    sale_status: string | null;
  } | null;
  comparison: null; // 비교 대상 없음
  match: false; // 비교 불가
  status: "success" | "failed" | "not_found";
  extracted_at: string;
  error?: string;
}

/**
 * Extract URL Node Strategy
 */
export class ExtractUrlNode implements INodeStrategy {
  public readonly type = "extract_url";

  // 서비스 의존성
  private configLoader: ConfigLoader;

  // HTTP API / GraphQL 서비스 (Browser 불필요)
  private hwahaeScanService: HwahaeScanService;
  private zigzagScanService: ZigzagScanService;
  private musinsaScanner: MusinsaHttpScanner | null = null;

  // Playwright용 Browser Pool
  private browserPool: BrowserPool | null = null;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.hwahaeScanService = new HwahaeScanService();
    this.zigzagScanService = new ZigzagScanService();
  }

  /**
   * 노드 실행
   * ResultWriterNode 호환: url_extraction_validation 키로 결과 반환
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { config, params, workflow_id, job_id } = context;
    const startTime = Date.now();

    // URL 추출
    const url = this.resolveVariable(config.url as string, params);

    if (!url) {
      return {
        success: false,
        data: {},
        error: {
          code: "INVALID_CONFIG",
          message: "url is required",
        },
      };
    }

    logger.info(
      { type: this.type, url, workflow_id },
      "[ExtractUrlNode] 추출 시작",
    );

    let resultWriter: StreamingResultWriter | null = null;
    const outputDir =
      (config.output_dir as string) ||
      process.env.RESULT_OUTPUT_DIR ||
      "/app/results";

    try {
      // 1. 플랫폼 감지
      const detection = PlatformDetector.detect(url);

      if (!detection.platform || !detection.productId) {
        return this.createErrorResultWithFile(
          url,
          job_id,
          workflow_id,
          outputDir,
          startTime,
          {
            code: "PLATFORM_NOT_DETECTED",
            message: `Platform or productId not detected from URL: ${url}`,
          },
        );
      }

      const { platform, productId } = detection;

      logger.info({ url, platform, productId }, "플랫폼 및 상품 ID 감지 완료");

      // 2. StreamingResultWriter 초기화
      resultWriter = new StreamingResultWriter({
        outputDir,
        platform: "url_extraction",
        jobId: job_id || `url_${Date.now()}`,
        workflowId: workflow_id,
      });
      await resultWriter.initialize();

      // 3. 플랫폼별 스캔 실행
      const scanResult = await this.scanByPlatform(platform, productId);

      // 4. fetch 데이터 생성
      const fetchData = scanResult.isNotFound
        ? null
        : {
            product_name: scanResult.productName,
            thumbnail: scanResult.thumbnail,
            original_price: scanResult.originalPrice,
            discounted_price: scanResult.discountedPrice,
            sale_status: scanResult.saleStatus,
          };

      // 5. 최종 결과 생성 (db: null, comparison: null)
      const result: UrlExtractionResult = {
        product_set_id: "", // empty string (Supabase 조회 없음)
        product_id: "", // empty string (Supabase UUID - 조회 없음)
        url,
        platform,
        db: null, // Supabase 조회 없음
        fetch: fetchData,
        comparison: null, // 비교 대상 없음
        match: false, // 비교 불가
        status: scanResult.isNotFound ? "not_found" : "success",
        extracted_at: getTimestampWithTimezone(),
      };

      // 6. JSONL 파일에 결과 저장
      await resultWriter.append({
        ...result,
        status: result.status,
      });

      // 7. Writer 종료 및 결과 반환
      const writeResult = await resultWriter.finalize();
      const durationMs = Date.now() - startTime;

      logImportant(logger, "[ExtractUrlNode] 추출 완료", {
        url,
        platform,
        productName: fetchData?.product_name || "N/A",
        durationMs,
        jsonlPath: writeResult.filePath,
      });

      return {
        success: true,
        data: {
          url_extraction_validation: {
            jsonl_path: writeResult.filePath,
            summary: writeResult.summary,
            record_count: writeResult.recordCount,
            result,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error({ url, error: message }, "[ExtractUrlNode] 추출 실패");

      // 에러 시에도 파일 정리
      if (resultWriter) {
        await resultWriter.cleanup();
      }

      // not found 에러 처리
      if (
        message.includes("not found") ||
        message.includes("404") ||
        message.includes("삭제된 상품")
      ) {
        return this.createErrorResultWithFile(
          url,
          job_id,
          workflow_id,
          outputDir,
          startTime,
          {
            code: "PRODUCT_NOT_FOUND",
            message: `Product not found: ${message}`,
          },
        );
      }

      return this.createErrorResultWithFile(
        url,
        job_id,
        workflow_id,
        outputDir,
        startTime,
        {
          code: "EXTRACTION_FAILED",
          message,
        },
      );
    }
  }

  /**
   * 설정 검증
   */
  validateConfig(config: Record<string, unknown>): void {
    if (config.url === undefined) {
      throw new Error("url is required in config");
    }
  }

  /**
   * 템플릿 변수 치환
   */
  private resolveVariable(
    value: string | undefined,
    params: Record<string, unknown>,
  ): string | undefined {
    if (!value) return undefined;

    if (typeof value === "string" && value.startsWith("${")) {
      const key = value.slice(2, -1);
      return params[key] as string | undefined;
    }

    return value;
  }

  /**
   * 플랫폼별 스캔 실행
   */
  private async scanByPlatform(
    platform: string,
    productId: string,
  ): Promise<PlatformScanResult> {
    switch (platform) {
      case "hwahae":
        return this.scanHwahae(productId);
      case "zigzag":
        return this.scanZigzag(productId);
      case "musinsa":
        return this.scanMusinsa(productId);
      case "oliveyoung":
      case "ably":
      case "kurly":
        return this.scanWithPlaywright(platform, productId);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Hwahae 스캔 (HTTP API)
   */
  private async scanHwahae(productId: string): Promise<PlatformScanResult> {
    try {
      const product = await this.hwahaeScanService.scanProduct(productId);

      if (!product) {
        return this.createNotFoundResult();
      }

      return {
        productName: product.productName,
        thumbnail: product.thumbnail,
        originalPrice: product.originalPrice,
        discountedPrice: product.discountedPrice,
        saleStatus: product.saleStatus,
        isNotFound: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("404") || message.includes("not found")) {
        return this.createNotFoundResult();
      }
      throw error;
    }
  }

  /**
   * Zigzag 스캔 (GraphQL)
   */
  private async scanZigzag(productId: string): Promise<PlatformScanResult> {
    try {
      const product = await this.zigzagScanService.scanProduct(productId);

      if (!product) {
        return this.createNotFoundResult();
      }

      return {
        productName: product.productName,
        thumbnail: product.thumbnail,
        originalPrice: product.originalPrice,
        discountedPrice: product.discountedPrice,
        saleStatus: product.saleStatus,
        isNotFound: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found") || message.includes("삭제된 상품")) {
        return this.createNotFoundResult();
      }
      throw error;
    }
  }

  /**
   * Musinsa 스캔 (HTTP API)
   */
  private async scanMusinsa(productId: string): Promise<PlatformScanResult> {
    try {
      if (!this.musinsaScanner) {
        const config = this.configLoader.loadConfig("musinsa");
        const apiStrategy = config.strategies?.find(
          (s: { id: string }) => s.id === "api",
        );
        if (!apiStrategy) {
          throw new Error("Musinsa API strategy not found in config");
        }
        this.musinsaScanner = new MusinsaHttpScanner(config, apiStrategy);
      }

      const product = await this.musinsaScanner.scan(productId);

      return {
        productName: product.productName,
        thumbnail: product.thumbnail,
        originalPrice: product.originalPrice,
        discountedPrice: product.discountedPrice,
        saleStatus: product.saleStatus,
        isNotFound: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("404") || message.includes("not found")) {
        return this.createNotFoundResult();
      }
      throw error;
    }
  }

  /**
   * Playwright 기반 스캔 (oliveyoung, ably, kurly)
   */
  private async scanWithPlaywright(
    platform: string,
    productId: string,
  ): Promise<PlatformScanResult> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      const platformConfig = this.configLoader.loadConfig(
        platform,
      ) as PlatformConfig;

      if (!this.browserPool) {
        this.browserPool = BrowserPool.getInstance({
          poolSize: 1,
          browserOptions: {
            headless: true,
            args: BROWSER_ARGS.DEFAULT,
          },
        });
        await this.browserPool.initialize();
      }

      browser = await this.browserPool.acquireBrowser();
      context = await browser.newContext({
        userAgent: platformConfig.userAgent,
        viewport: { width: 430, height: 932 },
      });
      page = await context.newPage();

      const rawData = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        productId,
        platformConfig,
      );

      return this.normalizePlaywrightResult(rawData, platform);
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser && this.browserPool) {
        await this.browserPool.releaseBrowser(browser);
      }
    }
  }

  /**
   * Playwright 결과 정규화
   */
  private normalizePlaywrightResult(
    rawData: Record<string, unknown>,
    platform: string,
  ): PlatformScanResult {
    if (
      rawData._source === "not_found" ||
      rawData.name === "상품 정보 없음" ||
      rawData.status === "not_found"
    ) {
      return this.createNotFoundResult();
    }

    const titleImages = rawData.title_images as string[] | undefined;
    const thumbnail = titleImages?.[0] ?? (rawData.thumbnail as string) ?? null;

    return {
      productName: (rawData.name as string) ?? null,
      thumbnail,
      originalPrice:
        (rawData.consumer_price as number) ??
        (rawData.original_price as number) ??
        null,
      discountedPrice:
        (rawData.price as number) ??
        (rawData.discounted_price as number) ??
        null,
      saleStatus:
        (rawData.status as string) ?? (rawData.sale_status as string) ?? null,
      isNotFound: false,
    };
  }

  /**
   * NOT_FOUND 결과 생성
   */
  private createNotFoundResult(): PlatformScanResult {
    return {
      productName: null,
      thumbnail: null,
      originalPrice: null,
      discountedPrice: null,
      saleStatus: null,
      isNotFound: true,
    };
  }

  /**
   * 에러 결과 생성 (JSONL 파일 포함)
   */
  private async createErrorResultWithFile(
    url: string,
    jobId: string | undefined,
    workflowId: string | undefined,
    outputDir: string,
    _startTime: number,
    error: { code: string; message: string },
  ): Promise<NodeResult> {
    const detection = PlatformDetector.detect(url);

    const result: UrlExtractionResult = {
      product_set_id: "",
      product_id: "", // empty string (Supabase UUID - 조회 없음)
      url,
      platform: detection.platform || "unknown",
      db: null,
      fetch: null,
      comparison: null,
      match: false,
      status: "failed",
      extracted_at: getTimestampWithTimezone(),
      error: error.message,
    };

    const errorWriter = new StreamingResultWriter({
      outputDir,
      platform: "url_extraction",
      jobId: jobId || `url_err_${Date.now()}`,
      workflowId,
    });

    try {
      await errorWriter.initialize();
      await errorWriter.append({
        ...result,
        status: "failed",
      });
      const writeResult = await errorWriter.finalize();

      return {
        success: false,
        data: {
          url_extraction_validation: {
            jsonl_path: writeResult.filePath,
            summary: writeResult.summary,
            record_count: writeResult.recordCount,
            result,
          },
        },
        error: {
          code: error.code,
          message: error.message,
        },
      };
    } catch (writeError) {
      await errorWriter.cleanup();
      return {
        success: false,
        data: {},
        error: {
          code: error.code,
          message: error.message,
        },
      };
    }
  }
}

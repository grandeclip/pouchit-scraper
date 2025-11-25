/**
 * Extract Single Product Node Strategy
 *
 * product_set_id 기반 단일 상품 추출 노드
 * ValidationNode와 동일한 검증된 방식 사용:
 *
 * 플랫폼별 스캔 방식:
 * - Playwright: oliveyoung, ably, kurly (PlaywrightScriptExecutor)
 * - HTTP API: hwahae (HwahaeScanService), musinsa (MusinsaHttpScanner)
 * - GraphQL: zigzag (ZigzagScanService)
 *
 * SOLID 원칙:
 * - SRP: 단일 상품 추출만 담당
 * - DIP: INodeStrategy 인터페이스 구현, 플랫폼별 서비스 의존
 * - OCP: 새 플랫폼 추가 시 scanByPlatform 메서드 확장
 *
 * ResultWriterNode 호환:
 * - StreamingResultWriter로 JSONL 파일 생성
 * - `single_product_validation` 키로 결과 반환
 * - ValidationNode와 동일한 결과 형식 (db, fetch, comparison)
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { ProductSearchService } from "@/services/ProductSearchService";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import type { ProductSetSearchResult } from "@/core/domain/ProductSet";
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
 * ValidationNode 호환 결과 인터페이스
 */
export interface SingleProductValidationResult {
  [key: string]: unknown;
  product_set_id: string;
  product_id: string;
  url: string | null;
  db: {
    product_name: string | null;
    thumbnail: string | null;
    original_price: number | null;
    discounted_price: number | null;
    sale_status: string | null;
  };
  fetch: {
    product_name: string | null;
    thumbnail: string | null;
    original_price: number | null;
    discounted_price: number | null;
    sale_status: string | null;
  } | null;
  comparison: {
    product_name: boolean;
    thumbnail: boolean;
    original_price: boolean;
    discounted_price: boolean;
    sale_status: boolean;
  } | null;
  match: boolean;
  status: "success" | "failed" | "not_found";
  validated_at: string;
  error?: string;
}

/**
 * Extract Single Product Node Strategy
 *
 * ValidationNode와 동일한 검증된 방식 사용:
 * - Playwright: oliveyoung, ably, kurly (PlaywrightScriptExecutor)
 * - HTTP API: hwahae (HwahaeScanService), musinsa (MusinsaHttpScanner)
 * - GraphQL: zigzag (ZigzagScanService)
 */
export class ExtractSingleProductNode implements INodeStrategy {
  public readonly type = "extract_single_product";

  // 서비스 의존성
  private productSearchService: ProductSearchService;
  private configLoader: ConfigLoader;

  // HTTP API / GraphQL 서비스 (Browser 불필요)
  private hwahaeScanService: HwahaeScanService;
  private zigzagScanService: ZigzagScanService;
  private musinsaScanner: MusinsaHttpScanner | null = null;

  // Playwright용 Browser Pool
  private browserPool: BrowserPool | null = null;

  constructor() {
    this.productSearchService = new ProductSearchService();
    this.configLoader = ConfigLoader.getInstance();
    this.hwahaeScanService = new HwahaeScanService();
    this.zigzagScanService = new ZigzagScanService();
  }

  /**
   * 노드 실행
   * ResultWriterNode 호환: single_product_validation 키로 결과 반환
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { config, params, workflow_id, job_id } = context;
    const startTime = Date.now();

    // product_set_id 추출
    const productSetId = this.resolveVariable(
      config.product_set_id as string,
      params
    );

    if (!productSetId) {
      return {
        success: false,
        data: {},
        error: {
          code: "INVALID_CONFIG",
          message: "product_set_id is required",
        },
      };
    }

    logger.info(
      { type: this.type, productSetId, workflow_id },
      "[ExtractSingleProductNode] 추출 시작"
    );

    let resultWriter: StreamingResultWriter | null = null;

    try {
      // 1. Supabase에서 상품 조회
      const productSet =
        await this.productSearchService.getProductById(productSetId);

      if (!productSet) {
        return this.createErrorResultWithFile(
          productSetId,
          job_id,
          workflow_id,
          startTime,
          {
            code: "PRODUCT_SET_NOT_FOUND",
            message: `Product set not found: ${productSetId}`,
          }
        );
      }

      // 2. link_url 확인
      const linkUrl = productSet.link_url;
      if (!linkUrl) {
        return this.createErrorResultWithFile(
          productSetId,
          job_id,
          workflow_id,
          startTime,
          {
            code: "LINK_URL_MISSING",
            message: "link_url is missing",
          }
        );
      }

      // 3. 플랫폼 감지
      const detection = PlatformDetector.detect(linkUrl);

      if (!detection.platform || !detection.productId) {
        return this.createErrorResultWithFile(
          productSetId,
          job_id,
          workflow_id,
          startTime,
          {
            code: "PLATFORM_NOT_DETECTED",
            message: `Platform or productId not detected from URL: ${linkUrl}`,
          }
        );
      }

      const { platform, productId } = detection;

      logger.info(
        { productSetId, platform, productId },
        "플랫폼 및 상품 ID 감지 완료"
      );

      // 4. StreamingResultWriter 초기화 (JSONL 저장)
      resultWriter = new StreamingResultWriter({
        outputDir: "/app/results",
        platform: "single_product",
        jobId: job_id || `sp_${Date.now()}`,
        workflowId: workflow_id,
      });
      await resultWriter.initialize();

      // 5. 플랫폼별 스캔 실행 (ValidationNode와 동일한 방식)
      const scanResult = await this.scanByPlatform(platform, productId);

      // 6. fetch 데이터 생성
      const fetchData = scanResult.isNotFound
        ? null
        : {
            product_name: scanResult.productName,
            thumbnail: scanResult.thumbnail,
            original_price: scanResult.originalPrice,
            discounted_price: scanResult.discountedPrice,
            sale_status: scanResult.saleStatus,
          };

      // 7. 비교 결과 생성
      const comparison = fetchData
        ? this.compareData(productSet, fetchData)
        : null;

      // 8. 최종 결과 생성 (ValidationNode 호환)
      const result: SingleProductValidationResult = {
        product_set_id: productSetId,
        product_id: productSet.product_id,
        url: linkUrl,
        db: {
          product_name: productSet.product_name,
          thumbnail: productSet.thumbnail ?? null,
          original_price: productSet.original_price ?? null,
          discounted_price: productSet.discounted_price ?? null,
          sale_status: productSet.sale_status ?? null,
        },
        fetch: fetchData,
        comparison,
        match: comparison
          ? Object.values(comparison).every((v) => v === true)
          : false,
        status: scanResult.isNotFound ? "not_found" : "success",
        validated_at: getTimestampWithTimezone(),
      };

      // 9. JSONL 파일에 결과 저장
      await resultWriter.append({
        ...result,
        status: result.status,
      });

      // 10. Writer 종료 및 결과 반환
      const writeResult = await resultWriter.finalize();
      const durationMs = Date.now() - startTime;

      logImportant(logger, "[ExtractSingleProductNode] 추출 완료", {
        productSetId,
        platform,
        productName: fetchData?.product_name || "N/A",
        match: result.match,
        durationMs,
        jsonlPath: writeResult.filePath,
      });

      // ResultWriterNode 호환 형식: ${platform}_validation 키
      return {
        success: true,
        data: {
          single_product_validation: {
            jsonl_path: writeResult.filePath,
            summary: writeResult.summary,
            record_count: writeResult.recordCount,
            result,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { productSetId, error: message },
        "[ExtractSingleProductNode] 추출 실패"
      );

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
          productSetId,
          job_id,
          workflow_id,
          startTime,
          {
            code: "PRODUCT_NOT_FOUND",
            message: `Product not found: ${message}`,
          }
        );
      }

      return this.createErrorResultWithFile(
        productSetId,
        job_id,
        workflow_id,
        startTime,
        {
          code: "EXTRACTION_FAILED",
          message,
        }
      );
    }
  }

  /**
   * 설정 검증
   */
  validateConfig(config: Record<string, unknown>): void {
    // product_set_id는 템플릿 변수일 수 있으므로 런타임에 검증
    if (config.product_set_id === undefined) {
      throw new Error("product_set_id is required in config");
    }
  }

  /**
   * 템플릿 변수 치환
   */
  private resolveVariable(
    value: string | undefined,
    params: Record<string, unknown>
  ): string | undefined {
    if (!value) return undefined;

    if (typeof value === "string" && value.startsWith("${")) {
      const key = value.slice(2, -1);
      return params[key] as string | undefined;
    }

    return value;
  }

  /**
   * 플랫폼별 스캔 실행 (ValidationNode와 동일한 검증된 방식)
   *
   * @param platform 플랫폼명
   * @param productId 상품 ID
   * @returns 정규화된 스캔 결과
   */
  private async scanByPlatform(
    platform: string,
    productId: string
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
   * Hwahae 스캔 (HTTP API - HwahaeScanService)
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
   * Zigzag 스캔 (GraphQL - ZigzagScanService)
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
   * Musinsa 스캔 (HTTP API - MusinsaHttpScanner)
   */
  private async scanMusinsa(productId: string): Promise<PlatformScanResult> {
    try {
      // Lazy initialization (ValidationNode와 동일)
      if (!this.musinsaScanner) {
        const config = this.configLoader.loadConfig("musinsa");
        const apiStrategy = config.strategies?.find(
          (s: { id: string }) => s.id === "api"
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
   * ValidationNode와 동일: PlaywrightScriptExecutor 사용
   */
  private async scanWithPlaywright(
    platform: string,
    productId: string
  ): Promise<PlatformScanResult> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // 1. Platform Config 로드
      const platformConfig = this.configLoader.loadConfig(
        platform
      ) as PlatformConfig;

      // 2. Browser Pool 초기화 (Lazy)
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

      // 3. Browser 획득
      browser = await this.browserPool.acquireBrowser();
      context = await browser.newContext({
        userAgent: platformConfig.userAgent,
        viewport: { width: 430, height: 932 },
      });
      page = await context.newPage();

      // 4. PlaywrightScriptExecutor로 스캔 (ValidationNode와 동일)
      const rawData = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        productId,
        platformConfig
      );

      // 5. 결과 정규화
      return this.normalizePlaywrightResult(rawData, platform);
    } finally {
      // 6. 리소스 정리
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser && this.browserPool) {
        await this.browserPool.releaseBrowser(browser);
      }
    }
  }

  /**
   * Playwright 결과 정규화
   * 각 플랫폼 Extractor가 반환하는 형식을 공통 형식으로 변환
   */
  private normalizePlaywrightResult(
    rawData: Record<string, unknown>,
    platform: string
  ): PlatformScanResult {
    // NOT_FOUND 체크 (플랫폼별 Extractor 공통)
    if (
      rawData._source === "not_found" ||
      rawData.name === "상품 정보 없음" ||
      rawData.status === "not_found"
    ) {
      return this.createNotFoundResult();
    }

    // Extractor 결과 형식 (title_images, consumer_price, price 등)
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
   * DB 데이터와 fetch 데이터 비교
   */
  private compareData(
    dbData: ProductSetSearchResult,
    fetchData: {
      product_name: string | null;
      thumbnail: string | null;
      original_price: number | null;
      discounted_price: number | null;
      sale_status: string | null;
    }
  ): {
    product_name: boolean;
    thumbnail: boolean;
    original_price: boolean;
    discounted_price: boolean;
    sale_status: boolean;
  } {
    return {
      product_name: dbData.product_name === fetchData.product_name,
      thumbnail: (dbData.thumbnail ?? null) === fetchData.thumbnail,
      original_price: (dbData.original_price ?? null) === fetchData.original_price,
      discounted_price:
        (dbData.discounted_price ?? null) === fetchData.discounted_price,
      sale_status: (dbData.sale_status ?? null) === fetchData.sale_status,
    };
  }

  /**
   * 에러 결과 생성 (JSONL 파일 포함)
   * ResultWriterNode 호환 형식
   */
  private async createErrorResultWithFile(
    productSetId: string,
    jobId: string | undefined,
    workflowId: string | undefined,
    _startTime: number,
    error: { code: string; message: string }
  ): Promise<NodeResult> {
    const result: SingleProductValidationResult = {
      product_set_id: productSetId,
      product_id: "",
      url: null,
      db: {
        product_name: null,
        thumbnail: null,
        original_price: null,
        discounted_price: null,
        sale_status: null,
      },
      fetch: null,
      comparison: null,
      match: false,
      status: "failed",
      validated_at: getTimestampWithTimezone(),
      error: error.message,
    };

    // 에러 결과도 JSONL 파일로 저장
    const errorWriter = new StreamingResultWriter({
      outputDir: "/app/results",
      platform: "single_product",
      jobId: jobId || `sp_err_${Date.now()}`,
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
          single_product_validation: {
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
      // 파일 저장도 실패한 경우
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

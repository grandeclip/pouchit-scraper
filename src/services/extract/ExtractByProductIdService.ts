/**
 * Multi-Platform 상품 추출 서비스
 *
 * product_id 기반으로 여러 product_set을 조회하고
 * 플랫폼별로 그룹화하여 순차 처리
 *
 * SOLID 원칙:
 * - SRP: Multi-Platform 추출 로직만 담당
 * - DIP: IExtractService 인터페이스 구현
 * - OCP: 새 플랫폼 추가 시 PLATFORM_ORDER만 수정
 *
 * 리소스 관리:
 * - 각 플랫폼 그룹 처리 후 browser 리소스 정리
 * - Fail-Safe: 한 그룹 실패해도 계속 진행
 */

import { ProductSearchService } from "@/services/ProductSearchService";
import {
  PlatformDetector,
  SupportedPlatform,
} from "@/services/extract/url/PlatformDetector";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import type { ProductSetSearchResult } from "@/core/domain/ProductSet";
import { logger } from "@/config/logger";
import { logImportant } from "@/utils/LoggerContext";
import { getTimestampWithTimezone } from "@/utils/timestamp";

// 플랫폼별 서비스 (ExtractSingleProductNode와 동일)
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
 * Multi-Platform 결과 인터페이스
 */
export interface MultiPlatformValidationResult {
  [key: string]: unknown;
  product_set_id: string;
  product_id: string;
  platform: string;
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
 * 플랫폼별 Summary
 */
interface PlatformSummary {
  total: number;
  success: number;
  failed: number;
  not_found: number;
}

/**
 * 그룹화된 상품
 */
interface GroupedProduct {
  productSet: ProductSetSearchResult;
  platformProductId: string;
}

/**
 * Multi-Platform 상품 추출 서비스
 */
export class ExtractByProductIdService {
  // 플랫폼 처리 순서 (Browser/API 번갈아가며)
  private readonly PLATFORM_ORDER: SupportedPlatform[] = [
    "oliveyoung", // Browser
    "hwahae", // API
    "ably", // Browser
    "musinsa", // API
    "kurly", // Browser
    "zigzag", // API (GraphQL)
  ];

  // 서비스 의존성
  private productSearchService: ProductSearchService;
  private configLoader: ConfigLoader;

  // HTTP API / GraphQL 서비스 (Browser 불필요)
  private hwahaeScanService: HwahaeScanService;
  private zigzagScanService: ZigzagScanService;
  private musinsaScanner: MusinsaHttpScanner | null = null;

  // Playwright용 Browser Pool (플랫폼별 관리)
  private browserPool: BrowserPool | null = null;

  // 플랫폼별 Summary 추적
  private platformSummaries: Map<string, PlatformSummary> = new Map();

  constructor() {
    this.productSearchService = new ProductSearchService();
    this.configLoader = ConfigLoader.getInstance();
    this.hwahaeScanService = new HwahaeScanService();
    this.zigzagScanService = new ZigzagScanService();
  }

  /**
   * Multi-Platform 추출 실행
   *
   * @param productId Supabase product_id (UUID)
   * @param resultWriter StreamingResultWriter 인스턴스
   * @param saleStatus 판매 상태 필터 (optional: "on_sale" | "off_sale" | undefined=전체)
   * @returns 플랫폼별 Summary
   */
  async extract(
    productId: string,
    resultWriter: StreamingResultWriter,
    saleStatus?: string,
  ): Promise<Map<string, PlatformSummary>> {
    // Summary 초기화
    this.platformSummaries.clear();

    // 1. Supabase에서 product_id로 조회 (saleStatus 필터 적용)
    const productSets = await this.productSearchService.searchByProductId(
      productId,
      saleStatus,
    );

    if (productSets.length === 0) {
      logger.warn({ productId }, "product_id에 해당하는 상품이 없습니다");
      return this.platformSummaries;
    }

    logger.info(
      { productId, count: productSets.length },
      "product_id 기반 상품 조회 완료",
    );

    // 2. 플랫폼별 그룹화
    const platformGroups = this.groupByPlatform(productSets);

    logger.info(
      {
        productId,
        groupCount: platformGroups.size,
        platforms: Array.from(platformGroups.keys()),
      },
      "플랫폼별 그룹화 완료",
    );

    // 3. 정의된 순서대로 순차 처리
    for (const platform of this.PLATFORM_ORDER) {
      const group = platformGroups.get(platform);
      if (!group || group.length === 0) continue;

      logger.info(
        { platform, productCount: group.length },
        `[${platform}] 그룹 처리 시작`,
      );

      try {
        await this.processPlatformGroup(platform, group, resultWriter);
      } catch (error) {
        // Fail-Safe: 로그만 기록하고 계속 진행
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { platform, error: message },
          `[${platform}] 그룹 처리 실패 - 다음 그룹으로 계속 진행`,
        );

        // 실패한 그룹의 상품들을 failed로 기록
        await this.recordFailedGroup(platform, group, message, resultWriter);
      } finally {
        // 그룹 종료 시 Browser 리소스 정리
        await this.cleanupPlatformResources(platform);
      }
    }

    // 4. 감지되지 않은 플랫폼의 상품들도 기록
    const unknownGroup = platformGroups.get("unknown" as SupportedPlatform);
    if (unknownGroup && unknownGroup.length > 0) {
      await this.recordUnknownPlatformProducts(
        productId,
        unknownGroup,
        resultWriter,
      );
    }

    return this.platformSummaries;
  }

  /**
   * 플랫폼별 그룹화
   */
  private groupByPlatform(
    productSets: ProductSetSearchResult[],
  ): Map<SupportedPlatform | "unknown", GroupedProduct[]> {
    const groups = new Map<SupportedPlatform | "unknown", GroupedProduct[]>();

    for (const productSet of productSets) {
      if (!productSet.link_url) {
        // link_url 없는 경우 unknown으로 분류
        if (!groups.has("unknown" as SupportedPlatform)) {
          groups.set("unknown" as SupportedPlatform, []);
        }
        groups.get("unknown" as SupportedPlatform)!.push({
          productSet,
          platformProductId: "",
        });
        continue;
      }

      const detection = PlatformDetector.detect(productSet.link_url);

      if (!detection.platform || !detection.productId) {
        // 플랫폼 감지 실패 시 unknown으로 분류
        if (!groups.has("unknown" as SupportedPlatform)) {
          groups.set("unknown" as SupportedPlatform, []);
        }
        groups.get("unknown" as SupportedPlatform)!.push({
          productSet,
          platformProductId: "",
        });
        continue;
      }

      if (!groups.has(detection.platform)) {
        groups.set(detection.platform, []);
      }
      groups.get(detection.platform)!.push({
        productSet,
        platformProductId: detection.productId,
      });
    }

    return groups;
  }

  /**
   * 플랫폼 그룹 처리
   */
  private async processPlatformGroup(
    platform: SupportedPlatform,
    products: GroupedProduct[],
    resultWriter: StreamingResultWriter,
  ): Promise<void> {
    // Summary 초기화
    if (!this.platformSummaries.has(platform)) {
      this.platformSummaries.set(platform, {
        total: 0,
        success: 0,
        failed: 0,
        not_found: 0,
      });
    }
    const summary = this.platformSummaries.get(platform)!;

    // Browser 기반 플랫폼 초기화
    if (this.isBrowserPlatform(platform) && !this.browserPool) {
      this.browserPool = BrowserPool.getInstance({
        poolSize: 1,
        browserOptions: {
          headless: true,
          args: BROWSER_ARGS.DEFAULT,
        },
      });
      await this.browserPool.initialize();
    }

    // 각 상품 처리
    for (const product of products) {
      summary.total++;

      try {
        const result = await this.processProduct(
          platform,
          product.productSet,
          product.platformProductId,
        );

        // Summary 업데이트
        if (result.status === "success") {
          summary.success++;
        } else if (result.status === "not_found") {
          summary.not_found++;
        } else {
          summary.failed++;
        }

        // JSONL에 기록
        await resultWriter.append(result);
      } catch (error) {
        summary.failed++;

        const message = error instanceof Error ? error.message : String(error);
        const errorResult = this.createErrorResult(
          platform,
          product.productSet,
          message,
        );
        await resultWriter.append(errorResult);

        logger.warn(
          {
            platform,
            productSetId: product.productSet.product_set_id,
            error: message,
          },
          "상품 처리 실패 - 계속 진행",
        );
      }
    }

    logImportant(logger, `[${platform}] 그룹 처리 완료`, {
      platform,
      ...summary,
    });
  }

  /**
   * 단일 상품 처리
   */
  private async processProduct(
    platform: SupportedPlatform,
    productSet: ProductSetSearchResult,
    platformProductId: string,
  ): Promise<MultiPlatformValidationResult> {
    // 플랫폼별 스캔 실행
    const scanResult = await this.scanByPlatform(platform, platformProductId);

    // fetch 데이터 생성
    const fetchData = scanResult.isNotFound
      ? null
      : {
          product_name: scanResult.productName,
          thumbnail: scanResult.thumbnail,
          original_price: scanResult.originalPrice,
          discounted_price: scanResult.discountedPrice,
          sale_status: scanResult.saleStatus,
        };

    // 비교 결과 생성
    const comparison = fetchData
      ? this.compareData(productSet, fetchData)
      : null;

    return {
      product_set_id: productSet.product_set_id,
      product_id: productSet.product_id,
      platform,
      url: productSet.link_url,
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
  }

  /**
   * 플랫폼별 스캔 실행 (ExtractSingleProductNode와 동일)
   */
  private async scanByPlatform(
    platform: SupportedPlatform,
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
   * Browser 기반 플랫폼 여부
   */
  private isBrowserPlatform(platform: SupportedPlatform): boolean {
    return ["oliveyoung", "ably", "kurly"].includes(platform);
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
    platform: SupportedPlatform,
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
        throw new Error("BrowserPool not initialized");
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

      return this.normalizePlaywrightResult(rawData);
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
   * 에러 결과 생성
   */
  private createErrorResult(
    platform: string,
    productSet: ProductSetSearchResult,
    errorMessage: string,
  ): MultiPlatformValidationResult {
    return {
      product_set_id: productSet.product_set_id,
      product_id: productSet.product_id,
      platform,
      url: productSet.link_url,
      db: {
        product_name: productSet.product_name,
        thumbnail: productSet.thumbnail ?? null,
        original_price: productSet.original_price ?? null,
        discounted_price: productSet.discounted_price ?? null,
        sale_status: productSet.sale_status ?? null,
      },
      fetch: null,
      comparison: null,
      match: false,
      status: "failed",
      validated_at: getTimestampWithTimezone(),
      error: errorMessage,
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
    },
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
      original_price:
        (dbData.original_price ?? null) === fetchData.original_price,
      discounted_price:
        (dbData.discounted_price ?? null) === fetchData.discounted_price,
      sale_status: (dbData.sale_status ?? null) === fetchData.sale_status,
    };
  }

  /**
   * 실패한 그룹의 상품들 기록
   */
  private async recordFailedGroup(
    platform: string,
    products: GroupedProduct[],
    errorMessage: string,
    resultWriter: StreamingResultWriter,
  ): Promise<void> {
    const summary = this.platformSummaries.get(platform) || {
      total: 0,
      success: 0,
      failed: 0,
      not_found: 0,
    };

    for (const product of products) {
      summary.total++;
      summary.failed++;

      const errorResult = this.createErrorResult(
        platform,
        product.productSet,
        errorMessage,
      );
      await resultWriter.append(errorResult);
    }

    this.platformSummaries.set(platform, summary);
  }

  /**
   * 플랫폼 감지 실패한 상품들 기록
   */
  private async recordUnknownPlatformProducts(
    productId: string,
    products: GroupedProduct[],
    resultWriter: StreamingResultWriter,
  ): Promise<void> {
    const platform = "unknown";
    if (!this.platformSummaries.has(platform)) {
      this.platformSummaries.set(platform, {
        total: 0,
        success: 0,
        failed: 0,
        not_found: 0,
      });
    }
    const summary = this.platformSummaries.get(platform)!;

    for (const product of products) {
      summary.total++;
      summary.failed++;

      const errorResult = this.createErrorResult(
        platform,
        product.productSet,
        "Platform not detected from link_url",
      );
      await resultWriter.append(errorResult);
    }

    logger.warn(
      { productId, count: products.length },
      "플랫폼 감지 실패 상품들 기록 완료",
    );
  }

  /**
   * 플랫폼 리소스 정리
   */
  private async cleanupPlatformResources(
    platform: SupportedPlatform,
  ): Promise<void> {
    // Browser 기반 플랫폼만 정리
    if (this.isBrowserPlatform(platform) && this.browserPool) {
      logger.info({ platform }, `[${platform}] Browser 리소스 정리`);
      await this.browserPool.cleanup();
      this.browserPool = null;
    }
  }

  /**
   * 전체 리소스 정리 (외부 호출용)
   */
  async cleanup(): Promise<void> {
    if (this.browserPool) {
      await this.browserPool.cleanup();
      this.browserPool = null;
    }
  }
}

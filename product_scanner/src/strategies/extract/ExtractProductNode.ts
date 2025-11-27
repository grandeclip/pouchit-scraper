/**
 * ExtractProductNode (Phase 4)
 *
 * Product UUID 기반 멀티 플랫폼 상품 추출 노드
 *
 * 특징:
 * - ITypedNodeStrategy<ExtractMultiPlatformInput, ExtractMultiPlatformOutput> 구현
 * - product_id로 모든 product_set 조회
 * - PlatformScannerRegistry를 통한 플랫폼별 스캔
 * - DB 데이터와 스캔 결과 비교
 * - JSONL 파일 저장
 *
 * SOLID 원칙:
 * - SRP: Product UUID 기반 추출만 담당
 * - DIP: ITypedNodeStrategy 인터페이스 의존
 * - OCP: PlatformScannerRegistry로 플랫폼 확장
 */

import type { Page, Browser, BrowserContext } from "playwright";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  createSuccessResult,
  createErrorResult,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import {
  ExtractMultiPlatformInput,
  ExtractMultiPlatformOutput,
  ProductSetExtractionResultItem,
  ScannedProductData,
  DbProductData,
  FieldComparisonResult,
  PlatformGroupResult,
} from "@/strategies/validation/types";
import { PlatformScannerRegistry } from "@/scanners/platform/PlatformScannerRegistry";
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import { ProductSearchService } from "@/services/ProductSearchService";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { BrowserScanExecutor } from "@/scanners/base/BrowserScanExecutor";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import type { ProductSetSearchResult } from "@/core/domain/ProductSet";

/**
 * ExtractProductNode 설정
 */
export interface ExtractProductNodeConfig {
  /** 결과 출력 디렉토리 */
  default_output_dir: string;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: ExtractProductNodeConfig = {
  default_output_dir: process.env.RESULT_OUTPUT_DIR || "/app/results",
};

/**
 * ExtractProductNode - Product UUID 기반 멀티 플랫폼 추출
 */
export class ExtractProductNode
  implements
    ITypedNodeStrategy<ExtractMultiPlatformInput, ExtractMultiPlatformOutput>
{
  public readonly type = "extract_product";
  public readonly name = "ExtractProductNode";

  private readonly service: IProductSearchService;
  private readonly nodeConfig: ExtractProductNodeConfig;
  private readonly scanExecutor: BrowserScanExecutor;

  constructor(
    service?: IProductSearchService,
    config?: Partial<ExtractProductNodeConfig>,
  ) {
    this.service = service ?? new ProductSearchService();
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
    this.scanExecutor = new BrowserScanExecutor();
  }

  /**
   * 노드 실행
   */
  async execute(
    input: ExtractMultiPlatformInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<ExtractMultiPlatformOutput>> {
    const { logger, job_id, workflow_id, config } = context;

    // Config 병합
    const mergedInput = this.mergeInputWithConfig(input, config);
    const outputDir =
      mergedInput.output_dir ?? this.nodeConfig.default_output_dir;

    if (!mergedInput.product_id) {
      return createErrorResult<ExtractMultiPlatformOutput>(
        "INVALID_INPUT",
        "product_id is required",
      );
    }

    logger.info(
      {
        type: this.type,
        product_id: mergedInput.product_id,
        sale_status: mergedInput.sale_status,
        workflow_id,
      },
      "[ExtractProductNode] 추출 시작",
    );

    const results: ProductSetExtractionResultItem[] = [];
    const platformStats = new Map<
      string,
      {
        total: number;
        success: number;
        failed: number;
        not_found: number;
        match: number;
        mismatch: number;
      }
    >();

    let resultWriter: StreamingResultWriter | null = null;

    try {
      // 1. StreamingResultWriter 초기화
      resultWriter = new StreamingResultWriter({
        outputDir,
        platform: "multi_platform",
        jobId: job_id || `product_${Date.now()}`,
        workflowId: workflow_id,
      });
      await resultWriter.initialize();

      // 2. Product ID로 모든 product_set 조회
      const productSets = await this.service.searchByProductId(
        mergedInput.product_id,
        mergedInput.sale_status,
      );

      if (!productSets || productSets.length === 0) {
        logger.warn(
          { product_id: mergedInput.product_id },
          "[ExtractProductNode] 상품 세트 없음",
        );

        const writeResult = await resultWriter.finalize();

        return createSuccessResult<ExtractMultiPlatformOutput>({
          jsonl_path: writeResult.filePath,
          record_count: 0,
          results: [],
          platform_results: [],
          summary: {
            total: 0,
            success: 0,
            failed: 0,
            not_found: 0,
            match: 0,
            mismatch: 0,
            platforms_processed: 0,
          },
        });
      }

      logger.info(
        { product_id: mergedInput.product_id, count: productSets.length },
        "[ExtractProductNode] product_set 조회 완료",
      );

      // 3. 각 product_set 처리
      const registry = PlatformScannerRegistry.getInstance();

      for (const productSet of productSets) {
        const result = await this.processProductSet(
          productSet,
          registry,
          platformStats,
          logger,
        );
        results.push(result);

        // JSONL 기록
        await resultWriter.append({
          ...result,
          status: result.status,
        });
      }

      // 4. 결과 정리
      const writeResult = await resultWriter.finalize();

      // 5. 플랫폼별 그룹 결과 생성
      const platformResults: PlatformGroupResult[] = [];
      platformStats.forEach((stats, platform) => {
        platformResults.push({
          platform,
          count: stats.total,
          success_count: stats.success,
          failure_count: stats.failed + stats.not_found,
          match_count: stats.match,
          mismatch_count: stats.mismatch,
        });
      });

      // 6. 전체 Summary 계산
      const summary = {
        total: results.length,
        success: results.filter((r) => r.status === "success").length,
        failed: results.filter((r) => r.status === "failed").length,
        not_found: results.filter((r) => r.status === "not_found").length,
        match: results.filter((r) => r.match).length,
        mismatch: results.filter((r) => !r.match && r.status === "success")
          .length,
        platforms_processed: platformStats.size,
      };

      logger.info(
        {
          product_id: mergedInput.product_id,
          total: summary.total,
          success: summary.success,
          match: summary.match,
          platforms: Array.from(platformStats.keys()),
          jsonlPath: writeResult.filePath,
        },
        "[ExtractProductNode] 추출 완료",
      );

      return createSuccessResult<ExtractMultiPlatformOutput>({
        jsonl_path: writeResult.filePath,
        record_count: writeResult.recordCount,
        results,
        platform_results: platformResults,
        summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { product_id: mergedInput.product_id, error: message },
        "[ExtractProductNode] 추출 실패",
      );

      if (resultWriter) {
        await resultWriter.cleanup();
      }

      return createErrorResult<ExtractMultiPlatformOutput>(
        "EXTRACTION_FAILED",
        message,
      );
    } finally {
      // BrowserScanExecutor 정리
      await this.scanExecutor.cleanup();
    }
  }

  /**
   * 단일 product_set 처리
   */
  private async processProductSet(
    productSet: ProductSetSearchResult,
    registry: PlatformScannerRegistry,
    platformStats: Map<
      string,
      {
        total: number;
        success: number;
        failed: number;
        not_found: number;
        match: number;
        mismatch: number;
      }
    >,
    logger: INodeContext["logger"],
  ): Promise<ProductSetExtractionResultItem> {
    const linkUrl = productSet.link_url;
    const platform = linkUrl
      ? PlatformDetector.detectPlatform(linkUrl) || "unknown"
      : "unknown";

    // 플랫폼 통계 초기화
    if (!platformStats.has(platform)) {
      platformStats.set(platform, {
        total: 0,
        success: 0,
        failed: 0,
        not_found: 0,
        match: 0,
        mismatch: 0,
      });
    }
    const stats = platformStats.get(platform)!;
    stats.total++;

    // DB 데이터
    const dbData: DbProductData = {
      product_name: productSet.product_name,
      thumbnail: productSet.thumbnail ?? null,
      original_price: productSet.original_price ?? null,
      discounted_price: productSet.discounted_price ?? null,
      sale_status: productSet.sale_status ?? null,
    };

    // 스캐너 확인
    const scanner = registry.get(platform);
    if (!scanner || !linkUrl) {
      stats.failed++;
      return this.createResult(
        productSet,
        platform,
        dbData,
        null,
        null,
        false,
        "failed",
        `No scanner for platform: ${platform}`,
      );
    }

    // URL에서 productId 추출
    const productId = scanner.extractProductId(linkUrl);
    if (!productId) {
      stats.failed++;
      return this.createResult(
        productSet,
        platform,
        dbData,
        null,
        null,
        false,
        "failed",
        `Failed to extract productId from URL: ${linkUrl}`,
      );
    }

    try {
      // BrowserScanExecutor를 통한 스캔 실행
      const scanResult = await this.scanExecutor.execute(
        scanner,
        platform,
        linkUrl,
      );

      // NOT_FOUND 처리
      if (scanResult.isNotFound || !scanResult.data) {
        stats.not_found++;
        return this.createResult(
          productSet,
          platform,
          dbData,
          null,
          null,
          false,
          "not_found",
          scanResult.error || "Product not found",
        );
      }

      // fetch 데이터 생성
      const fetchData: ScannedProductData = {
        product_name: scanResult.data.product_name,
        thumbnail: scanResult.data.thumbnail,
        original_price: scanResult.data.original_price,
        discounted_price: scanResult.data.discounted_price,
        sale_status: scanResult.data.sale_status,
      };

      // 비교
      const comparison = this.compareData(productSet, fetchData);
      const match = Object.values(comparison).every((v) => v);

      stats.success++;
      if (match) stats.match++;
      else stats.mismatch++;

      return this.createResult(
        productSet,
        platform,
        dbData,
        fetchData,
        comparison,
        match,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(
        { platform, productId, error: message },
        "[ExtractProductNode] 스캔 실패",
      );
      stats.failed++;
      return this.createResult(
        productSet,
        platform,
        dbData,
        null,
        null,
        false,
        "failed",
        message,
      );
    }
  }

  /**
   * Input과 Config 병합
   */
  private mergeInputWithConfig(
    input: ExtractMultiPlatformInput,
    config: Record<string, unknown>,
  ): ExtractMultiPlatformInput {
    const resolveVar = (val: unknown): string | undefined => {
      if (typeof val !== "string") return undefined;
      if (val.startsWith("${") && val.endsWith("}")) {
        return undefined; // Already resolved by context
      }
      return val;
    };

    return {
      product_id: input.product_id || resolveVar(config.product_id) || "",
      sale_status: input.sale_status || resolveVar(config.sale_status),
      output_dir: input.output_dir || resolveVar(config.output_dir),
    };
  }

  /**
   * DB 데이터와 fetch 데이터 비교
   */
  private compareData(
    dbData: ProductSetSearchResult,
    fetchData: ScannedProductData,
  ): FieldComparisonResult {
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
   * 결과 생성
   */
  private createResult(
    productSet: ProductSetSearchResult,
    platform: string,
    dbData: DbProductData,
    fetchData: ScannedProductData | null,
    comparison: FieldComparisonResult | null,
    match: boolean,
    status: "success" | "failed" | "not_found",
    error?: string,
  ): ProductSetExtractionResultItem {
    return {
      product_set_id: productSet.product_set_id,
      product_id: productSet.product_id,
      url: productSet.link_url,
      platform,
      db: dbData,
      fetch: fetchData,
      comparison,
      match,
      status,
      extracted_at: getTimestampWithTimezone(),
      ...(error && { error }),
    };
  }

  /**
   * Config 검증
   */
  validateConfig(config: Record<string, unknown>): boolean {
    return typeof config.product_id === "string";
  }
}

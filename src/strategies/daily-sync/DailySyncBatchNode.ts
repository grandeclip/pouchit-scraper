/**
 * DailySyncBatchNode - Daily Sync 단일 처리 노드
 *
 * SOLID 원칙:
 * - SRP: 단일 product 처리만 담당
 * - DIP: Repository/Service 추상화에 의존
 *
 * 목적:
 * - 1개 product 처리: search → filter → compare → insert → enqueue
 * - JSONL에 결과 append
 * - 남은 product 있으면 다음 Job enqueue (Queue 공정성)
 *
 * 설계:
 * - 1개씩 처리 후 Queue에 재등록 → 다른 Job과 공정하게 처리
 * - 실패해도 JSONL 기록 후 다음 진행
 */

import * as fs from "fs";
import { v7 as uuidv7 } from "uuid";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  createSuccessResult,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { SupabaseProductRepository } from "@/repositories/SupabaseProductRepository";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { SearchQueueService } from "@/services/SearchQueueService";
import { ProductFilteringService } from "@/llm/ProductFilteringService";
import { logLlmCost } from "@/llm/LlmCostLogger";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { Job, JobStatus, JobPriority } from "@/core/domain/Workflow";
import type { UnifiedSearchResponse } from "@/services/UnifiedSearchService";
import {
  DailySyncBatchInput,
  DailySyncBatchOutput,
  DailySyncProduct,
  DailySyncLogRecord,
} from "./types";

/**
 * 단일 product 처리 결과 (내부용)
 */
interface ProductProcessResult {
  product_id: string;
  success: boolean;
  skipped: boolean;
  skip_reason?: string;
  error?: string;
  search_result_count: number;
  valid_url_count: number;
  inserted_count: number;
  enqueued_count: number;
  duration_ms: number;
}

/**
 * DailySyncBatchNode - Daily Sync 단일 처리 노드
 */
export class DailySyncBatchNode implements ITypedNodeStrategy<
  DailySyncBatchInput,
  DailySyncBatchOutput
> {
  public readonly type = "daily_sync_batch";
  public readonly name = "DailySyncBatchNode";

  private productSetRepository: SupabaseProductRepository;
  private workflowRepository: RedisWorkflowRepository;
  private searchService: SearchQueueService;
  private filteringService: ProductFilteringService;

  private readonly DEFAULT_MAX_PER_PLATFORM = 10;
  private readonly DEFAULT_UPDATE_WORKFLOW_ID = "extract-product-set-update-v2";
  private readonly DEFAULT_NOTIFY_WORKFLOW_ID = "daily-sync-notify-v2";
  private readonly DEFAULT_PLATFORM = "default";

  constructor() {
    this.productSetRepository = new SupabaseProductRepository();
    this.workflowRepository = RedisWorkflowRepository.getInstance();
    this.searchService = SearchQueueService.getInstance();
    this.filteringService = new ProductFilteringService();
  }

  /**
   * 노드 실행: 1개 product 처리 후 다음 Job enqueue
   */
  async execute(
    input: DailySyncBatchInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<DailySyncBatchOutput>> {
    const { logger, config } = context;

    const dryRun = (config.dry_run as boolean) || input.dry_run || false;
    const maxPerPlatform =
      (config.max_per_platform as number) ||
      input.max_per_platform ||
      this.DEFAULT_MAX_PER_PLATFORM;
    const updateWorkflowId =
      (config.update_workflow_id as string) ||
      input.update_workflow_id ||
      this.DEFAULT_UPDATE_WORKFLOW_ID;

    const platformIdMap = new Map(Object.entries(input.platform_id_map));
    const totalProducts = input.total_products;
    const products = input.products;

    logger.info(
      {
        type: this.type,
        total_products: totalProducts,
        remaining: products.length,
        dry_run: dryRun,
      },
      "단일 처리 시작",
    );

    // 모두 처리됨
    if (products.length === 0) {
      await this.enqueueNotifyJob(input, logger);
      return createSuccessResult({
        processed_count: 0,
        success_count: 0,
        skipped_count: 0,
        failed_count: 0,
        new_product_sets_count: 0,
        enqueued_jobs_count: 0,
        completed: true,
        remaining_count: 0,
        progress: 100,
        job_log_file: input.job_log_file,
      });
    }

    // 첫 번째 product 처리
    const product = products[0];
    const startTime = Date.now();

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let newProductSetsCount = 0;
    let enqueuedJobsCount = 0;

    try {
      const result = await this.processProduct(
        product,
        platformIdMap,
        dryRun,
        maxPerPlatform,
        updateWorkflowId,
        context.job_id,
        logger,
      );

      // JSONL 기록
      const logRecord: DailySyncLogRecord = {
        product_id: product.product_id,
        status: result.skipped
          ? "skipped"
          : result.success
            ? "success"
            : "failed",
        skip_reason: result.skip_reason,
        error: result.error,
        search_result_count: result.search_result_count,
        valid_url_count: result.valid_url_count,
        inserted_count: result.inserted_count,
        enqueued_count: result.enqueued_count,
        duration_ms: result.duration_ms,
        timestamp: new Date().toISOString(),
      };

      this.appendJsonl(input.job_log_file, logRecord);

      // 집계
      if (result.skipped) {
        skippedCount = 1;
      } else if (result.success) {
        successCount = 1;
        newProductSetsCount = result.inserted_count;
        enqueuedJobsCount = result.enqueued_count;
      } else {
        failedCount = 1;
      }

      // 진행률 로깅
      const processedSoFar = totalProducts - products.length + 1;
      const progress = Math.floor((processedSoFar / totalProducts) * 100);
      logger.info(
        {
          product_id: product.product_id,
          status: logRecord.status,
          progress,
          processed: processedSoFar,
          total: totalProducts,
        },
        "product 처리 완료",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 에러 발생해도 JSONL 기록
      const logRecord: DailySyncLogRecord = {
        product_id: product.product_id,
        status: "failed",
        error: errorMessage,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      this.appendJsonl(input.job_log_file, logRecord);
      failedCount = 1;

      logger.error(
        { product_id: product.product_id, error: errorMessage },
        "product 처리 실패",
      );
    }

    // 남은 products
    const remainingProducts = products.slice(1);
    const remainingCount = remainingProducts.length;
    const completed = remainingCount === 0;
    const processedSoFar = totalProducts - remainingCount;
    const progress = Math.floor((processedSoFar / totalProducts) * 100);

    const output: DailySyncBatchOutput = {
      processed_count: 1,
      success_count: successCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      new_product_sets_count: newProductSetsCount,
      enqueued_jobs_count: enqueuedJobsCount,
      completed,
      remaining_count: remainingCount,
      progress,
      job_log_file: input.job_log_file,
    };

    logger.info(
      {
        type: this.type,
        ...output,
      },
      completed ? "전체 처리 완료" : "단일 처리 완료",
    );

    if (completed) {
      // 전체 완료: Notify Job enqueue
      await this.enqueueNotifyJob(input, logger);
    } else {
      // 미완료: 다음 Job enqueue (남은 products만 전달)
      await this.enqueueNextJob(
        input,
        remainingProducts,
        context.workflow_id,
        logger,
      );
    }

    return createSuccessResult(output);
  }

  /**
   * 단일 product 처리
   */
  private async processProduct(
    product: DailySyncProduct,
    platformIdMap: Map<string, number>,
    dryRun: boolean,
    maxPerPlatform: number,
    updateWorkflowId: string,
    jobId: string,
    logger: INodeContext["logger"],
  ): Promise<ProductProcessResult> {
    const startTime = Date.now();
    const { product_id, name: productName, brand_name: brandName } = product;

    // brand_name 없으면 스킵
    if (!brandName) {
      return {
        product_id,
        success: false,
        skipped: true,
        skip_reason: "brand_name not found",
        search_result_count: 0,
        valid_url_count: 0,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // 1. 통합 검색
    let searchResult: UnifiedSearchResponse;
    try {
      searchResult = await this.searchService.search({
        brand: brandName,
        productName,
        maxPerPlatform,
      });
    } catch (error) {
      return {
        product_id,
        success: false,
        skipped: false,
        error: `검색 실패: ${error instanceof Error ? error.message : String(error)}`,
        search_result_count: 0,
        valid_url_count: 0,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    const searchResultCount = searchResult.summary.totalProducts;

    // 검색 결과 없으면 스킵
    if (searchResultCount === 0) {
      return {
        product_id,
        success: true,
        skipped: true,
        skip_reason: "no_search_results",
        search_result_count: 0,
        valid_url_count: 0,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // 2. 플랫폼별 상품명 추출
    const productNames: Record<string, string[]> = {};
    for (const platform of searchResult.platforms) {
      if (platform.success && platform.products.length > 0) {
        productNames[platform.platform] = platform.products.map(
          (p) => p.productName,
        );
      }
    }

    if (Object.keys(productNames).length === 0) {
      return {
        product_id,
        success: true,
        skipped: true,
        skip_reason: "no_platform_products",
        search_result_count: searchResultCount,
        valid_url_count: 0,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // 3. LLM 필터링
    let filterResult;
    try {
      filterResult = await this.filteringService.filter({
        brand: brandName,
        product_name: productName,
        product_names: productNames,
      });

      // LLM 비용 기록
      logLlmCost({
        job_id: jobId,
        platform: "daily_sync",
        product_set_id: product_id,
        operation: "product_filtering",
        model: filterResult.model,
        input_tokens: filterResult.usage.promptTokenCount ?? 0,
        output_tokens: filterResult.usage.candidatesTokenCount ?? 0,
      });
    } catch (error) {
      return {
        product_id,
        success: false,
        skipped: false,
        error: `필터링 실패: ${error instanceof Error ? error.message : String(error)}`,
        search_result_count: searchResultCount,
        valid_url_count: 0,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // 4. 유효한 URL 추출
    const validUrls: string[] = [];
    for (const platformResult of filterResult.result.platforms) {
      const { platform, valid_indices } = platformResult;
      const platformData = searchResult.platforms.find(
        (p) => p.platform === platform,
      );

      if (platformData && platformData.products) {
        for (const index of valid_indices) {
          if (index >= 0 && index < platformData.products.length) {
            validUrls.push(platformData.products[index].productUrl);
          }
        }
      }
    }

    if (validUrls.length === 0) {
      return {
        product_id,
        success: true,
        skipped: true,
        skip_reason: "no_valid_urls_after_filter",
        search_result_count: searchResultCount,
        valid_url_count: 0,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // 5. 기존 product_sets의 link_url 조회 (정규화된 URL로 비교)
    const existingProductSets = await this.productSetRepository.search({
      product_id,
    });
    const existingNormalizedUrls = new Set(
      existingProductSets
        .map((ps) => ps.link_url)
        .filter((url): url is string => url !== null)
        .map((url) => PlatformDetector.normalizeUrl(url)),
    );

    // 6. 신규 URL 필터링 (정규화된 URL로 비교)
    const newUrls = validUrls.filter((url) => {
      const normalizedUrl = PlatformDetector.normalizeUrl(url);
      return !existingNormalizedUrls.has(normalizedUrl);
    });

    if (newUrls.length === 0) {
      return {
        product_id,
        success: true,
        skipped: true,
        skip_reason: "all_urls_already_exist",
        search_result_count: searchResultCount,
        valid_url_count: validUrls.length,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    logger.info({ product_id, new_url_count: newUrls.length }, "신규 URL 발견");

    if (dryRun) {
      logger.info(
        { product_id, new_urls: newUrls },
        "DRY RUN - INSERT/enqueue 스킵",
      );
      return {
        product_id,
        success: true,
        skipped: false,
        search_result_count: searchResultCount,
        valid_url_count: validUrls.length,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    // 7. product_sets INSERT (auto_crawled=true, 정규화된 URL 저장)
    const insertRequests = newUrls
      .map((url) => {
        const normalizedUrl = PlatformDetector.normalizeUrl(url);
        const platform = PlatformDetector.detectPlatform(url);
        const platformId = platform ? platformIdMap.get(platform) : undefined;

        if (!platformId) {
          logger.warn({ url, platform }, "platform_id 없음 - INSERT 스킵");
          return null;
        }

        return {
          product_id,
          link_url: normalizedUrl,
          platform_id: platformId,
          auto_crawled: true,
          sale_status: "off_sale",
        };
      })
      .filter((req): req is NonNullable<typeof req> => req !== null);

    if (insertRequests.length === 0) {
      return {
        product_id,
        success: true,
        skipped: true,
        skip_reason: "platform_id_mapping_failed",
        search_result_count: searchResultCount,
        valid_url_count: validUrls.length,
        inserted_count: 0,
        enqueued_count: 0,
        duration_ms: Date.now() - startTime,
      };
    }

    const insertedResults =
      await this.productSetRepository.insertMany(insertRequests);
    const insertedProductSetIds = insertedResults.map((r) => r.product_set_id);

    logger.info(
      { product_id, inserted_count: insertedProductSetIds.length },
      "product_sets INSERT 완료",
    );

    // 8. workflow enqueue (각 product_set_id에 대해)
    for (const productSetId of insertedProductSetIds) {
      await this.enqueueWorkflow(productSetId, updateWorkflowId);
    }

    return {
      product_id,
      success: true,
      skipped: false,
      search_result_count: searchResultCount,
      valid_url_count: validUrls.length,
      inserted_count: insertedProductSetIds.length,
      enqueued_count: insertedProductSetIds.length,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Workflow Job 생성 및 enqueue
   */
  private async enqueueWorkflow(
    productSetId: string,
    workflowId: string,
  ): Promise<void> {
    const job: Job = {
      job_id: uuidv7(),
      workflow_id: workflowId,
      status: JobStatus.PENDING,
      priority: JobPriority.NORMAL,
      platform: this.DEFAULT_PLATFORM,
      params: {
        product_set_id: productSetId,
        update_sale_status: true,
      },
      current_node: null,
      progress: 0,
      result: {},
      error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      metadata: {
        source: "daily_sync_workflow",
        auto_crawled: true,
      },
    };

    await this.workflowRepository.enqueueJob(job);
  }

  /**
   * 완료 시 Notify Job enqueue (별도 workflow)
   */
  private async enqueueNotifyJob(
    input: DailySyncBatchInput,
    logger: INodeContext["logger"],
  ): Promise<void> {
    const job: Job = {
      job_id: uuidv7(),
      workflow_id: this.DEFAULT_NOTIFY_WORKFLOW_ID,
      status: JobStatus.PENDING,
      priority: JobPriority.NORMAL,
      platform: this.DEFAULT_PLATFORM,
      params: {
        job_log_file: input.job_log_file,
        total_products: input.total_products,
        started_at: input.started_at,
      },
      current_node: null,
      progress: 0,
      result: {},
      error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      metadata: {
        source: "daily_sync_workflow_notify",
      },
    };

    await this.workflowRepository.enqueueJob(job);

    logger.info({ notify_job_id: job.job_id }, "Notify Job enqueued");
  }

  /**
   * 다음 처리를 위한 Job enqueue (Queue 공정성)
   */
  private async enqueueNextJob(
    input: DailySyncBatchInput,
    remainingProducts: DailySyncProduct[],
    workflowId: string,
    logger: INodeContext["logger"],
  ): Promise<void> {
    const processedCount = input.total_products - remainingProducts.length;

    const job: Job = {
      job_id: uuidv7(),
      workflow_id: workflowId,
      status: JobStatus.PENDING,
      priority: JobPriority.LOW, // 다른 Job이 먼저 처리될 수 있도록 LOW
      platform: this.DEFAULT_PLATFORM,
      params: {
        products: remainingProducts,
        total_products: input.total_products,
        platform_id_map: input.platform_id_map,
        job_log_file: input.job_log_file,
        started_at: input.started_at,
        dry_run: input.dry_run,
        max_per_platform: input.max_per_platform,
        update_workflow_id: input.update_workflow_id,
      },
      current_node: "process_batch", // init 건너뛰고 바로 처리
      progress: Math.floor((processedCount / input.total_products) * 100),
      result: {},
      error: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      metadata: {
        source: "daily_sync_workflow_continue",
        total_products: input.total_products,
        processed_count: processedCount,
        remaining_count: remainingProducts.length,
      },
    };

    await this.workflowRepository.enqueueJob(job);

    logger.info(
      {
        next_job_id: job.job_id,
        processed: processedCount,
        remaining: remainingProducts.length,
      },
      "다음 Job enqueued (Queue 공정성)",
    );
  }

  /**
   * JSONL 파일에 레코드 append
   */
  private appendJsonl(filePath: string, record: DailySyncLogRecord): void {
    const line = JSON.stringify(record) + "\n";
    fs.appendFileSync(filePath, line, "utf-8");
  }
}

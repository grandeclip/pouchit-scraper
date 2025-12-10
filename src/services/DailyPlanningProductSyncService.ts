/**
 * DailyPlanningProductSyncService
 *
 * 매일 products 테이블을 순회하며 새로운 기획상품을 자동 등록하는 서비스
 *
 * 플로우:
 * 1. products 전체 조회 (product_id, name, brand_id)
 * 2. brand_id → brand name 매핑
 * 3. 각 product에 대해:
 *    - unified search (brand, productName)
 *    - filter-products (LLM 필터링)
 *    - 기존 product_sets.link_url과 비교
 *    - 신규 URL → INSERT (auto_crawled=true)
 *    - workflow enqueue (extract-product-set-update-v2)
 *
 * SOLID 원칙:
 * - SRP: 일일 기획상품 동기화만 담당
 * - DIP: Repository/Service 추상화에 의존
 */

import { v7 as uuidv7 } from "uuid";
import { logger } from "@/config/logger";
import { SupabaseProductsRepository } from "@/repositories/SupabaseProductsRepository";
import { SupabaseBrandRepository } from "@/repositories/SupabaseBrandRepository";
import { SupabaseProductRepository } from "@/repositories/SupabaseProductRepository";
import { SupabasePlatformRepository } from "@/repositories/SupabasePlatformRepository";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { SearchQueueService } from "@/services/SearchQueueService";
import { ProductFilteringService } from "@/llm/ProductFilteringService";
import { logLlmCost } from "@/llm/LlmCostLogger";
import { Job, JobStatus, JobPriority } from "@/core/domain/Workflow";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import type { ProductEntity } from "@/core/interfaces/IProductsRepository";
import type { UnifiedSearchResponse } from "@/services/UnifiedSearchService";

// ============================================
// Slack 알림 설정
// ============================================

const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

// ============================================
// 인터페이스 정의
// ============================================

/**
 * 동기화 설정
 */
export interface SyncConfig {
  /** 배치 크기 (한 번에 처리할 product 수) */
  batchSize?: number;

  /** 요청 간 딜레이 (ms) */
  delayMs?: number;

  /** dry run 모드 (실제 INSERT/enqueue 하지 않음) */
  dryRun?: boolean;

  /** 특정 product_id만 처리 (테스트용) */
  productIds?: string[];
}

/**
 * 동기화 결과
 */
export interface SyncResult {
  /** 총 처리된 product 수 */
  totalProducts: number;

  /** 성공한 product 수 */
  successCount: number;

  /** 스킵된 product 수 (검색 결과 없음 등) */
  skippedCount: number;

  /** 실패한 product 수 */
  failedCount: number;

  /** 새로 등록된 product_set 수 */
  newProductSetsCount: number;

  /** 생성된 workflow job 수 */
  enqueuedJobsCount: number;

  /** 소요 시간 (ms) */
  durationMs: number;

  /** 에러 목록 */
  errors: Array<{
    product_id: string;
    error: string;
  }>;
}

/**
 * 단일 product 처리 결과
 */
interface ProductSyncResult {
  product_id: string;
  success: boolean;
  newUrls: string[];
  insertedProductSetIds: string[];
  error?: string;
}

// ============================================
// 서비스 클래스
// ============================================

/**
 * 일일 기획상품 동기화 서비스
 */
export class DailyPlanningProductSyncService {
  private productsRepository: SupabaseProductsRepository;
  private brandRepository: SupabaseBrandRepository;
  private productSetRepository: SupabaseProductRepository;
  private platformRepository: SupabasePlatformRepository;
  private workflowRepository: RedisWorkflowRepository;
  private searchService: SearchQueueService;
  private filteringService: ProductFilteringService;

  private readonly WORKFLOW_ID = "extract-product-set-update-v2";
  private readonly PLATFORM = "default"; // worker_default가 처리

  constructor() {
    this.productsRepository = new SupabaseProductsRepository();
    this.brandRepository = new SupabaseBrandRepository();
    this.productSetRepository = new SupabaseProductRepository();
    this.platformRepository = new SupabasePlatformRepository();
    this.workflowRepository = new RedisWorkflowRepository();
    this.searchService = SearchQueueService.getInstance();
    this.filteringService = new ProductFilteringService();
  }

  /**
   * 동기화 실행
   */
  async sync(config: SyncConfig = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const {
      batchSize = 10,
      delayMs = 2000,
      dryRun = false,
      productIds,
    } = config;

    logger.info(
      { batchSize, delayMs, dryRun, productIds },
      "[DailySync] 동기화 시작",
    );

    const result: SyncResult = {
      totalProducts: 0,
      successCount: 0,
      skippedCount: 0,
      failedCount: 0,
      newProductSetsCount: 0,
      enqueuedJobsCount: 0,
      durationMs: 0,
      errors: [],
    };

    try {
      // 1. products 조회
      let products: ProductEntity[];
      if (productIds && productIds.length > 0) {
        // 특정 product_id만 처리
        const allProducts = await this.productsRepository.findAll();
        products = allProducts.filter((p) => productIds.includes(p.product_id));
      } else {
        products = await this.productsRepository.findAll();
      }

      result.totalProducts = products.length;
      logger.info({ count: products.length }, "[DailySync] products 조회 완료");

      if (products.length === 0) {
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // 2. brand_id → brand name 매핑 (일괄 조회)
      const brandIds = [...new Set(products.map((p) => p.brand_id))];
      const brandMap = await this.brandRepository.getNamesByIds(brandIds);
      logger.info({ brandCount: brandMap.size }, "[DailySync] brand 매핑 완료");

      // 3. platform_id 매핑 (한 번만 조회)
      const platformIdMap = await this.platformRepository.findIdsByNames([
        "oliveyoung",
        "hwahae",
        "zigzag",
        "musinsa",
        "ably",
        "kurly",
      ]);
      logger.info(
        { platformCount: platformIdMap.size },
        "[DailySync] platform 매핑 완료",
      );

      // 4. 배치 처리
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        logger.info(
          {
            batch: Math.floor(i / batchSize) + 1,
            totalBatches: Math.ceil(products.length / batchSize),
            batchSize: batch.length,
          },
          "[DailySync] 배치 처리 시작",
        );

        for (const product of batch) {
          const brandName = brandMap.get(product.brand_id);
          if (!brandName) {
            result.skippedCount++;
            logger.warn(
              { product_id: product.product_id, brand_id: product.brand_id },
              "[DailySync] brand 찾을 수 없음, 스킵",
            );
            continue;
          }

          try {
            const productResult = await this.processProduct(
              product,
              brandName,
              platformIdMap,
              dryRun,
            );

            if (productResult.success) {
              result.successCount++;
              result.newProductSetsCount +=
                productResult.insertedProductSetIds.length;
              result.enqueuedJobsCount +=
                productResult.insertedProductSetIds.length;
            } else if (productResult.error) {
              result.failedCount++;
              result.errors.push({
                product_id: product.product_id,
                error: productResult.error,
              });
            } else {
              result.skippedCount++;
            }
          } catch (error) {
            result.failedCount++;
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            result.errors.push({
              product_id: product.product_id,
              error: errorMessage,
            });
            logger.error(
              { product_id: product.product_id, error: errorMessage },
              "[DailySync] product 처리 실패",
            );
          }

          // 요청 간 딜레이
          if (delayMs > 0) {
            await this.delay(delayMs);
          }
        }
      }

      result.durationMs = Date.now() - startTime;

      logger.info(
        {
          totalProducts: result.totalProducts,
          successCount: result.successCount,
          skippedCount: result.skippedCount,
          failedCount: result.failedCount,
          newProductSetsCount: result.newProductSetsCount,
          enqueuedJobsCount: result.enqueuedJobsCount,
          durationMs: result.durationMs,
        },
        "[DailySync] 동기화 완료",
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "[DailySync] 동기화 실패");
      result.durationMs = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * 단일 product 처리
   */
  private async processProduct(
    product: ProductEntity,
    brandName: string,
    platformIdMap: Map<string, number>,
    dryRun: boolean,
  ): Promise<ProductSyncResult> {
    const { product_id, name: productName } = product;

    logger.debug(
      { product_id, productName, brandName },
      "[DailySync] product 처리 시작",
    );

    // 1. 통합 검색
    let searchResult: UnifiedSearchResponse;
    try {
      searchResult = await this.searchService.search({
        brand: brandName,
        productName,
        maxPerPlatform: 10,
      });
    } catch (error) {
      return {
        product_id,
        success: false,
        newUrls: [],
        insertedProductSetIds: [],
        error: `검색 실패: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 검색 결과가 없으면 스킵
    if (searchResult.summary.totalProducts === 0) {
      logger.debug({ product_id }, "[DailySync] 검색 결과 없음, 스킵");
      return {
        product_id,
        success: true,
        newUrls: [],
        insertedProductSetIds: [],
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
        newUrls: [],
        insertedProductSetIds: [],
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
        job_id: `daily_sync_${product_id}`,
        platform: "daily_sync",
        product_set_id: product_id, // product_id 사용 (아직 product_set_id 없음)
        operation: "product_filtering",
        model: filterResult.model,
        input_tokens: filterResult.usage.promptTokenCount ?? 0,
        output_tokens: filterResult.usage.candidatesTokenCount ?? 0,
      });
    } catch (error) {
      return {
        product_id,
        success: false,
        newUrls: [],
        insertedProductSetIds: [],
        error: `필터링 실패: ${error instanceof Error ? error.message : String(error)}`,
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
      logger.debug({ product_id }, "[DailySync] 유효한 URL 없음");
      return {
        product_id,
        success: true,
        newUrls: [],
        insertedProductSetIds: [],
      };
    }

    // 5. 기존 product_sets의 link_url 조회 (정규화된 URL로 비교)
    const existingProductSets = await this.productSetRepository.search({
      product_id,
    });
    // 기존 URL을 정규화하여 Set 생성 (쿼리 파라미터 제거된 canonical URL)
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
      logger.debug(
        { product_id, validUrlCount: validUrls.length },
        "[DailySync] 신규 URL 없음 (모두 기존 등록됨)",
      );
      return {
        product_id,
        success: true,
        newUrls: [],
        insertedProductSetIds: [],
      };
    }

    logger.info(
      { product_id, newUrlCount: newUrls.length },
      "[DailySync] 신규 URL 발견",
    );

    if (dryRun) {
      logger.info(
        { product_id, newUrls },
        "[DailySync] DRY RUN - INSERT/enqueue 스킵",
      );
      return {
        product_id,
        success: true,
        newUrls,
        insertedProductSetIds: [],
      };
    }

    // 7. product_sets INSERT (auto_crawled=true, 정규화된 URL 저장)
    const insertRequests = newUrls
      .map((url) => {
        const normalizedUrl = PlatformDetector.normalizeUrl(url);
        const platform = PlatformDetector.detectPlatform(url);
        const platformId = platform ? platformIdMap.get(platform) : undefined;

        if (!platformId) {
          logger.warn(
            { url, platform },
            "[DailySync] platform_id 없음 - INSERT 스킵",
          );
          return null;
        }

        return {
          product_id,
          link_url: normalizedUrl,
          platform_id: platformId,
          auto_crawled: true,
          sale_status: "off_sale", // auto_crawled=true는 off_sale로 시작
        };
      })
      .filter((req): req is NonNullable<typeof req> => req !== null);

    if (insertRequests.length === 0) {
      logger.debug(
        { product_id, newUrlCount: newUrls.length },
        "[DailySync] 유효한 INSERT 요청 없음 (platform_id 매핑 실패)",
      );
      return {
        product_id,
        success: true,
        newUrls: [],
        insertedProductSetIds: [],
      };
    }

    const insertedResults =
      await this.productSetRepository.insertMany(insertRequests);
    const insertedProductSetIds = insertedResults.map((r) => r.product_set_id);

    logger.info(
      { product_id, insertedCount: insertedProductSetIds.length },
      "[DailySync] product_sets INSERT 완료",
    );

    // 8. workflow enqueue (각 product_set_id에 대해)
    for (const productSetId of insertedProductSetIds) {
      await this.enqueueWorkflow(productSetId);
    }

    return {
      product_id,
      success: true,
      newUrls,
      insertedProductSetIds,
    };
  }

  /**
   * Workflow Job 생성 및 enqueue
   */
  private async enqueueWorkflow(productSetId: string): Promise<void> {
    const job: Job = {
      job_id: uuidv7(),
      workflow_id: this.WORKFLOW_ID,
      status: JobStatus.PENDING,
      priority: JobPriority.NORMAL,
      platform: this.PLATFORM,
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
        source: "daily_planning_sync",
        auto_crawled: true,
      },
    };

    await this.workflowRepository.enqueueJob(job);

    logger.debug(
      { job_id: job.job_id, product_set_id: productSetId },
      "[DailySync] workflow enqueued",
    );
  }

  /**
   * 딜레이 헬퍼
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================
  // Slack 알림
  // ============================================

  /**
   * 시작 알림 발송
   */
  async sendStartNotification(totalProducts: number): Promise<boolean> {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.ALERT_SLACK_CHANNEL_ID;

    if (!slackToken || !channelId) {
      logger.warn(
        "SLACK_BOT_TOKEN 또는 ALERT_SLACK_CHANNEL_ID 미설정 - 알림 스킵",
      );
      return false;
    }

    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    const message = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🚀 *Daily Sync 시작*\n\n• 대상 상품: *${totalProducts}*개\n• 시작 시간: ${now}`,
          },
        },
      ],
    };

    return this.sendSlackMessage(slackToken, channelId, message);
  }

  /**
   * 완료 알림 발송
   */
  async sendCompleteNotification(result: SyncResult): Promise<boolean> {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.ALERT_SLACK_CHANNEL_ID;

    if (!slackToken || !channelId) {
      logger.warn(
        "SLACK_BOT_TOKEN 또는 ALERT_SLACK_CHANNEL_ID 미설정 - 알림 스킵",
      );
      return false;
    }

    const durationMin = Math.floor(result.durationMs / 60000);
    const durationSec = Math.floor((result.durationMs % 60000) / 1000);
    const emoji = result.failedCount > 0 ? "⚠️" : "✅";

    const message = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *Daily Sync 완료*`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*총 상품*\n${result.totalProducts}개`,
            },
            {
              type: "mrkdwn",
              text: `*성공*\n${result.successCount}개`,
            },
            {
              type: "mrkdwn",
              text: `*스킵*\n${result.skippedCount}개`,
            },
            {
              type: "mrkdwn",
              text: `*실패*\n${result.failedCount}개`,
            },
          ],
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*신규 ProductSet*\n${result.newProductSetsCount}개`,
            },
            {
              type: "mrkdwn",
              text: `*소요 시간*\n${durationMin}분 ${durationSec}초`,
            },
          ],
        },
      ],
    };

    return this.sendSlackMessage(slackToken, channelId, message);
  }

  /**
   * Slack 메시지 발송
   */
  private async sendSlackMessage(
    token: string,
    channelId: string,
    message: { blocks: unknown[] },
  ): Promise<boolean> {
    try {
      const response = await fetch(SLACK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: channelId,
          ...message,
        }),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, "[DailySync] Slack API 오류");
        return false;
      }

      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        logger.warn({ error: result.error }, "[DailySync] Slack API 에러");
        return false;
      }

      logger.info("[DailySync] Slack 알림 발송 완료");
      return true;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySync] Slack 알림 발송 실패",
      );
      return false;
    }
  }
}

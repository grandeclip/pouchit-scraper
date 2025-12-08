/**
 * UnifiedSearchService - 통합 상품 검색 서비스
 *
 * SOLID 원칙:
 * - SRP: 6개 플랫폼 통합 검색만 담당
 * - DIP: SearcherFactory 추상화에 의존
 *
 * 특징:
 * - 6개 플랫폼 병렬 검색 (Promise.allSettled)
 * - 각 플랫폼 독립 브라우저 생성/정리 (격리)
 * - 한 플랫폼 실패가 다른 플랫폼에 영향 없음
 */

import { v7 as uuidv7 } from "uuid";
import { getSupportedSearchPlatforms, registerAllSearchers } from "@/searchers";
import { SearcherFactory } from "@/searchers/base/SearcherFactory";
import type {
  SearchRequest,
  SearchResult,
} from "@/core/domain/search/SearchProduct";
import { logger } from "@/config/logger";
import { SearchResultWriter } from "@/utils/SearchResultWriter";

/**
 * 통합 검색 요청 타입
 */
export interface UnifiedSearchRequest {
  /** 브랜드명 */
  brand: string;
  /** 상품명 */
  productName: string;
  /** 플랫폼별 최대 결과 수 (default: 5) */
  maxPerPlatform?: number;
}

/**
 * 단순화된 상품 정보 (필수 필드만)
 */
export interface SimpleProduct {
  productName: string;
  thumbnail: string;
  productUrl: string;
  platform: string;
}

/**
 * 플랫폼별 검색 결과
 */
export interface PlatformSearchResult {
  platform: string;
  success: boolean;
  products: SimpleProduct[];
  totalCount: number;
  durationMs: number;
  error?: string;
}

/**
 * 통합 검색 응답 타입
 */
export interface UnifiedSearchResponse {
  /** Job ID */
  jobId: string;
  /** 검색 키워드 */
  keyword: string;
  /** 브랜드명 */
  brand: string;
  /** 상품명 */
  productName: string;
  /** 플랫폼별 최대 결과 수 */
  maxPerPlatform: number;
  /** 플랫폼별 검색 결과 */
  platforms: PlatformSearchResult[];
  /** 요약 통계 */
  summary: {
    totalPlatforms: number;
    successPlatforms: number;
    failedPlatforms: number;
    totalProducts: number;
    durationMs: number;
  };
  /** 결과 파일 경로 */
  resultFilePath: string;
}

/**
 * UnifiedSearchService
 *
 * 6개 플랫폼을 병렬로 검색하고 결과를 통합
 * 각 플랫폼은 독립적인 브라우저를 생성하여 격리된 환경에서 실행
 */
export class UnifiedSearchService {
  private initialized: boolean = false;

  /**
   * 서비스 초기화 (Searcher 등록)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    registerAllSearchers();
    this.initialized = true;

    logger.info(
      { platforms: getSupportedSearchPlatforms() },
      "[UnifiedSearch] 서비스 초기화 완료",
    );
  }

  /**
   * 통합 검색 실행 (병렬)
   *
   * @param request 검색 요청
   * @returns 통합 검색 결과
   */
  async search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    // 초기화 확인
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const jobId = uuidv7();
    const maxPerPlatform = request.maxPerPlatform ?? 5;
    const keyword = `${request.brand} ${request.productName}`.trim();
    const platforms = getSupportedSearchPlatforms();

    logger.info(
      {
        job_id: jobId,
        keyword,
        max_per_platform: maxPerPlatform,
        platforms,
      },
      "[UnifiedSearch] 병렬 검색 시작",
    );

    // 모든 플랫폼 병렬 검색 (Promise.allSettled)
    const searchPromises = platforms.map((platform) =>
      this.searchPlatform(platform, keyword, maxPerPlatform),
    );

    const results = await Promise.allSettled(searchPromises);

    // 결과 처리
    const platformResults: PlatformSearchResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let totalProductCount = 0;

    results.forEach((result, index) => {
      const platform = platforms[index];

      if (result.status === "fulfilled") {
        platformResults.push(result.value);
        if (result.value.success) {
          successCount++;
          totalProductCount += result.value.products.length;
        } else {
          failedCount++;
        }
      } else {
        // Promise rejection (unexpected)
        failedCount++;
        platformResults.push({
          platform,
          success: false,
          products: [],
          totalCount: 0,
          durationMs: 0,
          error: result.reason?.message || "Unknown error",
        });
      }
    });

    const totalDuration = Date.now() - startTime;

    // JSONL 파일 저장
    const resultFilePath = await this.writeResultToJsonl({
      jobId,
      brand: request.brand,
      productName: request.productName,
      maxPerPlatform,
      platformResults,
    });

    logger.info(
      {
        job_id: jobId,
        total_products: totalProductCount,
        success_platforms: successCount,
        failed_platforms: failedCount,
        duration_ms: totalDuration,
        result_file: resultFilePath,
      },
      "[UnifiedSearch] 병렬 검색 완료",
    );

    return {
      jobId,
      keyword,
      brand: request.brand,
      productName: request.productName,
      maxPerPlatform,
      platforms: platformResults,
      summary: {
        totalPlatforms: platforms.length,
        successPlatforms: successCount,
        failedPlatforms: failedCount,
        totalProducts: totalProductCount,
        durationMs: totalDuration,
      },
      resultFilePath,
    };
  }

  /**
   * 검색 결과를 JSONL 파일로 저장
   */
  private async writeResultToJsonl(params: {
    jobId: string;
    brand: string;
    productName: string;
    maxPerPlatform: number;
    platformResults: PlatformSearchResult[];
  }): Promise<string> {
    const writer = new SearchResultWriter({
      jobId: params.jobId,
      brand: params.brand,
      productName: params.productName,
      maxPerPlatform: params.maxPerPlatform,
    });

    try {
      await writer.initialize();

      // 각 플랫폼 결과 작성
      for (const result of params.platformResults) {
        await writer.appendPlatformResult({
          platform: result.platform,
          success: result.success,
          count: result.products.length,
          totalCount: result.totalCount,
          durationMs: result.durationMs,
          error: result.error,
        });
      }

      const { filePath } = await writer.finalize();
      return filePath;
    } catch (error) {
      await writer.cleanup();
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "[UnifiedSearch] JSONL 파일 저장 실패",
      );
      return "";
    }
  }

  /**
   * 단일 플랫폼 검색
   *
   * 각 호출마다 새로운 Searcher 인스턴스를 생성하고 정리
   * 독립적인 브라우저 환경에서 실행되어 다른 플랫폼에 영향 없음
   */
  private async searchPlatform(
    platform: string,
    keyword: string,
    limit: number,
  ): Promise<PlatformSearchResult> {
    const startTime = Date.now();
    let searcher: ReturnType<typeof SearcherFactory.createSearcher> | null =
      null;

    try {
      // 새 Searcher 인스턴스 생성 (캐싱 없음)
      searcher = SearcherFactory.createSearcher(platform);
      const searchRequest: SearchRequest = { keyword, limit };

      const result: SearchResult = await searcher.search(searchRequest);
      const durationMs = Date.now() - startTime;

      // SearchProduct → SimpleProduct 변환
      const simpleProducts: SimpleProduct[] = result.products.map((p) => ({
        productName: p.productName,
        thumbnail: p.thumbnail || "",
        productUrl: p.productUrl,
        platform: p.platform,
      }));

      logger.debug(
        {
          platform,
          keyword,
          count: simpleProducts.length,
          total_count: result.totalCount,
          duration_ms: durationMs,
        },
        "[UnifiedSearch] 플랫폼 검색 완료",
      );

      return {
        platform,
        success: true,
        products: simpleProducts,
        totalCount: result.totalCount,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.warn(
        {
          platform,
          keyword,
          error: errorMessage,
          duration_ms: durationMs,
        },
        "[UnifiedSearch] 플랫폼 검색 실패",
      );

      return {
        platform,
        success: false,
        products: [],
        totalCount: 0,
        durationMs,
        error: errorMessage,
      };
    } finally {
      // 브라우저 정리 (각 플랫폼 독립적으로 리소스 해제)
      if (searcher) {
        try {
          await searcher.cleanup();
        } catch (cleanupError) {
          logger.warn(
            { platform, error: cleanupError },
            "[UnifiedSearch] cleanup 실패 (무시됨)",
          );
        }
      }
    }
  }
}

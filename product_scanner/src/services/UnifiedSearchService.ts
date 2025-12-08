/**
 * UnifiedSearchService - 통합 상품 검색 서비스
 *
 * SOLID 원칙:
 * - SRP: 6개 플랫폼 통합 검색만 담당
 * - DIP: SearcherRegistry 추상화에 의존
 *
 * 목적:
 * - brand + productName 조합으로 6개 쇼핑몰 순차 검색
 * - JSONL 로깅 (SearchResultWriter)
 * - 통합 결과 반환
 */

import { v7 as uuidv7 } from "uuid";
import { SearcherRegistry } from "@/services/SearcherRegistry";
import { getSupportedSearchPlatforms, registerAllSearchers } from "@/searchers";
import {
  SearchResultWriter,
  type PlatformSearchSummary,
} from "@/utils/SearchResultWriter";
import type {
  SearchRequest,
  SearchResult,
} from "@/core/domain/search/SearchProduct";
import { logger } from "@/config/logger";

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
  /** 플랫폼별 검색 결과 */
  platforms: PlatformSearchResult[];
  /** 통합된 모든 상품 */
  allProducts: SimpleProduct[];
  /** 요약 통계 */
  summary: {
    totalPlatforms: number;
    successPlatforms: number;
    failedPlatforms: number;
    totalProducts: number;
    durationMs: number;
  };
}

/**
 * UnifiedSearchService
 *
 * 6개 플랫폼을 순차적으로 검색하고 결과를 통합
 */
export class UnifiedSearchService {
  private registry: SearcherRegistry;
  private initialized: boolean = false;

  constructor() {
    this.registry = SearcherRegistry.getInstance();
  }

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
   * 통합 검색 실행
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
        brand: request.brand,
        product_name: request.productName,
        keyword,
        max_per_platform: maxPerPlatform,
        platforms,
      },
      "[UnifiedSearch] 통합 검색 시작",
    );

    // JSONL Writer 초기화
    const writer = new SearchResultWriter({
      jobId,
      brand: request.brand,
      productName: request.productName,
      maxPerPlatform,
    });

    await writer.initialize();

    const platformResults: PlatformSearchResult[] = [];
    const allProducts: SimpleProduct[] = [];

    try {
      // 각 플랫폼 순차 검색
      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i];

        // 첫 번째 플랫폼이 아닌 경우, 이전 플랫폼의 리소스 해제를 위한 대기
        // BrowserPool size=1 → cleanup/acquire 간 race condition 방지
        if (i > 0) {
          await this.sleep(500);
        }

        const platformResult = await this.searchPlatform(
          platform,
          keyword,
          maxPerPlatform,
        );

        platformResults.push(platformResult);

        // JSONL에 결과 기록
        const summary: PlatformSearchSummary = {
          platform: platformResult.platform,
          success: platformResult.success,
          count: platformResult.products.length,
          totalCount: platformResult.totalCount,
          durationMs: platformResult.durationMs,
          error: platformResult.error,
        };

        await writer.appendPlatformResult(summary);

        // 성공한 결과만 통합
        if (platformResult.success) {
          allProducts.push(...platformResult.products);
        }
      }

      // Writer 종료
      const { summary } = await writer.finalize();
      const totalDuration = Date.now() - startTime;

      logger.info(
        {
          job_id: jobId,
          total_products: allProducts.length,
          success_platforms: summary.successPlatforms,
          failed_platforms: summary.failedPlatforms,
          duration_ms: totalDuration,
        },
        "[UnifiedSearch] 통합 검색 완료",
      );

      return {
        jobId,
        keyword,
        platforms: platformResults,
        allProducts,
        summary: {
          totalPlatforms: summary.totalPlatforms,
          successPlatforms: summary.successPlatforms,
          failedPlatforms: summary.failedPlatforms,
          totalProducts: summary.totalProducts,
          durationMs: totalDuration,
        },
      };
    } catch (error) {
      // 에러 발생 시 Writer 정리
      await writer.cleanup();
      throw error;
    }
  }

  /**
   * 단일 플랫폼 검색
   *
   * 중요: 검색 후 반드시 cleanup() 호출하여 브라우저 풀에 반환
   * BrowserPool size가 1이므로 다음 플랫폼이 사용할 수 있도록 해야 함
   */
  private async searchPlatform(
    platform: string,
    keyword: string,
    limit: number,
  ): Promise<PlatformSearchResult> {
    const startTime = Date.now();
    let searcher: ReturnType<typeof this.registry.getSearcher> | null = null;

    try {
      searcher = this.registry.getSearcher(platform);
      const searchRequest: SearchRequest = { keyword, limit };

      const result: SearchResult = await searcher.search(searchRequest);
      const durationMs = Date.now() - startTime;

      // SearchProduct → SimpleProduct 변환 (필요한 필드만 추출)
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
      // 반드시 cleanup 호출하여 브라우저 반환 (다음 플랫폼이 사용할 수 있도록)
      if (searcher) {
        try {
          await searcher.cleanup();
          // Registry에서 제거하여 다음 검색 시 새 인스턴스 생성
          // (캐시된 인스턴스의 상태 불일치 문제 방지)
          await this.registry.removeSearcher(platform);
        } catch (cleanupError) {
          logger.warn(
            { platform, error: cleanupError },
            "[UnifiedSearch] cleanup 실패 (무시됨)",
          );
        }
      }
    }
  }

  /**
   * 지정된 시간만큼 대기
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    await this.registry.clearAll();
    this.initialized = false;
  }
}

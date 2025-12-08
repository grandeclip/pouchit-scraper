/**
 * SearchQueueService - 검색 요청 큐 서비스
 *
 * 역할:
 * - 동시 1개 검색만 실행 (Mutex 기반)
 * - 연속 요청 시 대기 후 순차 처리
 * - 6개 브라우저 동시 실행으로 인한 리소스 폭발 방지
 *
 * SOLID 원칙:
 * - SRP: 검색 요청 큐잉만 담당
 * - DIP: UnifiedSearchService 추상화에 의존
 */

import { Mutex } from "async-mutex";
import {
  UnifiedSearchService,
  type UnifiedSearchRequest,
  type UnifiedSearchResponse,
} from "@/services/UnifiedSearchService";
import { logger } from "@/config/logger";

/**
 * 큐 상태 정보
 */
export interface QueueStatus {
  /** 현재 처리 중인 요청 여부 */
  isProcessing: boolean;
  /** 대기 중인 요청 수 */
  waitingCount: number;
}

/**
 * SearchQueueService (Singleton)
 *
 * Mutex를 사용하여 동시에 1개의 통합 검색만 실행
 * 다른 요청은 대기 후 순차 처리
 */
export class SearchQueueService {
  private static instance: SearchQueueService;
  private mutex: Mutex;
  private searchService: UnifiedSearchService;
  private waitingCount: number = 0;
  private isProcessing: boolean = false;

  private constructor() {
    this.mutex = new Mutex();
    this.searchService = new UnifiedSearchService();
  }

  /**
   * Singleton 인스턴스 반환
   */
  static getInstance(): SearchQueueService {
    if (!SearchQueueService.instance) {
      SearchQueueService.instance = new SearchQueueService();
    }
    return SearchQueueService.instance;
  }

  /**
   * 통합 검색 요청 (큐잉)
   *
   * 동시 1개만 실행, 나머지는 대기
   * 클라이언트는 결과가 나올 때까지 대기 (동기식 응답)
   */
  async search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    this.waitingCount++;

    logger.info(
      {
        waiting_count: this.waitingCount,
        is_processing: this.isProcessing,
        keyword: `${request.brand} ${request.productName}`.trim(),
      },
      "[SearchQueue] 검색 요청 대기 중",
    );

    // Mutex 획득 (FIFO 순서 보장)
    const release = await this.mutex.acquire();

    try {
      this.waitingCount--;
      this.isProcessing = true;

      logger.info(
        {
          waiting_count: this.waitingCount,
          keyword: `${request.brand} ${request.productName}`.trim(),
        },
        "[SearchQueue] 검색 시작",
      );

      // 실제 검색 실행
      const result = await this.searchService.search(request);

      logger.info(
        {
          job_id: result.jobId,
          success_platforms: result.summary.successPlatforms,
          duration_ms: result.summary.durationMs,
        },
        "[SearchQueue] 검색 완료",
      );

      return result;
    } finally {
      this.isProcessing = false;
      release();
    }
  }

  /**
   * 큐 상태 조회
   */
  getStatus(): QueueStatus {
    return {
      isProcessing: this.isProcessing,
      waitingCount: this.waitingCount,
    };
  }
}

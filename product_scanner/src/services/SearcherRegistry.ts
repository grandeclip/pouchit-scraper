/**
 * SearcherRegistry - Searcher 레지스트리
 * Singleton + Registry Pattern
 *
 * 역할:
 * - Searcher 인스턴스 생성 및 캐싱
 * - 재사용 가능한 Searcher 관리
 * - 리소스 정리 (cleanup)
 *
 * SOLID 원칙:
 * - SRP: Searcher 인스턴스 관리만 담당
 * - DIP: ISearcher 인터페이스에 의존
 */

import type { ISearcher } from "@/core/interfaces/search/ISearcher";
import { SearcherFactory } from "@/searchers/base/SearcherFactory";
import { logger } from "@/config/logger";

/**
 * Searcher Registry (Singleton)
 */
export class SearcherRegistry {
  private static instance: SearcherRegistry;
  private searchers: Map<string, ISearcher> = new Map();

  private constructor() {}

  /**
   * Singleton 인스턴스 반환
   */
  static getInstance(): SearcherRegistry {
    if (!SearcherRegistry.instance) {
      SearcherRegistry.instance = new SearcherRegistry();
    }
    return SearcherRegistry.instance;
  }

  /**
   * Searcher 가져오기 (없으면 생성)
   * @param platform 플랫폼 이름
   * @param strategyId 전략 ID (옵션)
   * @returns Searcher 인스턴스
   */
  getSearcher(platform: string, strategyId?: string): ISearcher {
    const key = this.makeKey(platform, strategyId);

    // 캐시 확인
    if (!this.searchers.has(key)) {
      logger.info({ key, platform, strategyId }, "새 Searcher 생성");
      const searcher = SearcherFactory.createSearcher(platform, strategyId);
      this.searchers.set(key, searcher);
    }

    return this.searchers.get(key)!;
  }

  /**
   * Searcher 등록 (테스트용 또는 수동 등록)
   * @param platform 플랫폼 이름
   * @param searcher Searcher 인스턴스
   * @param strategyId 전략 ID (옵션)
   */
  registerSearcher(
    platform: string,
    searcher: ISearcher,
    strategyId?: string,
  ): void {
    const key = this.makeKey(platform, strategyId);
    logger.info({ key, platform, strategyId }, "Searcher 등록");
    this.searchers.set(key, searcher);
  }

  /**
   * 특정 Searcher 제거
   * @param platform 플랫폼 이름
   * @param strategyId 전략 ID (옵션)
   */
  async removeSearcher(platform: string, strategyId?: string): Promise<void> {
    const key = this.makeKey(platform, strategyId);

    if (this.searchers.has(key)) {
      const searcher = this.searchers.get(key)!;
      await searcher.cleanup();
      this.searchers.delete(key);
      logger.info({ key, platform, strategyId }, "Searcher 제거");
    }
  }

  /**
   * 모든 Searcher 정리 및 제거
   */
  async clearAll(): Promise<void> {
    logger.info({ count: this.searchers.size }, "모든 Searcher 정리 중");

    const cleanupPromises = Array.from(this.searchers.values()).map(
      (searcher) =>
        searcher.cleanup().catch((error) => {
          logger.warn({ error }, "Searcher cleanup failed");
        }),
    );

    await Promise.allSettled(cleanupPromises);
    this.searchers.clear();

    logger.info("모든 Searcher 정리 완료");
  }

  /**
   * 등록된 Searcher 개수
   */
  size(): number {
    return this.searchers.size;
  }

  /**
   * 특정 Searcher 존재 여부
   */
  has(platform: string, strategyId?: string): boolean {
    const key = this.makeKey(platform, strategyId);
    return this.searchers.has(key);
  }

  /**
   * 등록된 모든 키 목록
   */
  getRegisteredKeys(): string[] {
    return Array.from(this.searchers.keys());
  }

  /**
   * 캐시 키 생성
   */
  private makeKey(platform: string, strategyId?: string): string {
    return strategyId ? `${platform}:${strategyId}` : `${platform}:default`;
  }
}

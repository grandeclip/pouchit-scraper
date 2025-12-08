/**
 * ISearcher - Searcher 인터페이스
 *
 * SOLID 원칙:
 * - ISP: 검색 기능만 정의
 * - DIP: 구체 클래스가 아닌 인터페이스에 의존
 */

import type {
  SearchRequest,
  SearchResult,
} from "@/core/domain/search/SearchProduct";

/**
 * Searcher 인터페이스
 *
 * @template TRaw 원시 API 응답 타입 (플랫폼별 상이)
 */
export interface ISearcher<TRaw = unknown> {
  /**
   * 전략 ID 반환
   */
  getStrategyId(): string;

  /**
   * 상품 검색
   *
   * @param request 검색 요청 (keyword, limit)
   * @returns 검색 결과
   */
  search(request: SearchRequest): Promise<SearchResult>;

  /**
   * 리소스 정리
   */
  cleanup(): Promise<void>;

  /**
   * 초기화
   */
  initialize(): Promise<void>;
}

/**
 * BaseSearcher - 기본 Searcher 추상 클래스
 * Template Method Pattern
 *
 * 역할:
 * - 공통 검색 흐름 정의
 * - 하위 클래스에서 특정 단계 오버라이드 가능
 *
 * SOLID 원칙:
 * - SRP: 검색 흐름 관리만 담당
 * - OCP: 확장에 열려있고 수정에 닫혀있음
 * - LSP: 모든 하위 클래스는 이 클래스로 대체 가능
 * - DIP: 추상화(ISearcher, SearchConfig)에 의존
 *
 * @template TRaw 원시 API 응답 타입
 * @template TConfig Search Config 타입
 */

import type { ISearcher } from "@/core/interfaces/search/ISearcher";
import type {
  SearchRequest,
  SearchResult,
  SearchProduct,
} from "@/core/domain/search/SearchProduct";
import type {
  SearchConfig,
  SearchStrategyConfig,
  FieldMapping,
} from "@/core/domain/search/SearchConfig";
import { logger } from "@/config/logger";

/**
 * 기본 Searcher (Template Method Pattern)
 */
export abstract class BaseSearcher<
  TRaw = unknown,
  TConfig extends SearchConfig = SearchConfig,
> implements ISearcher<TRaw> {
  protected initialized: boolean = false;

  constructor(
    protected readonly config: TConfig,
    protected readonly strategy: SearchStrategyConfig,
  ) {}

  /**
   * 전략 ID 반환
   */
  getStrategyId(): string {
    return this.strategy.id;
  }

  /**
   * 상품 검색 (Template Method)
   *
   * 흐름:
   * 1. 초기화
   * 2. 전처리
   * 3. 검색 실행 (doSearch)
   * 4. 결과 파싱 (parseResults)
   * 5. 후처리
   */
  async search(request: SearchRequest): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      logger.debug(
        {
          strategyId: this.strategy.id,
          platform: this.config.platform,
          keyword: request.keyword,
        },
        "검색 시작",
      );

      // 1. 초기화
      await this.ensureInitialized();

      // 2. 전처리
      await this.beforeSearch(request);

      // 3. 검색 실행
      const rawData = await this.doSearch(request);

      // 4. 결과 파싱
      const products = await this.parseResults(rawData, request.limit);

      // 5. 총 결과 수 추출
      const totalCount = this.extractTotalCount(rawData);

      // 6. 후처리
      const result: SearchResult = {
        keyword: request.keyword,
        totalCount,
        products,
        platform: this.config.platform,
      };

      await this.afterSearch(result);

      const duration = Date.now() - startTime;
      logger.info(
        {
          strategyId: this.strategy.id,
          platform: this.config.platform,
          keyword: request.keyword,
          resultCount: products.length,
          totalCount,
          durationMs: duration,
        },
        "검색 완료",
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          strategyId: this.strategy.id,
          platform: this.config.platform,
          keyword: request.keyword,
          durationMs: duration,
          error: error instanceof Error ? error.message : String(error),
        },
        "검색 실패",
      );
      throw error;
    }
  }

  /**
   * 초기화 (기본 구현)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.debug(
      { strategyId: this.strategy.id, platform: this.config.platform },
      "Searcher 초기화 중...",
    );
    await this.doInitialize();
    this.initialized = true;
    logger.debug(
      { strategyId: this.strategy.id, platform: this.config.platform },
      "Searcher 초기화 완료",
    );
  }

  /**
   * 초기화 보장
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 전처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async beforeSearch(request: SearchRequest): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 후처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async afterSearch(result: SearchResult): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 필드 매핑 변환
   *
   * config.fieldMapping에 따라 원시 데이터를 SearchProduct로 변환
   */
  protected mapToSearchProduct(
    rawItem: Record<string, unknown>,
  ): SearchProduct {
    const mapping = this.config.fieldMapping;
    const platform = this.config.platform;

    const getValue = (fieldConfig: FieldMapping): unknown => {
      const value = rawItem[fieldConfig.source];

      // transform 적용
      if (fieldConfig.transform && typeof value === "string") {
        return fieldConfig.transform.replace("${value}", value);
      }

      return value;
    };

    return {
      productId: String(getValue(mapping.productId) || ""),
      productName: String(getValue(mapping.productName) || ""),
      brand: mapping.brand ? String(getValue(mapping.brand) || "") : undefined,
      thumbnail: mapping.thumbnail
        ? String(getValue(mapping.thumbnail) || "")
        : undefined,
      productUrl: String(getValue(mapping.productUrl) || ""),
      price: mapping.price
        ? Number(getValue(mapping.price)) || undefined
        : undefined,
      originalPrice: mapping.originalPrice
        ? Number(getValue(mapping.originalPrice)) || undefined
        : undefined,
      discountRate: mapping.discountRate
        ? Number(getValue(mapping.discountRate)) || undefined
        : undefined,
      platform,
    };
  }

  /**
   * Sleep 유틸리티
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 변수 치환 (${keyword} → 실제 값)
   */
  protected replaceVariables(
    template: string,
    variables: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
    }
    return result;
  }

  /**
   * 객체 내 변수 치환 (재귀)
   */
  protected replaceObjectVariables<T extends Record<string, unknown>>(
    obj: T,
    variables: Record<string, string>,
  ): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        result[key] = this.replaceVariables(value, variables);
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.replaceObjectVariables(
          value as Record<string, unknown>,
          variables,
        );
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  // ============================================
  // Abstract Methods (하위 클래스에서 구현)
  // ============================================

  /**
   * 실제 초기화 로직
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * 실제 검색 로직 (API 호출 또는 브라우저 조작)
   */
  protected abstract doSearch(request: SearchRequest): Promise<TRaw>;

  /**
   * 원시 데이터를 SearchProduct 배열로 변환
   */
  protected abstract parseResults(
    rawData: TRaw,
    limit: number,
  ): Promise<SearchProduct[]>;

  /**
   * 총 결과 수 추출
   */
  protected abstract extractTotalCount(rawData: TRaw): number;

  /**
   * 리소스 정리
   */
  abstract cleanup(): Promise<void>;
}

/**
 * ZigzagGraphQLSearcher - Zigzag GraphQL 기반 상품 검색
 * Strategy Pattern 구현체 - GraphQL 직접 호출 (Playwright 불필요)
 *
 * 역할:
 * - GraphQL API를 통한 상품 검색
 * - curl 직접 호출 가능 (Cloudflare 보호 없음)
 *
 * SOLID 원칙:
 * - SRP: Zigzag GraphQL 검색만 담당
 * - OCP: YAML 설정으로 확장 가능
 * - LSP: BaseSearcher 대체 가능
 * - DIP: SearchConfig에 의존
 */

import { BaseSearcher } from "@/searchers/base/BaseSearcher";
import type {
  SearchRequest,
  SearchProduct,
} from "@/core/domain/search/SearchProduct";
import type {
  SearchConfig,
  SearchStrategyConfig,
  GraphQLStrategy,
} from "@/core/domain/search/SearchConfig";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { logger } from "@/config/logger";

/**
 * Zigzag GraphQL 검색 응답 타입
 */
interface ZigzagSearchResponse {
  data?: {
    search_result?: {
      total_count: number;
      has_next: boolean;
      end_cursor: string | null;
      searched_keyword: string;
      ui_item_list: Array<ZigzagUiItem>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Zigzag UI Item (상품 카드)
 */
interface ZigzagUiItem {
  __typename: string;
  catalog_product_id?: string;
  title?: string;
  shop_name?: string;
  shop_id?: string;
  final_price?: number;
  discount_rate?: number;
  review_score?: number;
  display_review_count?: string;
  image_url?: string;
  webp_image_url?: string;
  product_url?: string;
  free_shipping?: boolean;
  fomo?: { text: string };
  sellable_status?: string;
}

/**
 * Zigzag GraphQL Searcher
 */
export class ZigzagGraphQLSearcher extends BaseSearcher<
  ZigzagSearchResponse,
  SearchConfig
> {
  constructor(config: SearchConfig, strategy: SearchStrategyConfig) {
    super(config, strategy);
  }

  /**
   * GraphQL 전략 설정 반환
   */
  private get graphqlStrategy(): GraphQLStrategy {
    if (!this.strategy.graphql) {
      throw new Error("GraphQL strategy configuration is required");
    }
    return this.strategy.graphql;
  }

  /**
   * 초기화 (GraphQL은 별도 초기화 불필요)
   */
  protected async doInitialize(): Promise<void> {
    // GraphQL은 브라우저 등 리소스가 필요 없으므로 초기화 작업 없음
    logger.debug(
      { platform: this.config.platform },
      "ZigzagGraphQLSearcher initialized",
    );
  }

  /**
   * 검색 실행 (GraphQL API 호출)
   */
  protected async doSearch(
    request: SearchRequest,
  ): Promise<ZigzagSearchResponse> {
    // Rate limiting 방지
    if (this.graphqlStrategy.requestDelay) {
      await this.sleep(this.graphqlStrategy.requestDelay);
    }

    return await this.fetchWithRetry(request.keyword);
  }

  /**
   * 결과 파싱 (GraphQL 응답 → SearchProduct[])
   */
  protected async parseResults(
    rawData: ZigzagSearchResponse,
    limit: number,
  ): Promise<SearchProduct[]> {
    // GraphQL 에러 체크
    if (rawData.errors && rawData.errors.length > 0) {
      const errorMessages = rawData.errors.map((e) => e.message).join(", ");
      throw new Error(`GraphQL Error: ${errorMessages}`);
    }

    // 데이터 존재 확인
    if (!rawData.data?.search_result?.ui_item_list) {
      logger.warn({ platform: this.config.platform }, "검색 결과 없음");
      return [];
    }

    const items = rawData.data.search_result.ui_item_list;

    // UxGoodsCardItem 타입만 필터링
    const productItems = items
      .filter(
        (item): item is ZigzagUiItem & { __typename: "UxGoodsCardItem" } =>
          item.__typename === "UxGoodsCardItem" && !!item.catalog_product_id,
      )
      .slice(0, limit);

    // SearchProduct로 변환
    return productItems.map((item) => this.mapZigzagProduct(item));
  }

  /**
   * 총 결과 수 추출
   */
  protected extractTotalCount(rawData: ZigzagSearchResponse): number {
    return rawData.data?.search_result?.total_count ?? 0;
  }

  /**
   * 리소스 정리 (GraphQL은 정리할 리소스 없음)
   */
  async cleanup(): Promise<void> {
    logger.debug(
      { platform: this.config.platform },
      "ZigzagGraphQLSearcher cleanup",
    );
  }

  /**
   * Zigzag 상품 → SearchProduct 변환
   * API의 product_url은 store.zigzag.kr 형식이므로 정규화 필요
   */
  private mapZigzagProduct(item: ZigzagUiItem): SearchProduct {
    const productId = item.catalog_product_id || "";

    return {
      productId,
      productName: item.title || "",
      brand: item.shop_name,
      thumbnail: item.webp_image_url || item.image_url,
      productUrl: PlatformDetector.buildProductUrl("zigzag", productId),
      price: item.final_price,
      discountRate: item.discount_rate,
      platform: this.config.platform,
    };
  }

  /**
   * Retry 로직이 포함된 fetch
   */
  private async fetchWithRetry(
    keyword: string,
    attempt: number = 1,
  ): Promise<ZigzagSearchResponse> {
    try {
      // 변수 치환 (${keyword})
      const variables = this.buildVariables(keyword);

      logger.debug(
        { keyword, attempt, endpoint: this.graphqlStrategy.endpoint },
        "GraphQL 요청",
      );

      const response = await fetch(this.graphqlStrategy.endpoint, {
        method: this.graphqlStrategy.method,
        headers: this.graphqlStrategy.headers,
        body: JSON.stringify({
          operationName: "GetSearchResult",
          query: this.graphqlStrategy.query,
          variables,
        }),
        signal: AbortSignal.timeout(this.graphqlStrategy.timeout),
      });

      // 성공
      if (response.ok) {
        return (await response.json()) as ZigzagSearchResponse;
      }

      // 429 Rate Limiting
      if (response.status === 429) {
        if (attempt < this.graphqlStrategy.retryCount) {
          const delay = this.config.errorHandling?.rateLimitDelay ?? 2000;
          await this.sleep(delay);
          return this.fetchWithRetry(keyword, attempt + 1);
        }
        throw new Error("Rate limit exceeded");
      }

      // 500 Server Error
      if (response.status >= 500) {
        const shouldRetry = this.config.errorHandling?.serverErrorRetry ?? true;
        if (shouldRetry && attempt < this.graphqlStrategy.retryCount) {
          await this.sleep(this.graphqlStrategy.retryDelay);
          return this.fetchWithRetry(keyword, attempt + 1);
        }
        throw new Error(`Server error: ${response.status}`);
      }

      // 기타 에러
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (error instanceof Error) {
        // Timeout
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          if (attempt < this.graphqlStrategy.retryCount) {
            await this.sleep(this.graphqlStrategy.retryDelay);
            return this.fetchWithRetry(keyword, attempt + 1);
          }
          throw new Error("Request timeout");
        }
        throw error;
      }
      throw new Error("Unknown error occurred");
    }
  }

  /**
   * GraphQL 변수 빌드
   */
  private buildVariables(keyword: string): Record<string, unknown> {
    // YAML에서 정의된 variables를 기반으로 keyword 치환
    const baseVariables = this.graphqlStrategy.variables || {};

    // input 객체가 있는 경우 q 필드에 keyword 설정
    if (typeof baseVariables === "object" && "input" in baseVariables) {
      const input = baseVariables.input as Record<string, unknown>;
      return {
        ...baseVariables,
        input: {
          ...input,
          q: keyword,
        },
      };
    }

    // 기본 변수 구조
    return {
      input: {
        q: keyword,
        page_id: "srp_item",
        filter_id_list: ["205"], // 직잭추천순
        initial: true,
        after: null,
        enable_guided_keyword_search: true,
      },
    };
  }
}

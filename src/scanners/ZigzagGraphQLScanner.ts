/**
 * ZigZag GraphQL 스캐너
 * GraphQL API 기반 상품 정보 스캔
 *
 * Strategy Pattern 구현체 - GraphQL 전략
 * BaseScanner의 Template Method 패턴을 따름
 *
 * SOLID 원칙:
 * - SRP: GraphQL API 호출만 담당
 * - LSP: BaseScanner를 대체 가능
 * - DIP: 설정에 의존
 */

import { BaseScanner } from "@/scanners/base/BaseScanner.generic";
import { ZigzagConfig } from "@/core/domain/ZigzagConfig";
import { GraphQLStrategyConfig } from "@/core/domain/StrategyConfig";
import { ZigzagProduct } from "@/core/domain/ZigzagProduct";
import type { IProductExtractor } from "@/extractors/base";
import { ExtractorRegistry } from "@/extractors/ExtractorRegistry";
import type { ZigzagGraphQLResponse } from "@/extractors/zigzag/ZigzagPriceExtractor";

/**
 * ZigZag GraphQL 스캐너
 */
export class ZigzagGraphQLScanner extends BaseScanner<
  ZigzagGraphQLResponse,
  ZigzagProduct,
  ZigzagConfig
> {
  private readonly extractor: IProductExtractor<ZigzagGraphQLResponse>;

  constructor(config: ZigzagConfig, strategy: GraphQLStrategyConfig) {
    super(config, strategy);
    // DIP: Interface에 의존 (Singleton Registry로부터 조회)
    const registry = ExtractorRegistry.getInstance();
    this.extractor = registry.get(config.platform);
  }

  /**
   * GraphQL 전략 설정 반환 (타입 캐스팅)
   */
  private get graphqlStrategy(): GraphQLStrategyConfig {
    return this.strategy as GraphQLStrategyConfig;
  }

  /**
   * 초기화 (GraphQL는 별도 초기화 불필요)
   */
  protected async doInitialize(): Promise<void> {
    // GraphQL는 브라우저 등 리소스가 필요 없으므로 초기화 작업 없음
  }

  /**
   * 데이터 추출 (GraphQL API 호출)
   */
  protected async extractData(
    productId: string,
  ): Promise<ZigzagGraphQLResponse> {
    // Rate limiting 방지: requestDelay 설정이 있으면 대기
    if (this.graphqlStrategy.graphql.requestDelay) {
      await this.sleep(this.graphqlStrategy.graphql.requestDelay);
    }

    return await this.fetchWithRetry(productId);
  }

  /**
   * 데이터 파싱 (GraphQL 응답 → 도메인 모델)
   *
   * 전략:
   * 1. ZigzagExtractor로 ProductData 추출
   * 2. ProductData → ZigzagProduct 변환
   */
  protected async parseData(
    rawData: ZigzagGraphQLResponse,
  ): Promise<ZigzagProduct> {
    // GraphQL 에러 체크
    if (rawData.errors && rawData.errors.length > 0) {
      const errorMessages = rawData.errors.map((e) => e.message).join(", ");
      throw new Error(`GraphQL Error: ${errorMessages}`);
    }

    // 데이터 존재 확인
    if (!rawData.data || !rawData.data.pdp_option_info) {
      throw new Error("Product not found (no data returned)");
    }

    const catalogProduct = rawData.data.pdp_option_info.catalog_product;

    // 상품이 null인 경우 (삭제된 상품)
    if (!catalogProduct) {
      throw new Error("Product not found (catalog_product is null)");
    }

    // Extractor로 데이터 추출
    const productData = await this.extractor.extract(rawData);

    // displayStatus 계산 (Extractor에서 처리하지 않는 정보)
    const items = catalogProduct.matched_item_list || [];
    let displayStatus: "VISIBLE" | "HIDDEN" = "HIDDEN";
    if (items.length > 0) {
      const hasVisible = items.some(
        (item) => item.display_status === "VISIBLE",
      );
      displayStatus = hasVisible ? "VISIBLE" : items[0].display_status;
    }

    // ProductData → ZigzagProduct 변환
    return ZigzagProduct.fromProductData(
      catalogProduct.id,
      productData,
      displayStatus,
    );
  }

  /**
   * 리소스 정리 (GraphQL는 정리할 리소스 없음)
   */
  async cleanup(): Promise<void> {
    // GraphQL는 브라우저 등 리소스가 없으므로 정리 작업 없음
  }

  /**
   * Retry 로직이 포함된 fetch
   */
  private async fetchWithRetry(
    productId: string,
    attempt: number = 1,
  ): Promise<ZigzagGraphQLResponse> {
    try {
      // 변수 치환 (${productId})
      const variables = this.replaceVariables(
        this.graphqlStrategy.graphql.variables,
        productId,
      );

      const response = await fetch(this.graphqlStrategy.graphql.endpoint, {
        method: this.graphqlStrategy.graphql.method,
        headers: this.graphqlStrategy.graphql.headers,
        body: JSON.stringify({
          query: this.graphqlStrategy.graphql.query,
          variables: variables,
        }),
        signal: AbortSignal.timeout(this.graphqlStrategy.graphql.timeout),
      });

      // 성공
      if (response.ok) {
        return (await response.json()) as ZigzagGraphQLResponse;
      }

      // 404 Not Found
      if (response.status === 404) {
        throw new Error("Product not found (deleted or unavailable)");
      }

      // 429 Rate Limiting
      if (response.status === 429) {
        if (attempt < this.graphqlStrategy.graphql.retryCount) {
          await this.sleep(this.config.errorHandling.rateLimitDelay);
          return this.fetchWithRetry(productId, attempt + 1);
        }
        throw new Error("Rate limit exceeded");
      }

      // 500 Server Error
      if (response.status >= 500) {
        if (
          this.config.errorHandling.serverErrorRetry &&
          attempt < this.graphqlStrategy.graphql.retryCount
        ) {
          await this.sleep(this.graphqlStrategy.graphql.retryDelay);
          return this.fetchWithRetry(productId, attempt + 1);
        }
        throw new Error(`Server error: ${response.status}`);
      }

      // 기타 에러
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (error instanceof Error) {
        // Timeout
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          if (attempt < this.graphqlStrategy.graphql.retryCount) {
            await this.sleep(this.graphqlStrategy.graphql.retryDelay);
            return this.fetchWithRetry(productId, attempt + 1);
          }
          throw new Error("Request timeout");
        }
        throw error;
      }
      throw new Error("Unknown error occurred");
    }
  }

  /**
   * 변수 치환 (${productId} → 실제 값)
   */
  private replaceVariables(
    variables: Record<
      string,
      string | number | boolean | null | Record<string, unknown>
    >,
    productId: string,
  ): Record<
    string,
    string | number | boolean | null | Record<string, unknown>
  > {
    const replaced: Record<
      string,
      string | number | boolean | null | Record<string, unknown>
    > = {};

    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === "string") {
        replaced[key] = value.replace("${productId}", productId);
      } else if (typeof value === "object" && value !== null) {
        replaced[key] = this.replaceVariables(
          value as Record<
            string,
            string | number | boolean | null | Record<string, unknown>
          >,
          productId,
        );
      } else {
        replaced[key] = value;
      }
    }

    return replaced;
  }

  /**
   * Sleep 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

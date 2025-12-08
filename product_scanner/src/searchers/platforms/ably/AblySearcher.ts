/**
 * AblySearcher - 에이블리 상품 검색
 * PlaywrightApiSearcher 구현체 (API Intercept)
 *
 * 특이사항:
 * - Cloudflare 보호 + 인증 토큰 필요 (401)
 * - Playwright + Stealth로 API 응답 인터셉트
 * - 응답 구조: components[].entity.item_list[].item
 * - THREE_COL_GOODS_LIST 타입 필터링 필요
 *
 * SOLID 원칙:
 * - SRP: Ably 검색만 담당
 * - LSP: PlaywrightApiSearcher 대체 가능
 */

import { PlaywrightApiSearcher } from "@/searchers/base/PlaywrightApiSearcher";
import type { SearchProduct } from "@/core/domain/search/SearchProduct";
import type {
  SearchConfig,
  SearchStrategyConfig,
} from "@/core/domain/search/SearchConfig";
import { logger } from "@/config/logger";

/**
 * Ably API 응답 타입
 */
interface AblyApiResponse {
  view_event_logging?: {
    analytics?: {
      SEARCH_RESULTS_GOODS?: number;
    };
  };
  components?: AblyComponent[];
}

/**
 * Ably 컴포넌트 타입
 */
interface AblyComponent {
  type?: {
    item_list?: string;
  };
  entity?: {
    item_list?: Array<{
      item: AblyProduct;
    }>;
  };
}

/**
 * Ably 상품 타입
 */
interface AblyProduct {
  sno: number;
  name: string;
  image: string;
  market_name?: string;
  price: number;
  discount_rate?: number;
}

/**
 * Ably Searcher
 */
export class AblySearcher extends PlaywrightApiSearcher<AblyApiResponse> {
  constructor(config: SearchConfig, strategy: SearchStrategyConfig) {
    super(config, strategy);
  }

  /**
   * API 응답 파싱 (Ably 전용)
   *
   * 주의: Ably는 검색 결과가 없을 때도 "추천 상품"을 THREE_COL_GOODS_LIST로 반환
   * totalCount(SEARCH_RESULTS_GOODS)가 0이면 실제 검색 결과가 없는 것이므로 빈 배열 반환
   */
  protected parseApiResponse(
    response: AblyApiResponse,
    limit: number,
  ): SearchProduct[] {
    // 실제 검색 결과 수 확인 - 0이면 추천 상품만 있는 것이므로 무시
    const totalCount =
      response.view_event_logging?.analytics?.SEARCH_RESULTS_GOODS ?? 0;
    if (totalCount === 0) {
      logger.debug({}, "Ably 검색 결과 없음 (totalCount: 0) - 추천 상품 무시");
      return [];
    }

    if (!response.components) {
      logger.warn({}, "Ably API 응답에 components 없음");
      return [];
    }

    // THREE_COL_GOODS_LIST 타입 컴포넌트 필터링
    const goodsComponents = response.components.filter(
      (c) => c.type?.item_list === "THREE_COL_GOODS_LIST",
    );

    // 모든 상품 추출
    const allProducts: AblyProduct[] = [];
    for (const component of goodsComponents) {
      if (component.entity?.item_list) {
        for (const wrapper of component.entity.item_list) {
          if (wrapper.item) {
            allProducts.push(wrapper.item);
          }
        }
      }
    }

    const products = allProducts.slice(0, limit);

    return products.map((item) => this.mapProduct(item));
  }

  /**
   * 총 결과 수 추출
   */
  protected extractTotalCountFromApi(response: AblyApiResponse): number {
    return response.view_event_logging?.analytics?.SEARCH_RESULTS_GOODS ?? 0;
  }

  /**
   * Ably 상품 → SearchProduct 변환
   */
  private mapProduct(item: AblyProduct): SearchProduct {
    return {
      productId: String(item.sno),
      productName: item.name,
      brand: item.market_name,
      thumbnail: item.image,
      productUrl: `https://m.a-bly.com/goods/${item.sno}`,
      price: item.price,
      discountRate: item.discount_rate,
      platform: this.config.platform,
    };
  }
}

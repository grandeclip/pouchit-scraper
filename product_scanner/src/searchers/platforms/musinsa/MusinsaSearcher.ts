/**
 * MusinsaSearcher - 무신사 상품 검색
 * PlaywrightApiSearcher 구현체 (API Intercept)
 *
 * 특이사항:
 * - 403 Forbidden (Cloudflare 보호)
 * - Playwright + Stealth로 API 응답 인터셉트
 * - 응답 구조: data.list[]
 *
 * SOLID 원칙:
 * - SRP: Musinsa 검색만 담당
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
 * Musinsa API 응답 타입
 */
interface MusinsaApiResponse {
  data?: {
    pagination?: {
      total: number;
    };
    list?: MusinsaProduct[];
  };
}

/**
 * Musinsa 상품 타입
 */
interface MusinsaProduct {
  goodsNo: number;
  goodsName: string;
  goodsLinkUrl: string;
  thumbnail: string;
  price: number;
  salePrice: number;
  discountRate: number;
}

/**
 * Musinsa Searcher
 */
export class MusinsaSearcher extends PlaywrightApiSearcher<MusinsaApiResponse> {
  constructor(config: SearchConfig, strategy: SearchStrategyConfig) {
    super(config, strategy);
  }

  /**
   * API 응답 파싱 (Musinsa 전용)
   */
  protected parseApiResponse(
    response: MusinsaApiResponse,
    limit: number,
  ): SearchProduct[] {
    if (!response.data?.list) {
      logger.warn({ response }, "Musinsa API 응답에 상품 데이터 없음");
      return [];
    }

    const products = response.data.list.slice(0, limit);

    return products.map((item) => this.mapProduct(item));
  }

  /**
   * 총 결과 수 추출
   * pagination.total이 없으면 products 길이로 fallback
   */
  protected extractTotalCountFromApi(response: MusinsaApiResponse): number {
    return response.data?.pagination?.total ?? response.data?.list?.length ?? 0;
  }

  /**
   * Musinsa 상품 → SearchProduct 변환
   */
  private mapProduct(item: MusinsaProduct): SearchProduct {
    return {
      productId: String(item.goodsNo),
      productName: item.goodsName,
      thumbnail: item.thumbnail,
      productUrl: item.goodsLinkUrl,
      price: item.salePrice,
      originalPrice: item.price,
      discountRate: item.discountRate,
      platform: this.config.platform,
    };
  }
}

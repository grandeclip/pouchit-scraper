/**
 * KurlySearcher - 마켓컬리 상품 검색
 * PlaywrightApiSearcher 구현체 (API Intercept)
 *
 * 특이사항:
 * - 세션/쿠키 필요 (curl 직접 호출 불가)
 * - Playwright + Stealth로 API 응답 인터셉트
 * - 응답 구조: data.listSections[0].data.items[]
 *
 * SOLID 원칙:
 * - SRP: Kurly 검색만 담당
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
 * Kurly API 응답 타입
 */
interface KurlyApiResponse {
  success?: boolean;
  data?: {
    listSections?: Array<{
      data?: {
        items?: KurlyProduct[];
      };
    }>;
    meta?: {
      pagination?: {
        total: number;
        count: number;
        perPage: number;
        currentPage: number;
        totalPages: number;
      };
    };
  };
}

/**
 * Kurly 상품 타입
 */
interface KurlyProduct {
  no: number;
  name: string;
  shortDescription?: string;
  listImageUrl?: string;
  productVerticalMediumUrl?: string;
  salesPrice: number;
  discountedPrice?: number;
  discountRate?: number;
  reviewCount?: string;
  deliveryTypeNames?: string[];
}

/**
 * Kurly Searcher
 */
export class KurlySearcher extends PlaywrightApiSearcher<KurlyApiResponse> {
  constructor(config: SearchConfig, strategy: SearchStrategyConfig) {
    super(config, strategy);
  }

  /**
   * API 응답 파싱 (Kurly 전용)
   */
  protected parseApiResponse(
    response: KurlyApiResponse,
    limit: number,
  ): SearchProduct[] {
    if (!response.success || !response.data?.listSections?.[0]?.data?.items) {
      logger.warn({ success: response.success }, "Kurly API 응답 실패");
      return [];
    }

    const products = response.data.listSections[0].data.items.slice(0, limit);

    return products.map((item) => this.mapProduct(item));
  }

  /**
   * 총 결과 수 추출
   */
  protected extractTotalCountFromApi(response: KurlyApiResponse): number {
    return response.data?.meta?.pagination?.total ?? 0;
  }

  /**
   * Kurly 상품 → SearchProduct 변환
   */
  private mapProduct(item: KurlyProduct): SearchProduct {
    const thumbnail = item.productVerticalMediumUrl || item.listImageUrl;

    return {
      productId: String(item.no),
      productName: item.name,
      thumbnail,
      productUrl: `https://www.kurly.com/goods/${item.no}`,
      price: item.discountedPrice ?? item.salesPrice,
      originalPrice: item.salesPrice,
      discountRate: item.discountRate,
      platform: this.config.platform,
    };
  }
}

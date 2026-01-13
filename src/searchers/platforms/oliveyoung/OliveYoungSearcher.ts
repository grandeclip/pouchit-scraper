/**
 * OliveYoungSearcher - 올리브영 상품 검색
 * PlaywrightApiSearcher 구현체 (API Intercept)
 *
 * 특이사항:
 * - Cloudflare 보호로 curl 직접 호출 불가
 * - Playwright + Stealth로 API 응답 인터셉트
 * - 응답 구조: data.oliveGoods.data[]
 *
 * SOLID 원칙:
 * - SRP: OliveYoung 검색만 담당
 * - LSP: PlaywrightApiSearcher 대체 가능
 */

import { PlaywrightApiSearcher } from "@/searchers/base/PlaywrightApiSearcher";
import type { SearchProduct } from "@/core/domain/search/SearchProduct";
import type {
  SearchConfig,
  SearchStrategyConfig,
} from "@/core/domain/search/SearchConfig";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { logger } from "@/config/logger";

/**
 * OliveYoung API 응답 타입
 */
interface OliveYoungApiResponse {
  status: string;
  code: number;
  message: string;
  data?: {
    oliveGoods?: {
      count: number;
      totalCount: number;
      data: OliveYoungProduct[];
    };
    /**
     * Neural Search 여부
     * true: "검색어와 연관된 리뷰가 있는 상품" (실제 검색 결과 아님)
     * false: 정상 검색 결과
     */
    isNeuralSearch?: boolean;
  };
}

/**
 * OliveYoung 상품 타입
 */
interface OliveYoungProduct {
  goodsNumber: string;
  goodsName: string;
  onlineBrandName?: string;
  onlineBrandEnglishName?: string;
  onlineBrandCode?: string;
  priceToPay: number;
  originalPrice: number;
  discountRate: number;
  imagePath: string;
  goodsEvaluationScoreValue?: number;
  goodsAssessmentTotalCount?: number;
  soldOutFlag?: boolean;
  bestGoodsFlag?: boolean;
  newGoodsFlag?: boolean;
  quickDeliveryFlag?: boolean;
  couponFlag?: boolean;
  displayCategoryName?: string;
}

/**
 * OliveYoung Searcher
 */
export class OliveYoungSearcher extends PlaywrightApiSearcher<OliveYoungApiResponse> {
  constructor(config: SearchConfig, strategy: SearchStrategyConfig) {
    super(config, strategy);
  }

  /**
   * API 응답 파싱 (OliveYoung 전용)
   */
  protected parseApiResponse(
    response: OliveYoungApiResponse,
    limit: number,
  ): SearchProduct[] {
    if (response.status !== "SUCCESS" || !response.data?.oliveGoods?.data) {
      logger.warn(
        { status: response.status, message: response.message },
        "OliveYoung API 응답 실패",
      );
      return [];
    }

    // Neural Search 결과는 "검색어와 연관된 리뷰가 있는 상품" → 실제 검색 결과 아님
    if (response.data.isNeuralSearch === true) {
      logger.info(
        { totalCount: response.data.oliveGoods.totalCount },
        "OliveYoung Neural Search 결과 (리뷰 연관 상품) - 결과 없음 처리",
      );
      return [];
    }

    const products = response.data.oliveGoods.data.slice(0, limit);

    return products.map((item) => this.mapProduct(item));
  }

  /**
   * 총 결과 수 추출
   */
  protected extractTotalCountFromApi(response: OliveYoungApiResponse): number {
    return response.data?.oliveGoods?.totalCount ?? 0;
  }

  /**
   * OliveYoung 상품 → SearchProduct 변환
   */
  private mapProduct(item: OliveYoungProduct): SearchProduct {
    const thumbnail = item.imagePath
      ? `https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/${item.imagePath}`
      : undefined;

    return {
      productId: item.goodsNumber,
      productName: item.goodsName,
      brand: item.onlineBrandName,
      thumbnail,
      productUrl: PlatformDetector.buildProductUrl(
        "oliveyoung",
        item.goodsNumber,
      ),
      price: item.priceToPay,
      originalPrice: item.originalPrice,
      discountRate: item.discountRate,
      platform: this.config.platform,
    };
  }
}

/**
 * AblyPriceExtractor
 *
 * 목적: 에이블리 가격 정보 추출
 * 패턴: Strategy Pattern
 * 참고: docs/analysis/ably-strategy-analysis.md L237-333
 */

import type { Page } from "playwright";
import type { IPriceExtractor, PriceData } from "@/extractors/base";
import { logger } from "@/config/logger";

/**
 * 에이블리 가격 추출기
 *
 * 전략 (ably.yaml 원본 로직):
 * 1. SSR (__NEXT_DATA__) 우선 시도
 *    - props.pageProps.dehydratedState.queries[].state.data.goods.price_info
 *    - consumer: 정가, thumbnail_price: 판매가
 * 2. Meta tag fallback (가격 정보 없음)
 *    - price: 0, originalPrice: 0
 *
 * @implements {IPriceExtractor<Page>} Playwright Page 기반 추출
 */
export class AblyPriceExtractor implements IPriceExtractor<Page> {
  /**
   * 가격 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 가격 데이터
   */
  async extract(page: Page): Promise<PriceData> {
    const url = page.url();
    logger.debug({ url }, "[AblyPriceExtractor] 가격 추출 시작");

    // 1단계: SSR 데이터 우선
    const ssrPrice = await this.extractFromSSR(page);
    if (ssrPrice) {
      logger.debug(
        { url, price: ssrPrice.price, originalPrice: ssrPrice.originalPrice },
        "[AblyPriceExtractor] SSR 가격 추출 성공",
      );
      return ssrPrice;
    }

    // 2단계: Meta tag fallback (가격 정보 없음)
    logger.debug({ url }, "[AblyPriceExtractor] SSR 실패, 빈 가격 반환");
    return this.createEmptyPrice();
  }

  /**
   * SSR 데이터에서 가격 추출
   *
   * 전략:
   * - __NEXT_DATA__ script 태그 파싱
   * - props.pageProps.dehydratedState.queries[] 순회
   * - goods.price_info.consumer (정가), thumbnail_price (판매가)
   *
   * @param page Playwright Page 객체
   * @returns 가격 데이터 또는 null
   */
  private async extractFromSSR(page: Page): Promise<PriceData | null> {
    try {
      const priceInfo = await page.evaluate(() => {
        const script = document.getElementById("__NEXT_DATA__");
        if (!script || !script.textContent) {
          return null;
        }

        const data = JSON.parse(script.textContent);
        const queries = data.props?.pageProps?.dehydratedState?.queries || [];

        for (const query of queries) {
          const goods = query.state?.data?.goods;
          // 원본 로직: goods.name이 있으면 price_info는 optional
          if (goods && goods.name) {
            return {
              consumer: goods.price_info?.consumer || 0,
              thumbnail_price: goods.price_info?.thumbnail_price || 0,
            };
          }
        }

        return null;
      });

      if (!priceInfo) {
        return null;
      }

      const consumer = Number(priceInfo.consumer) || 0;
      const thumbnailPrice = Number(priceInfo.thumbnail_price) || 0;

      // 판매가가 있으면 판매가 사용, 없으면 정가 사용
      const price = thumbnailPrice > 0 ? thumbnailPrice : consumer;

      // 정가가 판매가보다 크면 originalPrice 설정
      if (consumer > price) {
        return {
          price,
          originalPrice: consumer,
          currency: "KRW",
        };
      }

      // 할인 없음
      return {
        price,
        currency: "KRW",
      };
    } catch (error) {
      // SSR 파싱 실패 시 null 반환
      return null;
    }
  }

  /**
   * 빈 가격 데이터 생성
   *
   * @returns 0원 가격 데이터
   */
  private createEmptyPrice(): PriceData {
    return {
      price: 0,
      currency: "KRW",
    };
  }
}

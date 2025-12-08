/**
 * KurlyPriceExtractor
 *
 * 목적: 마켓컬리 가격 정보 추출
 * 패턴: Strategy Pattern
 * 참고: docs/analysis/kurly-strategy-analysis.md
 */

import type { Page } from "playwright";
import type { IPriceExtractor, PriceData } from "@/extractors/base";
import { logger } from "@/config/logger";

/**
 * SSR에서 추출한 가격 데이터 타입
 */
interface KurlySSRPriceData {
  retailPrice: number | null;
  basePrice: number;
  discountedPrice: number | null;
}

/**
 * 마켓컬리 가격 추출기
 *
 * 전략 (kurly.yaml 원본 로직):
 * - __NEXT_DATA__.props.pageProps.product에서 추출
 * - retailPrice: 정가
 * - discountedPrice || basePrice: 판매가
 *
 * 가격 우선순위:
 * 1. discountedPrice가 있으면 → price = discountedPrice
 * 2. discountedPrice가 null이면 → price = basePrice
 * 3. 둘 다 없으면 → price = 0
 *
 * @implements {IPriceExtractor<Page>} Playwright Page 기반 추출
 */
export class KurlyPriceExtractor implements IPriceExtractor<Page> {
  /**
   * 가격 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 가격 데이터
   */
  async extract(page: Page): Promise<PriceData> {
    const url = page.url();
    logger.debug({ url }, "[KurlyPriceExtractor] 가격 추출 시작");

    try {
      const ssrPrice = await this.extractFromSSR(page);

      if (ssrPrice) {
        logger.debug(
          { url, price: ssrPrice.price, originalPrice: ssrPrice.originalPrice },
          "[KurlyPriceExtractor] SSR 가격 추출 성공",
        );
        return ssrPrice;
      }

      logger.warn({ url }, "[KurlyPriceExtractor] SSR 데이터 없음");
      return { price: 0, currency: "KRW" };
    } catch (error) {
      logger.error({ url, error }, "[KurlyPriceExtractor] 가격 추출 실패");
      return { price: 0, currency: "KRW" };
    }
  }

  /**
   * SSR 데이터에서 가격 추출
   *
   * 전략:
   * - __NEXT_DATA__ script 태그 파싱
   * - props.pageProps.product에서 가격 필드 추출
   * - discountedPrice || basePrice 우선순위 적용
   *
   * @param page Playwright Page 객체
   * @returns 가격 데이터 또는 null
   */
  private async extractFromSSR(page: Page): Promise<PriceData | null> {
    const priceData = await page.evaluate((): KurlySSRPriceData | null => {
      const script = document.getElementById("__NEXT_DATA__");
      if (!script || !script.textContent) {
        return null;
      }

      try {
        const data = JSON.parse(script.textContent);
        const product = data.props?.pageProps?.product;

        if (!product) {
          return null;
        }

        return {
          retailPrice: product.retailPrice,
          basePrice: product.basePrice || 0,
          discountedPrice: product.discountedPrice,
        };
      } catch {
        return null;
      }
    });

    if (!priceData) {
      return null;
    }

    // 판매가: discountedPrice > basePrice > 0
    const price = priceData.discountedPrice || priceData.basePrice || 0;

    // 정가: retailPrice > basePrice
    const originalPrice = priceData.retailPrice ?? priceData.basePrice;

    // 정가와 판매가가 같으면 originalPrice 생략
    if (originalPrice === price || originalPrice === 0) {
      return {
        price,
        currency: "KRW",
      };
    }

    return {
      price,
      originalPrice,
      currency: "KRW",
    };
  }
}

/**
 * OliveyoungPriceExtractor
 *
 * 목적: 올리브영 가격 정보 추출
 * 패턴: Strategy Pattern
 * 참고: docs/analysis/oliveyoung-logic-analysis.md L194-228
 */

import type { Page } from "playwright";
import type { IPriceExtractor, PriceData } from "@/extractors/base";
import { PriceParser } from "@/extractors/common/PriceParser";

/**
 * 올리브영 가격 추출기
 *
 * 전략 (oliveyoung.yaml 원본 로직):
 * 1. 4개 selector 순차 시도
 * 2. 할인율 감지 (% 기호 포함 여부만)
 * 3. 가격 분리:
 *    - 할인 있음: 정가(첫번째), 판매가(마지막)
 *    - 할인 없음: 단일 가격
 */
export class OliveyoungPriceExtractor implements IPriceExtractor {
  /**
   * 가격 Selector 우선순위 (oliveyoung.yaml L350-353 기준)
   */
  private readonly PRICE_SELECTORS = [
    ".info-group__price", // 1순위: Mobile
    ".price", // 2순위: Desktop
    '[class*="price"]', // 3순위: price 포함
    ".prd_price", // 4순위
  ];

  /**
   * 가격 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 가격 데이터
   */
  async extract(page: Page): Promise<PriceData> {
    const priceText = await this.findPriceText(page);

    if (!priceText) {
      return this.createEmptyPrice();
    }

    return this.parsePrice(priceText);
  }

  /**
   * 가격 텍스트 찾기 (selector 순차 시도)
   *
   * @param page Playwright Page 객체
   * @returns 가격 텍스트 또는 빈 문자열
   */
  private async findPriceText(page: Page): Promise<string> {
    for (const selector of this.PRICE_SELECTORS) {
      try {
        const text = await page.$eval(selector, (el) => el.textContent);
        const trimmed = text?.trim();

        if (trimmed) {
          return trimmed;
        }
      } catch {
        // selector 실패 시 다음 시도
        continue;
      }
    }

    return "";
  }

  /**
   * 가격 텍스트 파싱
   *
   * 로직 (oliveyoung.yaml L388-395 기준):
   * 1. 숫자 추출
   * 2. 할인율 감지 (% 포함 여부만)
   * 3. 할인 있음: 첫번째=정가, 마지막=판매가
   * 4. 할인 없음: 첫번째=정가=판매가
   *
   * @param text 가격 텍스트
   * @returns 파싱된 가격 데이터
   */
  private parsePrice(text: string): PriceData {
    // 숫자 추출
    const numbers = PriceParser.extractNumbers(text);

    if (numbers.length === 0) {
      return this.createEmptyPrice();
    }

    // 할인율 감지 (% 기호 포함 여부만)
    const hasDiscountRate = text.includes("%");

    if (hasDiscountRate && numbers.length >= 2) {
      // 할인 있음: 첫번째=정가, 마지막=판매가
      const originalPrice = PriceParser.parse(numbers[0]);
      const price = PriceParser.parse(numbers[numbers.length - 1]);

      // 명시된 할인율 추출 (% 앞의 숫자)
      const discountRateMatch = text.match(/(\d+)%/);
      const discountRate = discountRateMatch
        ? parseInt(discountRateMatch[1], 10)
        : undefined;

      return {
        price,
        originalPrice,
        discountRate,
        currency: "KRW",
      };
    } else {
      // 할인 없음: 단일 가격 (정가=판매가)
      const price = PriceParser.parse(numbers[0]);

      return {
        price,
        currency: "KRW",
      };
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

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
 *
 * @implements {IPriceExtractor<Page>} Playwright Page 기반 추출
 */
export class OliveyoungPriceExtractor implements IPriceExtractor<Page> {
  /**
   * 가격 Selector 우선순위 (YAML에서 주입)
   */
  private readonly PRICE_SELECTORS: string[];

  constructor(selectors?: string[]) {
    this.PRICE_SELECTORS = selectors || [];
  }

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
   * 전략:
   * 1. CSS Modules 대응: h3 기준 DOM 탐색
   *    - h3.parentElement.parentElement (조부모)
   *    - children[0]: 브랜드 컨테이너
   *    - children[1]: 상품명 컨테이너 (h3 포함)
   *    - children[2]: 가격 컨테이너 ← 목표
   * 2. Fallback: 클래스 기반 selector 시도
   *
   * @param page Playwright Page 객체
   * @returns 가격 텍스트 (예: "16,000원10%14,400원 ~") 또는 빈 문자열
   */
  private async findPriceText(page: Page): Promise<string> {
    // CSS Modules 대응: h3 조부모(grandParent)의 children[2]가 가격 컨테이너
    // 실제 DOM 구조 (모바일):
    // <div>                              ← grandParent
    //   <div>브랜드</div>                 ← children[0]
    //   <div><h3>상품명</h3></div>        ← children[1]
    //   <div>16,000원10%14,400원 ~</div> ← children[2] (목표)
    // </div>
    try {
      const text = await page.evaluate(() => {
        const h3 = document.querySelector("h3");
        if (!h3 || !h3.parentElement || !h3.parentElement.parentElement)
          return "";

        const grandParent = h3.parentElement.parentElement;
        const priceContainer = grandParent.children[2]; // children[0]=브랜드, [1]=상품명, [2]=가격

        return priceContainer?.textContent || "";
      });
      const trimmed = text.trim();

      if (trimmed && /\d/.test(trimmed)) {
        return trimmed;
      }
    } catch {
      // h3 없으면 fallback
    }

    // Fallback: 기존 selector 시도
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

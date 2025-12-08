/**
 * AblySaleStatusExtractor
 *
 * 목적: 에이블리 판매 상태 정보 추출
 * 패턴: Strategy Pattern
 * 표준: schema.org ItemAvailability 규약 준수
 * 참고: docs/analysis/ably-strategy-analysis.md L335-402
 */

import type { Page } from "playwright";
import type { ISaleStatusExtractor, SaleStatusData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";
import { logger } from "@/config/logger";

/**
 * 에이블리 판매 상태 추출기
 *
 * 전략 (ably.yaml 원본 로직):
 * 1. SSR (__NEXT_DATA__) 우선 시도
 *    - goods.sale_type: "ON_SALE" → InStock
 *    - goods.sale_type: "SOLD_OUT" → SoldOut
 *    - default → Discontinued
 * 2. Body text fallback:
 *    - "품절", "재입고" → SoldOut
 *    - "판매 중인 상품이 아닙니다" → Discontinued
 *    - default → InStock
 *
 * @implements {ISaleStatusExtractor<Page>} Playwright Page 기반 추출
 */
export class AblySaleStatusExtractor implements ISaleStatusExtractor<Page> {
  /**
   * Body text 검사 패턴
   */
  private readonly SOLD_OUT_PATTERNS = ["품절", "재입고"];
  private readonly OFF_SALE_PATTERNS = ["판매 중인 상품이 아닙니다"];
  private readonly OFF_SALE_URL_PATTERNS = ["/today"]; // URL 체크 (ably.yaml L109)

  /**
   * 판매 상태 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 판매 상태 데이터
   */
  async extract(page: Page): Promise<SaleStatusData> {
    const url = page.url();
    logger.debug({ url }, "[AblySaleStatusExtractor] 판매상태 추출 시작");

    // 1단계: SSR 데이터 우선
    const ssrStatus = await this.extractFromSSR(page);
    if (ssrStatus) {
      logger.debug(
        { url, saleStatus: SaleStatus[ssrStatus.saleStatus] },
        "[AblySaleStatusExtractor] SSR 판매상태 추출 성공",
      );
      return ssrStatus;
    }

    // 2단계: Body text fallback
    const bodyStatus = await this.extractFromBodyText(page);
    logger.debug(
      { url, saleStatus: SaleStatus[bodyStatus.saleStatus] },
      "[AblySaleStatusExtractor] Body text fallback 사용",
    );
    return bodyStatus;
  }

  /**
   * SSR 데이터에서 판매 상태 추출
   *
   * 전략:
   * - __NEXT_DATA__ script 태그 파싱
   * - goods.sale_type 확인:
   *   - "ON_SALE" → InStock
   *   - "SOLD_OUT" → SoldOut
   *   - default → Discontinued
   *
   * @param page Playwright Page 객체
   * @returns 판매 상태 데이터 또는 null
   */
  private async extractFromSSR(page: Page): Promise<SaleStatusData | null> {
    try {
      const saleType = await page.evaluate(() => {
        const script = document.getElementById("__NEXT_DATA__");
        if (!script || !script.textContent) {
          return null;
        }

        const data = JSON.parse(script.textContent);
        const queries = data.props?.pageProps?.dehydratedState?.queries || [];

        for (const query of queries) {
          const goods = query.state?.data?.goods;
          if (goods && goods.sale_type) {
            return goods.sale_type;
          }
        }

        return null;
      });

      if (!saleType) {
        return null;
      }

      // sale_type 매핑
      return this.mapSaleType(saleType);
    } catch (error) {
      // SSR 파싱 실패 시 null 반환
      return null;
    }
  }

  /**
   * Body text에서 판매 상태 추출
   *
   * 전략 (ably.yaml L106-117):
   * - "품절", "재입고" → SoldOut
   * - "판매 중인 상품이 아닙니다" 또는 URL에 "/today" 포함 → Discontinued
   * - default → InStock
   *
   * @param page Playwright Page 객체
   * @returns 판매 상태 데이터
   */
  private async extractFromBodyText(page: Page): Promise<SaleStatusData> {
    try {
      const bodyText = await page.textContent("body");
      const pageUrl = page.url();

      if (!bodyText) {
        return this.createStatus(SaleStatus.Discontinued);
      }

      // URL 체크: "/today" 포함 시 Discontinued
      const isUrlOffSale = this.OFF_SALE_URL_PATTERNS.some((pattern) =>
        pageUrl.includes(pattern),
      );
      if (isUrlOffSale) {
        return this.createStatus(SaleStatus.Discontinued);
      }

      // "판매 중인 상품이 아닙니다" 체크 (우선순위 높음)
      const isOffSale = this.OFF_SALE_PATTERNS.some((pattern) =>
        bodyText.includes(pattern),
      );
      if (isOffSale) {
        return this.createStatus(SaleStatus.Discontinued);
      }

      // "품절", "재입고" 체크
      const isSoldOut = this.SOLD_OUT_PATTERNS.some((pattern) =>
        bodyText.includes(pattern),
      );
      if (isSoldOut) {
        return this.createStatus(SaleStatus.SoldOut);
      }

      // 기본값: InStock
      return this.createStatus(SaleStatus.InStock);
    } catch (error) {
      // Body text 조회 실패 시 Discontinued
      return this.createStatus(SaleStatus.Discontinued);
    }
  }

  /**
   * sale_type → SaleStatus 매핑
   *
   * @param saleType SSR의 sale_type 값
   * @returns 판매 상태 데이터
   */
  private mapSaleType(saleType: string): SaleStatusData {
    switch (saleType) {
      case "ON_SALE":
        return this.createStatus(SaleStatus.InStock);
      case "SOLD_OUT":
        return this.createStatus(SaleStatus.SoldOut);
      default:
        return this.createStatus(SaleStatus.Discontinued);
    }
  }

  /**
   * 판매 상태 데이터 생성
   *
   * @param saleStatus 판매 상태 코드
   * @returns 판매 상태 데이터
   */
  private createStatus(saleStatus: SaleStatus): SaleStatusData {
    return {
      saleStatus,
      isAvailable: saleStatus === SaleStatus.InStock,
    };
  }
}

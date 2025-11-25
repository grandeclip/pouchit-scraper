/**
 * KurlySaleStatusExtractor
 *
 * 목적: 마켓컬리 판매 상태 추출
 * 패턴: Strategy Pattern
 * 참고: docs/analysis/kurly-strategy-analysis.md
 */

import type { Page } from "playwright";
import type { ISaleStatusExtractor, SaleStatusData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";
import { logger } from "@/config/logger";

/**
 * 마켓컬리 판매 상태 추출기
 *
 * 전략 (kurly.yaml 원본 로직):
 * - __NEXT_DATA__.props.pageProps.product.isSoldOut 기반
 * - isSoldOut: boolean | null | undefined
 *
 * 상태 매핑:
 * - isSoldOut === false → InStock (on_sale)
 * - isSoldOut === true → SoldOut (off_sale, 시스템 정책)
 * - isSoldOut === null/undefined → Discontinued (off_sale, INFO_CHANGED)
 *
 * @implements {ISaleStatusExtractor<Page>} Playwright Page 기반 추출
 */
export class KurlySaleStatusExtractor implements ISaleStatusExtractor<Page> {
  /**
   * 판매 상태 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 판매 상태 데이터
   */
  async extract(page: Page): Promise<SaleStatusData> {
    const url = page.url();
    logger.debug({ url }, "[KurlySaleStatusExtractor] 판매상태 추출 시작");

    try {
      const ssrStatus = await this.extractFromSSR(page);

      if (ssrStatus) {
        logger.debug(
          { url, saleStatus: SaleStatus[ssrStatus.saleStatus] },
          "[KurlySaleStatusExtractor] SSR 판매상태 추출 성공",
        );
        return ssrStatus;
      }

      // SSR 데이터 없음 → 상품 정보 변경으로 간주
      logger.warn(
        { url },
        "[KurlySaleStatusExtractor] SSR 데이터 없음 → Discontinued",
      );
      return this.createStatus(SaleStatus.Discontinued);
    } catch (error) {
      logger.error(
        { url, error },
        "[KurlySaleStatusExtractor] 판매상태 추출 실패",
      );
      return this.createStatus(SaleStatus.Discontinued);
    }
  }

  /**
   * SSR 데이터에서 판매 상태 추출
   *
   * 전략:
   * - __NEXT_DATA__ script 태그 파싱
   * - product.isSoldOut 필드 확인
   * - null/undefined는 상품 정보 변경으로 처리
   *
   * @param page Playwright Page 객체
   * @returns 판매 상태 데이터 또는 null
   */
  private async extractFromSSR(page: Page): Promise<SaleStatusData | null> {
    const statusResult = await page.evaluate(
      (): { isSoldOut: boolean | null | undefined; found: boolean } | null => {
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
            isSoldOut: product.isSoldOut,
            found: true,
          };
        } catch {
          return null;
        }
      },
    );

    if (!statusResult || !statusResult.found) {
      return null;
    }

    const { isSoldOut } = statusResult;

    // isSoldOut이 null 또는 undefined인 경우 → 상품 정보 변경/삭제
    if (isSoldOut === null || isSoldOut === undefined) {
      return this.createStatus(SaleStatus.Discontinued);
    }

    // isSoldOut이 true인 경우 → 품절
    if (isSoldOut === true) {
      return this.createStatus(SaleStatus.SoldOut);
    }

    // isSoldOut이 false인 경우 → 판매중
    return this.createStatus(SaleStatus.InStock);
  }

  /**
   * 판매 상태 데이터 생성
   *
   * @param saleStatus 판매 상태 코드
   * @returns 판매 상태 데이터 (isAvailable 포함)
   */
  private createStatus(saleStatus: SaleStatus): SaleStatusData {
    return {
      saleStatus,
      isAvailable: saleStatus === SaleStatus.InStock,
    };
  }
}

/**
 * OliveyoungPlatformScanner
 *
 * 올리브영(Oliveyoung) 플랫폼 스캐너
 *
 * SOLID 원칙:
 * - SRP: 올리브영 스캔 및 NOT_FOUND 감지만 담당
 * - LSP: BrowserPlatformScanner 대체 가능
 *
 * 특징:
 * - "삭제된 상품" 텍스트 기반 NOT_FOUND 감지
 * - DOM 판매 상태 정규화 (SELNG, SLDOT, STSEL)
 *
 * 이관된 로직:
 * - OliveyoungValidationNode.ts L47-63: normalizeSaleStatus()
 * - OliveyoungValidationNode.ts L125: "삭제된 상품" 감지
 */

import type { Page } from "playwright";
import { BrowserPlatformScanner } from "../BrowserPlatformScanner";
import type { PlatformScanResult } from "../IPlatformScanner";
import type { ScriptExecutionResult } from "@/utils/PlaywrightScriptExecutor";
import { logger } from "@/config/logger";

/**
 * OliveyoungPlatformScanner
 *
 * 올리브영 상품 스캔 전략:
 * 1. DOM Extractor (extractor) 사용
 * 2. NOT_FOUND 감지: "삭제된 상품" 텍스트 + _source 체크
 */
export class OliveyoungPlatformScanner extends BrowserPlatformScanner {
  readonly platform = "oliveyoung";

  /**
   * 스크래핑 결과 변환
   *
   * OliveyoungValidationNode에서 이관된 로직:
   * - "삭제된 상품" NOT_FOUND 감지
   * - DOM 판매 상태 정규화
   *
   * @param result PlaywrightScriptExecutor 결과
   * @param page Playwright Page
   * @param productId 상품 ID
   * @returns 정규화된 스캔 결과
   */
  protected transformResult(
    result: ScriptExecutionResult,
    page: Page,
    productId: string,
  ): PlatformScanResult {
    // 1. NOT_FOUND 체크
    if (this.checkNotFound(result)) {
      logger.debug(
        { platform: this.platform, productId, source: result._source },
        "Oliveyoung 상품 NOT_FOUND 감지",
      );
      return {
        success: false,
        error: "삭제된 상품",
        isNotFound: true,
        source: result._source,
      };
    }

    // 2. 판매 상태 정규화 (OliveyoungValidationNode L47-63 이관)
    const saleStatus = this.normalizeOliveyoungSaleStatus(result.sale_status);

    // 3. 성공 결과 변환
    return {
      success: true,
      data: {
        product_name: result.name || "",
        thumbnail: result.title_images?.[0] || "",
        original_price: result.consumer_price || 0,
        discounted_price: result.price || 0,
        sale_status: saleStatus,
      },
      source: result._source,
      isNotFound: false,
    };
  }

  /**
   * NOT_FOUND 상태 판별
   *
   * OliveyoungValidationNode L125 이관:
   * 1. _source === "not_found" 체크
   * 2. 상품명 === "삭제된 상품" 체크
   * 3. 빈 데이터 체크
   *
   * @param result 스캔 결과
   * @returns NOT_FOUND 여부
   */
  private checkNotFound(result: ScriptExecutionResult): boolean {
    // 1. _source 체크
    if (result._source === "not_found") {
      return true;
    }

    // 2. "삭제된 상품" 텍스트 체크 (OliveyoungValidationNode L125)
    if (result.name === "삭제된 상품") {
      return true;
    }

    // 3. 빈 데이터 체크
    if (!result.name || result.name === "") {
      return true;
    }

    return false;
  }

  /**
   * 올리브영 판매 상태 정규화
   *
   * OliveyoungValidationNode L47-63 이관:
   * - PlaywrightScriptExecutor가 이미 정규화된 값 반환
   * - 원본 DOM 값인 경우 fallback 처리
   *
   * @param status 원본 판매 상태
   * @returns 정규화된 판매 상태
   */
  private normalizeOliveyoungSaleStatus(status: string | undefined): string {
    if (!status) return "off_sale";

    // 이미 정규화된 값인 경우
    if (
      ["on_sale", "off_sale", "sold_out", "pre_order", "backorder"].includes(
        status,
      )
    ) {
      return status;
    }

    // 원본 DOM 값인 경우 (legacy)
    const domStatusMap: Record<string, string> = {
      SELNG: "on_sale", // 판매중
      SLDOT: "off_sale", // 품절
      STSEL: "off_sale", // 판매중지
    };

    return domStatusMap[status] || "off_sale";
  }

  /**
   * IPlatformScanner.isNotFound 구현
   */
  isNotFound(result: PlatformScanResult): boolean {
    if (result.isNotFound) {
      return true;
    }

    // 상품명 체크
    if (result.data?.product_name === "삭제된 상품") {
      return true;
    }

    return false;
  }
}

/**
 * AblyPlatformScanner
 *
 * 에이블리(Ably) 플랫폼 스캐너
 *
 * SOLID 원칙:
 * - SRP: 에이블리 스캔 및 NOT_FOUND 감지만 담당
 * - LSP: BrowserPlatformScanner 대체 가능
 *
 * 특징:
 * - API Capture Strategy 지원 (PlaywrightScriptExecutor 내장)
 * - 리다이렉트 기반 NOT_FOUND 감지 (AblyValidationNode L107-115 이관)
 * - Cloudflare 에러 핸들링
 *
 * 이관된 로직:
 * - AblyValidationNode.ts L107-115: 리다이렉트 감지
 * - AblyValidationNode.ts L114-115: not_found 체크
 */

import type { Page } from "playwright";
import { BrowserPlatformScanner } from "../BrowserPlatformScanner";
import type { PlatformScanResult } from "../IPlatformScanner";
import type { ScriptExecutionResult } from "@/utils/PlaywrightScriptExecutor";
import { logger } from "@/config/logger";

/**
 * AblyPlatformScanner
 *
 * 에이블리 상품 스캔 전략:
 * 1. API Capture (network_api) - PlaywrightScriptExecutor가 자동 처리
 * 2. DOM Extractor (extractor) - fallback
 * 3. NOT_FOUND 감지: 리다이렉트 + _source 체크
 */
export class AblyPlatformScanner extends BrowserPlatformScanner {
  readonly platform = "ably";

  /**
   * 스크래핑 결과 변환
   *
   * AblyValidationNode에서 이관된 로직:
   * - 리다이렉트 감지로 판매중지 판별
   * - API 캡처 / DOM 추출 결과 정규화
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
    // 1. NOT_FOUND 체크 (리다이렉트 감지)
    if (this.checkNotFound(result, page, productId)) {
      logger.debug(
        { platform: this.platform, productId, source: result._source },
        "Ably 상품 NOT_FOUND 감지",
      );
      return {
        success: false,
        error: "Ably 상품 없음 (판매중지/리다이렉트)",
        isNotFound: true,
        source: result._source,
      };
    }

    // 2. 성공 결과 변환
    return {
      success: true,
      data: {
        product_name: result.name || "",
        thumbnail: result.title_images?.[0] || "",
        original_price: result.consumer_price || 0,
        discounted_price: result.price || 0,
        sale_status: this.normalizeSaleStatus(result.sale_status),
      },
      source: result._source,
      isNotFound: false,
    };
  }

  /**
   * NOT_FOUND 상태 판별
   *
   * AblyValidationNode L107-115 이관:
   * 1. _source === "not_found" 체크
   * 2. 리다이렉트 감지: URL에 /goods/{productId} 포함 여부
   *
   * @param result 스캔 결과
   * @param page Playwright Page
   * @param productId 상품 ID
   * @returns NOT_FOUND 여부
   */
  private checkNotFound(
    result: ScriptExecutionResult,
    page: Page,
    productId: string,
  ): boolean {
    // 1. _source 체크
    if (result._source === "not_found") {
      return true;
    }

    // 2. 리다이렉트 감지 (AblyValidationNode L107-115)
    // 에이블리는 판매중지 상품 접근 시 다른 페이지로 리다이렉트
    const currentUrl = page.url();
    if (!currentUrl.includes(`/goods/${productId}`)) {
      logger.debug(
        { productId, currentUrl },
        "Ably 리다이렉트 감지 - 판매중지",
      );
      return true;
    }

    // 3. 빈 데이터 체크
    if (!result.name || result.name === "") {
      return true;
    }

    return false;
  }

  /**
   * IPlatformScanner.isNotFound 구현
   *
   * 외부에서 호출 가능한 NOT_FOUND 판별 메서드
   */
  isNotFound(result: PlatformScanResult, page?: Page): boolean {
    if (result.isNotFound) {
      return true;
    }

    // 추가 리다이렉트 체크 (URL에서 productId 추출)
    if (page) {
      const currentUrl = page.url();
      const productId = this.extractProductId(currentUrl);
      if (!productId || !currentUrl.includes(`/goods/${productId}`)) {
        return true;
      }
    }

    return false;
  }
}

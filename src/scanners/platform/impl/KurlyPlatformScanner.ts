/**
 * KurlyPlatformScanner
 *
 * 컬리(Kurly) 플랫폼 스캐너
 *
 * SOLID 원칙:
 * - SRP: 컬리 스캔 및 NOT_FOUND 감지만 담당
 * - LSP: BrowserPlatformScanner 대체 가능
 *
 * 특징:
 * - 복합 NOT_FOUND 판별 (상품 정보 없음, 추출 실패, 빈 데이터)
 * - Kurly 상태 값 정규화 (ON_SALE, SOLD_OUT 등)
 *
 * 이관된 로직:
 * - KurlyValidationNode.ts L49-66: isNotFoundResponse()
 * - KurlyValidationNode.ts L71-89: validateSaleStatus()
 */

import type { Page } from "playwright";
import { BrowserPlatformScanner } from "../BrowserPlatformScanner";
import type { PlatformScanResult } from "../IPlatformScanner";
import type { ScriptExecutionResult } from "@/utils/PlaywrightScriptExecutor";
import { logger } from "@/config/logger";

/**
 * NOT_FOUND 감지용 메시지 목록
 *
 * KurlyValidationNode L50-51 이관
 */
const NOT_FOUND_MESSAGES = ["상품 정보 없음", "추출 실패", ""];
const NOT_FOUND_SOURCES = ["next_data_missing", "product_missing", "not_found"];

/**
 * KurlyPlatformScanner
 *
 * 컬리 상품 스캔 전략:
 * 1. DOM Extractor (extractor) 사용
 * 2. NOT_FOUND 감지: 복합 조건 체크
 */
export class KurlyPlatformScanner extends BrowserPlatformScanner {
  readonly platform = "kurly";

  /**
   * 스크래핑 결과 변환
   *
   * KurlyValidationNode에서 이관된 로직:
   * - 복합 NOT_FOUND 감지
   * - 상태 값 정규화
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
        "Kurly 상품 NOT_FOUND 감지",
      );
      return {
        success: false,
        error: "Kurly 상품 없음",
        isNotFound: true,
        source: result._source,
      };
    }

    // 2. 판매 상태 정규화
    const saleStatus = this.normalizeKurlySaleStatus(result.sale_status);

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
   * KurlyValidationNode L49-66 이관:
   * 1. _source 체크 (next_data_missing, product_missing, not_found)
   * 2. 상품명 체크 (빈 값, "상품 정보 없음", "추출 실패")
   * 3. status === "NOT_FOUND" 체크 (Legacy KurlyDOMResponse)
   *
   * @param result 스캔 결과
   * @returns NOT_FOUND 여부
   */
  private checkNotFound(result: ScriptExecutionResult): boolean {
    // 1. _source 체크
    if (NOT_FOUND_SOURCES.includes(result._source || "")) {
      return true;
    }

    // 2. Extractor 결과: 빈 name이면 NOT_FOUND
    if (result._source === "extractor") {
      const hasNoData = !result.name || result.name === "";
      return hasNoData;
    }

    // 3. 상품명 체크 (KurlyValidationNode L50-51)
    if (NOT_FOUND_MESSAGES.includes(result.name || "")) {
      return true;
    }

    // 4. Legacy: status === "NOT_FOUND" (KurlyDOMResponse)
    const status = (result as any).status;
    if (status === "NOT_FOUND") {
      return true;
    }

    return false;
  }

  /**
   * 컬리 판매 상태 정규화
   *
   * KurlyValidationNode L71-89 이관:
   * - ON_SALE → on_sale
   * - SOLD_OUT → off_sale (시스템 규약)
   * - 기타 → off_sale
   *
   * @param status 원본 판매 상태
   * @returns 정규화된 판매 상태
   */
  private normalizeKurlySaleStatus(status: string | undefined): string {
    if (!status) return "off_sale";

    // 이미 정규화된 값인 경우
    if (
      ["on_sale", "off_sale", "sold_out", "pre_order", "backorder"].includes(
        status,
      )
    ) {
      return status;
    }

    // Kurly DOM 상태 값 매핑
    const statusMap: Record<string, string> = {
      ON_SALE: "on_sale",
      SOLD_OUT: "off_sale", // 시스템 규약: sold_out → off_sale
      INFO_CHANGED: "off_sale",
      NOT_FOUND: "off_sale",
      ERROR: "off_sale",
    };

    return statusMap[status.toUpperCase()] || "off_sale";
  }

  /**
   * IPlatformScanner.isNotFound 구현
   */
  isNotFound(result: PlatformScanResult): boolean {
    if (result.isNotFound) {
      return true;
    }

    // 상품명 체크
    if (NOT_FOUND_MESSAGES.includes(result.data?.product_name || "")) {
      return true;
    }

    return false;
  }
}

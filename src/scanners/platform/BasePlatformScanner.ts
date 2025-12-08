/**
 * BasePlatformScanner
 *
 * 플랫폼 스캐너 기반 추상 클래스
 *
 * SOLID 원칙:
 * - SRP: 공통 로직(URL 파싱, 상태 정규화)만 담당
 * - OCP: 서브클래스에서 플랫폼별 로직 확장
 * - Template Method Pattern: scan() 흐름 정의, 세부 구현은 서브클래스
 *
 * 공통 기능:
 * - extractProductId(): PlatformValidationConfig 기반 URL 파싱
 * - normalizeSaleStatus(): 판매 상태 정규화
 * - transformProductData(): 데이터 변환
 */

import type { Page } from "playwright";
import type { IPlatformScanner, PlatformScanResult } from "./IPlatformScanner";
import {
  getPlatformConfig,
  type SupportedPlatform,
} from "@/strategies/validation/platform/PlatformValidationConfig";
import { logger } from "@/config/logger";

/**
 * 정규화된 판매 상태 타입
 */
export type NormalizedSaleStatus =
  | "on_sale"
  | "off_sale"
  | "sold_out"
  | "pre_order"
  | "backorder";

/**
 * BasePlatformScanner 추상 클래스
 *
 * Template Method Pattern 적용:
 * - scan(): 템플릿 메서드 (서브클래스에서 구현)
 * - extractProductId(): 공통 구현 (오버라이드 가능)
 * - normalizeSaleStatus(): 공통 유틸리티
 */
export abstract class BasePlatformScanner implements IPlatformScanner {
  /** 플랫폼 식별자 */
  abstract readonly platform: string;

  /** 스캔 방식 */
  abstract readonly scanMethod: "browser" | "api";

  /**
   * URL에서 상품 ID 추출
   *
   * PlatformValidationConfig의 정규식 패턴 사용
   * 서브클래스에서 오버라이드 가능
   *
   * @param url 상품 URL
   * @returns 상품 ID 또는 null
   */
  extractProductId(url: string): string | null {
    const config = getPlatformConfig(this.platform);

    if (!config) {
      logger.warn(
        { platform: this.platform },
        "PlatformValidationConfig not found",
      );
      return null;
    }

    const { productIdPattern, productIdGroup = 1 } = config.urlPattern;

    try {
      const regex = new RegExp(productIdPattern);
      const match = url.match(regex);

      if (match && match[productIdGroup]) {
        return match[productIdGroup];
      }

      logger.debug(
        { platform: this.platform, url, pattern: productIdPattern },
        "Product ID extraction failed",
      );
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { platform: this.platform, url, error: message },
        "Product ID extraction error",
      );
      return null;
    }
  }

  /**
   * 상품 스캔 실행 (추상 메서드)
   *
   * 서브클래스에서 구현:
   * - BrowserPlatformScanner: PlaywrightScriptExecutor 사용
   * - ApiPlatformScanner: ScannerRegistry 사용
   */
  abstract scan(url: string, page?: Page): Promise<PlatformScanResult>;

  /**
   * NOT_FOUND 상태 판별 (기본 구현)
   *
   * 서브클래스에서 오버라이드하여 플랫폼별 로직 구현
   */
  isNotFound?(result: PlatformScanResult, page?: Page): boolean;

  /**
   * 판매 상태 정규화
   *
   * 다양한 소스의 판매 상태를 표준 형식으로 변환
   *
   * @param status 원본 판매 상태
   * @returns 정규화된 판매 상태
   */
  protected normalizeSaleStatus(
    status: string | undefined,
  ): NormalizedSaleStatus {
    if (!status) return "off_sale";

    const normalized = status.toLowerCase().trim();

    // 이미 정규화된 값
    const validStatuses: NormalizedSaleStatus[] = [
      "on_sale",
      "off_sale",
      "sold_out",
      "pre_order",
      "backorder",
    ];

    if (validStatuses.includes(normalized as NormalizedSaleStatus)) {
      return normalized as NormalizedSaleStatus;
    }

    // 플랫폼별 원본 값 매핑
    const statusMap: Record<string, NormalizedSaleStatus> = {
      // Oliveyoung DOM 값
      selng: "on_sale",
      sldot: "off_sale",
      stsel: "off_sale",

      // Kurly 상태
      on_sale: "on_sale",
      sold_out: "off_sale", // 시스템 규약: sold_out → off_sale
      not_found: "off_sale",

      // 숫자 기반 상태 (SaleStatus enum)
      "0": "on_sale", // InStock
      "1": "off_sale", // SoldOut
      "2": "off_sale", // Discontinued
      "3": "pre_order", // PreOrder
      "4": "backorder", // BackOrder

      // 일반적인 상태 문자열
      available: "on_sale",
      unavailable: "off_sale",
      outofstock: "off_sale",
      instock: "on_sale",
      preorder: "pre_order",
    };

    return statusMap[normalized] || "off_sale";
  }

  /**
   * 스캔 결과를 PlatformScanResult.data 형식으로 변환
   *
   * @param raw 원시 스캔 데이터
   * @returns 정규화된 상품 데이터
   */
  protected transformProductData(raw: {
    name?: string;
    title_images?: string[];
    consumer_price?: number;
    price?: number;
    sale_status?: string;
  }): PlatformScanResult["data"] {
    return {
      product_name: raw.name || "",
      thumbnail: raw.title_images?.[0] || "",
      original_price: raw.consumer_price || 0,
      discounted_price: raw.price || 0,
      sale_status: this.normalizeSaleStatus(raw.sale_status),
    };
  }

  /**
   * 실패 결과 생성 헬퍼
   */
  protected createFailedResult(
    error: string,
    isNotFound = false,
  ): PlatformScanResult {
    return {
      success: false,
      error,
      isNotFound,
    };
  }

  /**
   * 성공 결과 생성 헬퍼
   */
  protected createSuccessResult(
    data: PlatformScanResult["data"],
    source?: string,
  ): PlatformScanResult {
    return {
      success: true,
      data,
      source,
      isNotFound: false,
    };
  }
}

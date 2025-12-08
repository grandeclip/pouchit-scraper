/**
 * BrowserPlatformScanner
 *
 * Playwright 기반 브라우저 스캐너 추상 클래스
 *
 * SOLID 원칙:
 * - SRP: Playwright 스크래핑 로직만 담당
 * - OCP: 플랫폼별 결과 변환은 서브클래스에서 확장
 * - LSP: BasePlatformScanner 대체 가능
 * - Template Method Pattern: scan() 흐름 정의
 *
 * 특징:
 * - PlaywrightScriptExecutor 재사용 (기존 YAML 설정 활용)
 * - ConfigLoader로 플랫폼 설정 로드
 * - 플랫폼별 transformResult() 구현
 */

import type { Page } from "playwright";
import { BasePlatformScanner } from "./BasePlatformScanner";
import type { PlatformScanResult } from "./IPlatformScanner";
import {
  PlaywrightScriptExecutor,
  type ScriptExecutionResult,
} from "@/utils/PlaywrightScriptExecutor";
import { ConfigLoader } from "@/config/ConfigLoader";
import { logger } from "@/config/logger";

/**
 * BrowserPlatformScanner 추상 클래스
 *
 * Playwright를 사용하는 모든 플랫폼 스캐너의 기반
 * - Ably, Oliveyoung, Kurly 등 브라우저 렌더링이 필요한 플랫폼
 */
export abstract class BrowserPlatformScanner extends BasePlatformScanner {
  /** 스캔 방식: 브라우저 */
  readonly scanMethod = "browser" as const;

  /** ConfigLoader 싱글톤 */
  protected readonly configLoader = ConfigLoader.getInstance();

  /**
   * 상품 스캔 실행
   *
   * Template Method Pattern:
   * 1. URL에서 상품 ID 추출
   * 2. 플랫폼 설정 로드
   * 3. PlaywrightScriptExecutor로 스크래핑
   * 4. 서브클래스의 transformResult()로 결과 변환
   *
   * @param url 상품 URL
   * @param page Playwright Page (필수)
   * @returns 스캔 결과
   */
  async scan(url: string, page?: Page): Promise<PlatformScanResult> {
    // Page 필수 확인
    if (!page) {
      return this.createFailedResult(
        "Browser scanner requires a Page instance",
      );
    }

    // 상품 ID 추출
    const productId = this.extractProductId(url);
    if (!productId) {
      return this.createFailedResult(
        `Failed to extract product ID from URL: ${url}`,
      );
    }

    // 플랫폼 설정 로드
    const config = this.configLoader.loadConfig(this.platform);
    if (!config) {
      return this.createFailedResult(
        `Platform config not found: ${this.platform}`,
      );
    }

    logger.debug(
      { platform: this.platform, productId, url },
      "BrowserPlatformScanner.scan() 시작",
    );

    try {
      // PlaywrightScriptExecutor로 스크래핑 실행
      const result = await PlaywrightScriptExecutor.scrapeProduct(
        page,
        productId,
        config,
      );

      // 플랫폼별 결과 변환 (서브클래스 구현)
      return this.transformResult(result, page, productId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { platform: this.platform, productId, error: message },
        "BrowserPlatformScanner.scan() 실패",
      );
      return this.createFailedResult(message);
    }
  }

  /**
   * 스크래핑 결과를 PlatformScanResult로 변환 (추상 메서드)
   *
   * 서브클래스에서 플랫폼별 로직 구현:
   * - NOT_FOUND 감지 로직
   * - 데이터 정규화
   * - source 설정
   *
   * @param result PlaywrightScriptExecutor 결과
   * @param page Playwright Page (리다이렉트 확인용)
   * @param productId 상품 ID (URL 비교용)
   * @returns 정규화된 스캔 결과
   */
  protected abstract transformResult(
    result: ScriptExecutionResult,
    page: Page,
    productId: string,
  ): PlatformScanResult;

  /**
   * 기본 결과 변환 (서브클래스 fallback)
   *
   * NOT_FOUND 체크 없이 단순 변환만 수행
   * 플랫폼별 NOT_FOUND 로직이 없는 경우 사용
   */
  protected defaultTransformResult(
    result: ScriptExecutionResult,
  ): PlatformScanResult {
    // 기본 NOT_FOUND 체크
    if (result._source === "not_found" || !result.name) {
      return {
        success: false,
        error: "상품 정보 없음",
        isNotFound: true,
        source: result._source,
      };
    }

    return {
      success: true,
      data: this.transformProductData(result),
      source: result._source,
      isNotFound: false,
    };
  }
}

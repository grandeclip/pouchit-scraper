/**
 * Ably API Capture Strategy
 *
 * 목적:
 * - Ably 플랫폼의 Network API 응답 캡처
 * - SSR 데이터 우선 추출 (fallback: Meta 태그)
 *
 * SOLID 원칙:
 * - SRP: Ably API 캡처만 담당
 * - OCP: 다른 플랫폼 API 캡처 전략 추가 가능
 * - Strategy Pattern: IApiCaptureStrategy 구현
 *
 * Design Pattern:
 * - Strategy Pattern: 플랫폼별 API 캡처 전략
 */

import type { Page } from "playwright";
import type { PlatformConfig } from "@/core/domain/PlatformConfig";
import { logger } from "@/config/logger";
import type { ScriptExecutionResult } from "@/utils/PlaywrightScriptExecutor";

/**
 * API Capture Strategy 인터페이스
 */
export interface IApiCaptureStrategy {
  /**
   * API 응답 캡처
   * @param page Playwright Page 인스턴스
   * @param productId 상품 ID
   * @param config 플랫폼 설정
   * @returns API 응답 데이터 (캡처 실패 시 null)
   */
  captureApiResponse(
    page: Page,
    productId: string,
    config: PlatformConfig,
  ): Promise<ScriptExecutionResult | null>;
}

/**
 * Ably API Capture Strategy
 *
 * API 패턴: /api/v3/goods/{id}/basic/
 * 응답 구조:
 * {
 *   goods: {
 *     name: string,
 *     market: { name: string },
 *     cover_images: string[],
 *     price_info: { consumer: number, thumbnail_price: number },
 *     sale_type: "ON_SALE" | "SOLD_OUT" | ...
 *   }
 * }
 */
export class AblyApiCaptureStrategy implements IApiCaptureStrategy {
  /**
   * API 응답 타임아웃 (ms)
   */
  private static readonly API_TIMEOUT_MS = 5000;

  /**
   * API 응답 캡처
   */
  async captureApiResponse(
    page: Page,
    productId: string,
    config: PlatformConfig,
  ): Promise<ScriptExecutionResult | null> {
    const strategy = config.strategies?.[0];
    if (!strategy || strategy.type !== "playwright") {
      logger.warn(
        { productId, platform: config.platform },
        "Playwright 전략 없음 - API 캡처 스킵",
      );
      return null;
    }

    const { extraction } = strategy.playwright || {};
    const apiPattern = extraction?.api_pattern;

    if (!apiPattern) {
      logger.debug(
        { productId, platform: config.platform },
        "API 패턴 미설정 - API 캡처 스킵",
      );
      return null;
    }

    // API URL 패턴 생성
    const targetPattern = apiPattern.replace("${goodsId}", productId);

    logger.debug({ productId, targetPattern }, "Ably API 응답 캡처 시작");

    try {
      // API 응답 Promise 설정
      const apiPromise = new Promise<any>((resolve, reject) => {
        const responseHandler = async (response: any) => {
          if (response.url().includes(targetPattern)) {
            try {
              const data = await response.json();
              logger.debug(
                { productId, url: response.url() },
                "Ably API 응답 캡처 성공",
              );
              resolve(data);
            } catch (parseError) {
              logger.warn(
                {
                  productId,
                  error:
                    parseError instanceof Error
                      ? parseError.message
                      : String(parseError),
                },
                "Ably API JSON 파싱 실패",
              );
              reject(
                new Error(
                  `API JSON 파싱 실패: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
                ),
              );
            }
          }
        };

        page.on("response", responseHandler);

        // 타임아웃 설정
        setTimeout(() => {
          page.off("response", responseHandler);
          reject(new Error("API 응답 타임아웃"));
        }, AblyApiCaptureStrategy.API_TIMEOUT_MS);
      });

      // API 응답 대기
      const apiResponse = await apiPromise;

      // API 응답 검증 및 매핑
      return this.mapApiResponse(apiResponse, productId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(
        { productId, error: message },
        "Ably API 캡처 실패 - fallback 사용",
      );
      return null;
    }
  }

  /**
   * API 응답 → ScriptExecutionResult 매핑
   */
  private mapApiResponse(
    apiResponse: any,
    productId: string,
  ): ScriptExecutionResult | null {
    const goods = apiResponse?.goods;

    if (!goods || !goods.name) {
      logger.warn(
        { productId, apiResponse },
        "Ably API 응답에 goods.name 없음",
      );
      return null;
    }

    // sale_type 매핑
    const saleStatus = this.mapSaleType(goods.sale_type);

    const result: ScriptExecutionResult = {
      name: goods.name,
      brand: goods.market?.name || "",
      title_images: goods.cover_images || [],
      consumer_price: goods.price_info?.consumer || 0,
      price:
        goods.price_info?.thumbnail_price || goods.price_info?.consumer || 0,
      sale_status: saleStatus,
      _source: "network_api",
      _redirected: false,
    };

    logger.info(
      {
        productId,
        name: result.name,
        saleStatus: result.sale_status,
        source: result._source,
      },
      "Ably API 응답 매핑 완료",
    );

    return result;
  }

  /**
   * Ably sale_type → 표준 sale_status 매핑
   */
  private mapSaleType(saleType: string): string {
    switch (saleType) {
      case "ON_SALE":
        return "on_sale";
      case "SOLD_OUT":
        return "sold_out";
      default:
        return "off_sale";
    }
  }
}

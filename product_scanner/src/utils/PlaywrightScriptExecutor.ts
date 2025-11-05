/**
 * Playwright Script Executor
 *
 * YAML 설정에 정의된 extraction script를 실행하는 범용 Executor
 *
 * SOLID 원칙:
 * - SRP: YAML script 실행만 담당
 * - OCP: 새로운 플랫폼 추가 시 YAML만 수정, 코드 변경 불필요
 * - DIP: Page 인터페이스에 의존 (Playwright 추상화)
 */

import type { Page } from "playwright";
import type { PlatformConfig } from "@/core/domain/PlatformConfig";
import { SCRAPER_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";

/**
 * Playwright Script 실행 결과 타입 (범용)
 * 플랫폼별 DOM 판매 상태 타입을 포함
 */
export interface ScriptExecutionResult {
  name: string;
  brand?: string;
  title_images: string[];
  consumer_price: number;
  price: number;
  sale_status: string; // 플랫폼별 DOM 판매 상태 (예: "SELNG", "SLDOT", "STSEL")
  _source: string;
  _redirected: boolean;
  [key: string]: any; // 플랫폼별 추가 필드 지원
}

/**
 * Playwright Script Executor 클래스
 */
export class PlaywrightScriptExecutor {
  /**
   * YAML 설정 기반으로 상품 스크래핑
   *
   * @param page Playwright Page 인스턴스
   * @param productId 상품 ID (예: goodsNo, productNo)
   * @param config 플랫폼 설정 (YAML에서 로드)
   */
  static async scrapeProduct(
    page: Page,
    productId: string,
    config: PlatformConfig,
  ): Promise<ScriptExecutionResult> {
    const strategy = config.strategies?.[0];

    if (!strategy || strategy.type !== "playwright") {
      throw new Error("Playwright 전략이 설정되지 않음");
    }

    const { navigationSteps, extraction } = strategy.playwright || {};

    if (!navigationSteps || !extraction) {
      throw new Error("Navigation steps 또는 extraction 설정이 없음");
    }

    // Navigation Steps 실행
    await this.executeNavigationSteps(page, productId, navigationSteps, config);

    // Extraction Script 실행
    return await this.executeExtractionScript(page, extraction);
  }

  /**
   * Navigation Steps 실행
   */
  private static async executeNavigationSteps(
    page: Page,
    productId: string,
    steps: any[],
    config: PlatformConfig,
  ): Promise<void> {
    for (const step of steps) {
      const { action, url, timeout, description } = step;

      logger.debug(
        { action, description, productId },
        "Navigation Step 실행 중",
      );

      switch (action) {
        case "navigate": {
          // URL 템플릿 변수 치환 (${goodsId} → productId)
          const targetUrl = url.replace("${goodsId}", productId);

          // 페이지 이동 (domcontentloaded 사용 - networkidle보다 빠름)
          try {
            await page.goto(targetUrl, {
              waitUntil: "domcontentloaded",
              timeout: SCRAPER_CONFIG.NAVIGATION_TIMEOUT_MS,
            });
          } catch (error) {
            // domcontentloaded 실패 시 load로 재시도
            const message =
              error instanceof Error ? error.message : String(error);
            if (message.includes("Timeout")) {
              logger.warn(
                { productId, targetUrl },
                "domcontentloaded 실패 - load로 재시도",
              );
              await page.goto(targetUrl, {
                waitUntil: "load",
                timeout: SCRAPER_CONFIG.NAVIGATION_TIMEOUT_MS,
              });
            } else {
              throw error;
            }
          }

          // 필수 요소 대기 (상품명 또는 "삭제된 상품" 메시지)
          try {
            await page.waitForSelector(".prd_name, .no-data", {
              timeout: 5000,
            });
          } catch {
            // 요소 없어도 계속 진행 (evaluate에서 처리)
          }

          break;
        }

        case "wait": {
          // 페이지 렌더링 대기
          const waitTime = timeout || SCRAPER_CONFIG.PAGE_RENDER_DELAY_MS;
          await page.waitForTimeout(waitTime);
          break;
        }

        case "evaluate": {
          // JavaScript 코드 실행 (팝업 제거 등)
          const { script } = step;
          if (script) {
            try {
              // eslint-disable-next-line no-new-func
              const evaluateFn = new Function(`return ${script}`)();
              await page.evaluate(evaluateFn);
              logger.debug({ productId, description }, "evaluate 실행 완료");
            } catch (error) {
              logger.warn(
                {
                  productId,
                  error: error instanceof Error ? error.message : String(error),
                },
                "evaluate 실행 실패 - 계속 진행",
              );
            }
          }
          break;
        }

        default:
          logger.warn({ action }, "알 수 없는 navigation action - 스킵");
      }
    }
  }

  /**
   * Extraction Script 실행
   */
  private static async executeExtractionScript(
    page: Page,
    extraction: any,
  ): Promise<ScriptExecutionResult> {
    const { method, script } = extraction;

    if (method !== "evaluate") {
      throw new Error(`지원하지 않는 extraction method: ${method}`);
    }

    if (!script) {
      throw new Error("Extraction script가 정의되지 않음");
    }

    // YAML script를 함수로 변환 후 실행
    try {
      // script는 이미 함수 형태의 문자열: "() => { ... }"
      // eslint-disable-next-line no-new-func
      const extractionFn = new Function(`return ${script}`)();

      // Page.evaluate()로 브라우저 컨텍스트에서 실행
      const result = await page.evaluate(extractionFn);

      logger.debug({ result }, "Extraction script 실행 완료");

      return result as ScriptExecutionResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "Extraction script 실행 실패");
      throw new Error(`Extraction script 실행 실패: ${message}`);
    }
  }
}

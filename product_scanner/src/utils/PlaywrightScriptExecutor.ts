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
import { JsonLdSchemaExtractor } from "@/extractors/JsonLdSchemaExtractor";
import {
  IApiCaptureStrategy,
  AblyApiCaptureStrategy,
} from "@/strategies/api-capture/AblyApiCaptureStrategy";

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
   * API Capture Strategy Registry (플랫폼별)
   */
  private static readonly apiCaptureStrategies: Map<
    string,
    IApiCaptureStrategy
  > = new Map([["ably", new AblyApiCaptureStrategy()]]);

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

    // API Capture Strategy 확인 (플랫폼별)
    const apiCaptureStrategy = this.apiCaptureStrategies.get(config.platform);

    if (apiCaptureStrategy) {
      logger.debug(
        { platform: config.platform, productId },
        "API Capture Strategy 사용",
      );

      // API 캡처 시도 (Navigation 전에 리스너 등록)
      const apiCapturePromise = apiCaptureStrategy.captureApiResponse(
        page,
        productId,
        config,
      );

      // Navigation Steps 실행
      await this.executeNavigationSteps(
        page,
        productId,
        navigationSteps,
        config,
      );

      // API 캡처 결과 확인
      const apiResult = await apiCapturePromise;

      if (apiResult) {
        logger.info(
          { platform: config.platform, productId, source: apiResult._source },
          "API 캡처 성공 - extraction script 스킵",
        );
        return apiResult;
      }

      logger.debug(
        { platform: config.platform, productId },
        "API 캡처 실패 - extraction script fallback",
      );
    } else {
      // API Capture Strategy 없음 → 일반 Navigation만 실행
      logger.debug(
        { platform: config.platform, productId },
        "API Capture Strategy 없음 - extraction script만 사용",
      );

      await this.executeNavigationSteps(
        page,
        productId,
        navigationSteps,
        config,
      );
    }

    // Desktop 페이지 감지 및 새로고침 (Platform 설정 기반)
    if (config.platform_settings?.requiresDesktopDetection) {
      await this.detectAndReloadIfDesktop(page, productId, config);
    }

    // Fallback: Extraction Script 실행
    return await this.executeExtractionScript(page, extraction);
  }

  /**
   * Script 보안 검증
   *
   * Dangerous patterns 체크:
   * - dynamic import/require
   * - eval() 중첩
   * - Function() 생성자
   * - constructor 접근
   *
   * @param script 검증할 스크립트 문자열
   * @returns 안전 여부
   */
  private static validateScript(script: string): boolean {
    const dangerousPatterns = [
      /import\s+/i, // dynamic import
      /require\s*\(/i, // require() 호출
      /eval\s*\(/i, // eval() 중첩
      /Function\s*\(/i, // Function() 생성자
      /\.constructor/i, // constructor 접근
      /process\./i, // Node.js process 접근
      /__dirname/i, // 파일시스템 접근
      /__filename/i, // 파일시스템 접근
    ];

    return !dangerousPatterns.some((pattern) => pattern.test(script));
  }

  /**
   * Desktop 페이지 감지 및 새로고침 (Config 기반)
   */
  private static async detectAndReloadIfDesktop(
    page: Page,
    productId: string,
    config: PlatformConfig,
  ): Promise<void> {
    try {
      // YAML에서 설정 가져오기
      const detectionConfig = config.platform_settings?.desktopDetection || {};
      const mobileSelectors = detectionConfig.mobileSelectors || [
        ".swiper-slide",
        ".info-group__title",
      ];
      const desktopSelectors = detectionConfig.desktopSelectors || [
        ".prd_detail_top",
        "#Contents",
        ".prd_detail",
      ];
      const reloadTimeout = detectionConfig.reloadTimeout || 30000;
      const rerenderWaitTime = detectionConfig.rerenderWaitTime || 1000;

      // Selector 문자열 생성 (querySelector용)
      const mobileSelectorStr = mobileSelectors.join(", ");
      const desktopSelectorStr = desktopSelectors.join(", ");

      const pageInfo = await page.evaluate(
        ({ mobileSelectors, desktopSelectors }) => {
          const hasMobileLayout = !!document.querySelector(mobileSelectors);
          const hasDesktopLayout = !!document.querySelector(desktopSelectors);
          const pathname = window.location.pathname;
          const isMobilePath = pathname.includes("/m/goods/");

          return {
            hasMobileLayout,
            hasDesktopLayout,
            pathname,
            isMobilePath,
          };
        },
        {
          mobileSelectors: mobileSelectorStr,
          desktopSelectors: desktopSelectorStr,
        },
      );

      logger.debug({ productId, pageInfo }, "페이지 타입 감지 결과");

      // Desktop 레이아웃 감지 (Mobile 레이아웃 없음)
      if (pageInfo.hasDesktopLayout && !pageInfo.hasMobileLayout) {
        logger.warn(
          { productId, pathname: pageInfo.pathname },
          "⚠️ Desktop 페이지 감지 → 새로고침 시도",
        );

        // 새로고침 (User-Agent 재전송)
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: reloadTimeout,
        });

        // 재렌더링 대기
        await page.waitForTimeout(rerenderWaitTime);

        // 재확인
        const reloadedInfo = await page.evaluate(
          ({ mobileSelectors, desktopSelectors }) => ({
            hasMobileLayout: !!document.querySelector(mobileSelectors),
            hasDesktopLayout: !!document.querySelector(desktopSelectors),
            pathname: window.location.pathname,
          }),
          {
            mobileSelectors: mobileSelectorStr,
            desktopSelectors: desktopSelectorStr,
          },
        );

        logger.debug({ productId, reloadedInfo }, "새로고침 후 페이지 타입");

        if (reloadedInfo.hasDesktopLayout && !reloadedInfo.hasMobileLayout) {
          logger.error(
            { productId, pathname: reloadedInfo.pathname },
            "❌ 새로고침 후에도 Desktop 렌더링 유지 (Hybrid DOM 추출 fallback)",
          );
        } else {
          logger.info(
            { productId },
            "✅ 새로고침 성공 → Mobile 렌더링으로 전환",
          );
        }
      } else if (pageInfo.hasMobileLayout) {
        logger.debug({ productId }, "✅ Mobile 페이지 정상 렌더링");
      } else {
        logger.warn(
          { productId },
          "⚠️ Mobile/Desktop 레이아웃 모두 감지 안됨 (특수 케이스)",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        { productId, error: message },
        "Desktop 감지 중 에러 (무시하고 계속 진행)",
      );
    }
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
          // URL 템플릿 변수 치환 (여러 플랫폼 지원)
          let targetUrl = url
            .replace("${goodsId}", productId)
            .replace("${productId}", productId);

          // URL Transformation (Generic)
          const urlTransformations =
            config.platform_settings?.urlTransformation;
          if (urlTransformations && Array.isArray(urlTransformations)) {
            for (const rule of urlTransformations) {
              if (
                rule.type === "regex_replace" &&
                rule.pattern &&
                rule.replacement
              ) {
                const regex = new RegExp(rule.pattern, "g");
                targetUrl = targetUrl.replace(regex, rule.replacement);
              }
            }
          }

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
            // 보안 검증
            if (!this.validateScript(script)) {
              throw new Error(
                `Dangerous script pattern detected in evaluate action: ${description}`,
              );
            }

            try {
              // eslint-disable-next-line no-new-func
              const evaluateFn = new Function(`return ${script}`)();
              const result = await page.evaluate(evaluateFn);

              // 결과가 있으면 로깅 (디버깅용)
              if (result !== undefined && result !== null) {
                logger.info(
                  { productId, description, result },
                  "evaluate 실행 결과",
                );
              } else {
                logger.debug({ productId, description }, "evaluate 실행 완료");
              }
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

        case "waitForSelector": {
          // CSS 셀렉터가 나타날 때까지 대기
          const { selector } = step;
          if (selector) {
            try {
              await page.waitForSelector(selector, {
                state: "attached",
                timeout: timeout || 10000,
              });
              logger.debug(
                { productId, selector, description },
                "waitForSelector 완료",
              );
            } catch (error) {
              logger.warn(
                {
                  productId,
                  selector,
                  error: error instanceof Error ? error.message : String(error),
                },
                "waitForSelector 실패 - 계속 진행",
              );
            }
          }
          break;
        }

        case "waitForFunction": {
          // JavaScript 함수가 true를 반환할 때까지 대기
          const { script } = step;
          if (script) {
            // 보안 검증
            if (!this.validateScript(script)) {
              throw new Error(
                `Dangerous script pattern detected in waitForFunction action: ${description}`,
              );
            }

            try {
              // eslint-disable-next-line no-new-func
              const waitFn = new Function(`return ${script}`)();
              await page.waitForFunction(waitFn, {
                timeout: timeout || 10000,
              });
              logger.debug({ productId, description }, "waitForFunction 완료");
            } catch (error) {
              logger.warn(
                {
                  productId,
                  error: error instanceof Error ? error.message : String(error),
                },
                "waitForFunction 실패 - 계속 진행",
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
    const { method, extractor, config, script } = extraction;

    // ExtractorRegistry 방식 (Phase 1 리팩토링)
    if (extractor && !method) {
      const { ExtractorRegistry } = await import(
        "@/extractors/ExtractorRegistry"
      );
      const registry = ExtractorRegistry.getInstance();

      try {
        const extractorInstance = registry.get(extractor);
        const result = await extractorInstance.extract(page);

        // isAvailable 기반 판매 상태 매핑
        // true → SELNG (판매중), false → SLDOT (품절)
        const domSaleStatus = result.saleStatus.isAvailable ? "SELNG" : "SLDOT";

        // ProductData → ScriptExecutionResult 변환
        return {
          name: result.metadata.productName,
          brand: result.metadata.brand,
          title_images: result.metadata.thumbnail
            ? [result.metadata.thumbnail]
            : [],
          consumer_price: result.price.originalPrice || result.price.price,
          price: result.price.price,
          sale_status: domSaleStatus, // DOM 기반 상태 (SELNG, SLDOT)
          _source: "extractor",
          _redirected: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Extractor 실행 실패 (${extractor}): ${message}`);
      }
    }

    // JSON-LD Schema.org Extractor 사용 (Legacy)
    if (method === "json_ld_schema" && extractor === "JsonLdSchemaExtractor") {
      const jsonLdExtractor = new JsonLdSchemaExtractor(config);
      const result = await jsonLdExtractor.extract(page);

      return {
        ...result,
        _redirected: false,
      };
    }

    // Legacy: YAML script 방식 (하위 호환성)
    if (method === "evaluate") {
      if (!script) {
        throw new Error("Extraction script가 정의되지 않음");
      }

      // 보안 검증
      if (!this.validateScript(script)) {
        throw new Error(
          "Dangerous script pattern detected in extraction script",
        );
      }

      // YAML script를 함수로 변환 후 실행
      try {
        // script는 이미 함수 형태의 문자열: "() => { ... }"
        // eslint-disable-next-line no-new-func
        const extractionFn = new Function(`return ${script}`)();

        // Page.evaluate()로 브라우저 컨텍스트에서 실행
        const result = (await page.evaluate(
          extractionFn,
        )) as ScriptExecutionResult;

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Extraction script 실행 실패: ${message}`);
      }
    }

    throw new Error(
      `지원하지 않는 extraction 설정 - method: ${method}, extractor: ${extractor}`,
    );
  }
}

/**
 * OliveyoungExtractor
 *
 * 목적: 올리브영 통합 Extractor (Facade Pattern)
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 * 참고: docs/analysis/oliveyoung-logic-analysis.md
 */

import type { Page } from "playwright";
import type { IProductExtractor, ProductData } from "@/extractors/base";
import { ConfigLoader } from "@/config/ConfigLoader";
import {
  OliveyoungConfig,
  OliveyoungSelectors,
} from "@/core/domain/OliveyoungConfig";
import { OliveyoungPriceExtractor } from "./OliveyoungPriceExtractor";
import { OliveyoungSaleStatusExtractor } from "./OliveyoungSaleStatusExtractor";
import { OliveyoungMetadataExtractor } from "./OliveyoungMetadataExtractor";
import { logger } from "@/config/logger";

/**
 * 올리브영 통합 추출기
 *
 * 전략:
 * - Facade Pattern으로 3개 전문 Extractor 조합
 * - 병렬 처리로 성능 최적화
 * - 각 Extractor는 독립적으로 동작
 *
 * @implements {IProductExtractor<Page>} Playwright Page 기반 추출
 */
export class OliveyoungExtractor implements IProductExtractor<Page> {
  private readonly priceExtractor: OliveyoungPriceExtractor;
  private readonly saleStatusExtractor: OliveyoungSaleStatusExtractor;
  private readonly metadataExtractor: OliveyoungMetadataExtractor;
  private readonly selectors?: OliveyoungSelectors;

  // Constants from YAML
  private readonly Z_INDEX_THRESHOLD: number;
  private readonly MAIN_IMAGE_WAIT_MS: number;

  constructor() {
    const config = ConfigLoader.getInstance().loadConfig(
      "oliveyoung",
    ) as OliveyoungConfig;
    this.selectors = config.selectors;

    // Load constants from YAML (required values)
    if (
      !config.constants?.Z_INDEX_OVERLAY_THRESHOLD ||
      !config.constants?.MAIN_IMAGE_WAIT_MS
    ) {
      throw new Error(
        "Missing required constants in oliveyoung.yaml: Z_INDEX_OVERLAY_THRESHOLD, MAIN_IMAGE_WAIT_MS",
      );
    }
    this.Z_INDEX_THRESHOLD = config.constants.Z_INDEX_OVERLAY_THRESHOLD;
    this.MAIN_IMAGE_WAIT_MS = config.constants.MAIN_IMAGE_WAIT_MS;

    this.priceExtractor = new OliveyoungPriceExtractor(config.selectors?.price);
    this.saleStatusExtractor = new OliveyoungSaleStatusExtractor(
      config.selectors,
      config.error_messages,
      config.error_url_patterns,
      config.button_text_patterns,
    );
    this.metadataExtractor = new OliveyoungMetadataExtractor(
      config.selectors,
      config.error_messages,
      config.thumbnail_exclusions,
      config.product_number_pattern,
    );
  }

  /**
   * 전체 상품 정보 추출
   *
   * 전략:
   * - 전처리: 배너 제거, 이미지 로드 대기, 페이지 타입 확인
   * - Promise.all로 병렬 처리 (성능 최적화)
   * - 각 Extractor 실패 시에도 나머지 계속 진행
   *
   * @param page Playwright Page 객체
   * @returns 추출된 전체 상품 데이터
   */
  async extract(page: Page): Promise<ProductData> {
    // 전처리: 페이지 준비
    await this.preparePage(page);

    // 병렬 추출로 성능 최적화
    const [metadata, price, saleStatus] = await Promise.all([
      this.metadataExtractor.extract(page),
      this.priceExtractor.extract(page),
      this.saleStatusExtractor.extract(page),
    ]);

    return {
      metadata,
      price,
      saleStatus,
    };
  }

  /**
   * 페이지 전처리
   *
   * 순서:
   * 1. 배너/팝업 제거
   * 2. 메인 이미지 로드 대기
   * 3. 페이지 타입 확인 (Mobile/Desktop)
   *
   * @param page Playwright Page 객체
   */
  private async preparePage(page: Page): Promise<void> {
    await this.removeBannersAndPopups(page);
    await this.waitForMainImage(page);
    await this.detectPageType(page);
  }

  /**
   * Step 2: 배너/팝업 제거
   *
   * 전략:
   * - 쿠폰 배너, 광고 배너 제거
   * - z-index 높은 overlay 제거 (z-index > 100)
   */
  private async removeBannersAndPopups(page: Page): Promise<void> {
    const bannerSelectors = this.selectors?.banners || [];
    const selectorString = bannerSelectors.join(", ");
    const zIndexThreshold = this.Z_INDEX_THRESHOLD;

    await page.evaluate(
      ({ selectorString, zIndexThreshold }) => {
        // 쿠폰 배너, 광고 배너 제거
        const banners = document.querySelectorAll(selectorString);
        banners.forEach((el) => el.remove());

        // z-index 높은 overlay 제거
        const allElements = document.querySelectorAll("*");
        allElements.forEach((el) => {
          const zIndex = parseInt(window.getComputedStyle(el).zIndex);
          if (zIndex > zIndexThreshold) {
            el.remove();
          }
        });
      },
      { selectorString, zIndexThreshold },
    );
  }

  /**
   * Step 3: 메인 이미지 로드 대기
   *
   * 전략:
   * - Swiper 활성 슬라이드의 메인 이미지 완전 로드 대기
   * - 이미지 로드 완료 + 실제 크기 확인
   * - 최대 5초 대기
   */
  private async waitForMainImage(page: Page): Promise<void> {
    const mainImageSelector = this.selectors?.images?.main || "";
    const maxWaitMs = this.MAIN_IMAGE_WAIT_MS;

    await page.evaluate(
      ({ mainImageSelector, maxWaitMs }) => {
        return (async () => {
          window.scrollTo(0, 0);

          const startTime = Date.now();

          while (Date.now() - startTime < maxWaitMs) {
            const mainImg = document.querySelector(
              mainImageSelector,
            ) as HTMLImageElement;

            if (mainImg && mainImg.complete && mainImg.naturalHeight > 0) {
              // 이미지 로드 완료 + 실제 크기 확인
              const currentSrc = mainImg.currentSrc || mainImg.src;
              if (currentSrc && currentSrc.includes("oliveyoung.co.kr")) {
                return true;
              }
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          return true;
        })();
      },
      { mainImageSelector, maxWaitMs },
    );
  }

  /**
   * Step 4: 페이지 타입 확인 (Mobile/Desktop)
   *
   * 전략:
   * - User-Agent 확인
   * - URL 경로 확인
   * - DOM 레이아웃 확인 (Mobile/Desktop 요소)
   * - Desktop 레이아웃 감지 시 경고
   */
  private async detectPageType(page: Page): Promise<void> {
    const mobileSelectors = this.selectors?.layout?.mobile || [];
    const desktopSelectors = this.selectors?.layout?.desktop || [];

    const mobileSelectorStr = mobileSelectors.join(", ");
    const desktopSelectorStr = desktopSelectors.join(", ");

    const pageInfo = await page.evaluate(
      ({ mobileSelectorStr, desktopSelectorStr }) => {
        const ua = navigator.userAgent;
        const isMobileUA = /Mobile|iPhone|Android/i.test(ua);
        const pathname = window.location.pathname;
        const isMobilePath = pathname.includes("/m/goods/");

        // Mobile/Desktop DOM 요소 감지
        const hasMobileLayout = !!document.querySelector(mobileSelectorStr);
        const hasDesktopLayout = !!document.querySelector(desktopSelectorStr);

        return {
          userAgent: ua,
          isMobileUA,
          pathname,
          isMobilePath,
          url: window.location.href,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          hasMobileLayout,
          hasDesktopLayout,
        };
      },
      { mobileSelectorStr, desktopSelectorStr },
    );

    // 로거를 통한 구조화된 로깅
    logger.debug(
      {
        user_agent: pageInfo.userAgent,
        is_mobile_ua: pageInfo.isMobileUA,
        url: pageInfo.url,
        pathname: pageInfo.pathname,
        is_mobile_path: pageInfo.isMobilePath,
        viewport: pageInfo.viewport,
        has_mobile_layout: pageInfo.hasMobileLayout,
        has_desktop_layout: pageInfo.hasDesktopLayout,
      },
      "Page type detection completed",
    );

    // 경고 로깅
    if (!pageInfo.isMobileUA) {
      logger.warn("Desktop User-Agent detected");
    }
    if (pageInfo.hasDesktopLayout && !pageInfo.hasMobileLayout) {
      logger.warn("Desktop layout detected - page reload may be required");
    }
  }
}

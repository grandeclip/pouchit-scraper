/**
 * OliveyoungExtractor
 *
 * 목적: 올리브영 통합 Extractor (Facade Pattern)
 * 패턴: Facade Pattern - 여러 전문 Extractor 통합
 * 참고: docs/analysis/oliveyoung-logic-analysis.md
 */

import type { Page } from "playwright";
import type { IProductExtractor, ProductData } from "@/extractors/base";
import { OliveyoungPriceExtractor } from "./OliveyoungPriceExtractor";
import { OliveyoungSaleStatusExtractor } from "./OliveyoungSaleStatusExtractor";
import { OliveyoungMetadataExtractor } from "./OliveyoungMetadataExtractor";

/**
 * 올리브영 통합 추출기
 *
 * 전략:
 * - Facade Pattern으로 3개 전문 Extractor 조합
 * - 병렬 처리로 성능 최적화
 * - 각 Extractor는 독립적으로 동작
 */
export class OliveyoungExtractor implements IProductExtractor {
  private readonly priceExtractor: OliveyoungPriceExtractor;
  private readonly saleStatusExtractor: OliveyoungSaleStatusExtractor;
  private readonly metadataExtractor: OliveyoungMetadataExtractor;

  constructor() {
    this.priceExtractor = new OliveyoungPriceExtractor();
    this.saleStatusExtractor = new OliveyoungSaleStatusExtractor();
    this.metadataExtractor = new OliveyoungMetadataExtractor();
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
    await page.evaluate(`
      (() => {
        // 쿠폰 배너, 광고 배너 제거
        const banners = document.querySelectorAll(
          '.banner, .popup, .modal, .coupon-banner, [class*="banner"], [class*="popup"]'
        );
        banners.forEach((el) => el.remove());

        // z-index 높은 overlay 제거
        const allElements = document.querySelectorAll("*");
        allElements.forEach((el) => {
          const zIndex = parseInt(window.getComputedStyle(el).zIndex);
          if (zIndex > 100) {
            el.remove();
          }
        });
      })()
    `);
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
    await page.evaluate(`
      (async () => {
        window.scrollTo(0, 0);

        const maxWait = 5000; // 5초
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
          const activeSlide = document.querySelector(".swiper-slide-active");
          const mainImg = activeSlide?.querySelector("img");

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
      })()
    `);
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
    await page.evaluate(`
      (() => {
        const ua = navigator.userAgent;
        const isMobileUA = /Mobile|iPhone|Android/i.test(ua);
        const pathname = window.location.pathname;
        const isMobilePath = pathname.includes("/m/goods/");

        // Mobile/Desktop DOM 요소 감지
        const hasMobileLayout = !!document.querySelector(
          ".swiper-slide, .info-group__title"
        );
        const hasDesktopLayout = !!document.querySelector(
          ".prd_detail_top, #Contents, .prd_detail"
        );

        console.log("=== Page Info ===");
        console.log("User-Agent:", ua);
        console.log("Is Mobile UA:", isMobileUA);
        console.log("URL:", window.location.href);
        console.log("Pathname:", pathname);
        console.log("Is Mobile Path:", isMobilePath);
        console.log("Viewport:", window.innerWidth, "x", window.innerHeight);
        console.log("Has Mobile Layout:", hasMobileLayout);
        console.log("Has Desktop Layout:", hasDesktopLayout);

        // 경고 출력
        if (!isMobileUA) {
          console.warn("⚠️ Desktop User-Agent 감지!");
        }
        if (hasDesktopLayout && !hasMobileLayout) {
          console.warn("⚠️ Desktop Layout 감지! (새로고침 필요)");
        }

        return {
          userAgent: ua,
          isMobileUA,
          pathname,
          isMobilePath,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          hasMobileLayout,
          hasDesktopLayout,
        };
      })()
    `);
  }
}

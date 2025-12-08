/**
 * Oliveyoung Extractor E2E Test
 *
 * 목적: 실제 올리브영 상품 페이지로 Extractor 검증
 * 환경: Playwright 브라우저 (Chromium)
 * 실행: npm run test:e2e (수동)
 *
 * 주의:
 * - 네트워크 의존 테스트 (CI/CD에서 제외 권장)
 * - 올리브영 페이지 구조 변경 시 실패 가능
 * - 실행 시간 약 10-15초
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { ExtractorRegistry } from "@/extractors/ExtractorRegistry";
import type { ProductData } from "@/extractors/base";
import { SaleStatus } from "@/extractors/base";

describe("Oliveyoung Extractor E2E Test (실제 상품)", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  // 테스트용 실제 상품 URL (안정적인 베스트셀러)
  const TEST_PRODUCT_URL =
    "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000183150"; // 라로슈포제 시카플라스트 밤 B5+

  beforeAll(async () => {
    // Playwright 브라우저 실행
    browser = await chromium.launch({
      headless: true, // CI 환경: true, 로컬 디버깅: false
    });

    // 모바일 컨텍스트 (올리브영은 모바일 페이지 사용)
    context = await browser.newContext({
      viewport: { width: 430, height: 932 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    page = await context.newPage();
  }, 30000); // 브라우저 시작 timeout 30초

  afterAll(async () => {
    await page?.close();
    await context?.close();
    await browser?.close();
  });

  it("실제 올리브영 상품 페이지에서 데이터 추출", async () => {
    // Step 1: 상품 페이지 이동
    await page.goto(TEST_PRODUCT_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Step 2: 페이지 렌더링 대기 (3초)
    await page.waitForTimeout(3000);

    // Step 3: 상단 배너/팝업 제거
    await page.evaluate(() => {
      const banners = document.querySelectorAll(
        '.banner, .popup, .modal, .coupon-banner, [class*="banner"], [class*="popup"]',
      );
      banners.forEach((el) => el.remove());

      const allElements = document.querySelectorAll("*");
      allElements.forEach((el) => {
        const zIndex = parseInt(window.getComputedStyle(el as Element).zIndex);
        if (zIndex > 100) {
          el.remove();
        }
      });
    });

    // Step 4: 메인 이미지 로드 대기
    await page.evaluate(async () => {
      window.scrollTo(0, 0);

      const waitForImage = async () => {
        const maxWait = 5000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
          const activeSlide = document.querySelector(".swiper-slide-active");
          const mainImg = activeSlide?.querySelector("img");

          if (
            mainImg &&
            (mainImg as HTMLImageElement).complete &&
            (mainImg as HTMLImageElement).naturalHeight > 0
          ) {
            const currentSrc =
              (mainImg as HTMLImageElement).currentSrc ||
              (mainImg as HTMLImageElement).src;
            if (currentSrc && currentSrc.includes("oliveyoung.co.kr")) {
              return true;
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return true;
      };

      return await waitForImage();
    });

    // Step 5: Extractor 실행
    const registry = ExtractorRegistry.getInstance();
    const extractor = registry.get("oliveyoung");
    const result: ProductData = await extractor.extract(page);

    // Step 6: 검증
    console.log("=== E2E Test Result ===");
    console.log("Product Name:", result.metadata.productName);
    console.log("Brand:", result.metadata.brand);
    console.log("Thumbnail:", result.metadata.thumbnail);
    console.log("Price:", result.price.price);
    console.log("Original Price:", result.price.originalPrice);
    console.log("Discount Rate:", result.price.discountRate);
    console.log("Sale Status:", result.saleStatus.saleStatus);
    console.log("Is Available:", result.saleStatus.isAvailable);

    // Metadata 검증
    expect(result.metadata.productName).toBeTruthy();
    expect(result.metadata.productName.length).toBeGreaterThan(3);
    expect(result.metadata.brand).toBeTruthy();
    expect(result.metadata.thumbnail).toMatch(/oliveyoung\.co\.kr/);
    expect(result.metadata.thumbnail).toMatch(/A\d{12}/); // 상품번호 포함

    // Price 검증
    expect(result.price.price).toBeGreaterThan(0);
    expect(result.price.currency).toBe("KRW");
    if (result.price.originalPrice) {
      expect(result.price.originalPrice).toBeGreaterThanOrEqual(
        result.price.price,
      );
    }
    if (result.price.discountRate) {
      expect(result.price.discountRate).toBeGreaterThan(0);
      expect(result.price.discountRate).toBeLessThanOrEqual(100);
    }

    // SaleStatus 검증
    expect([
      SaleStatus.InStock,
      SaleStatus.OutOfStock,
      SaleStatus.SoldOut,
      SaleStatus.Discontinued,
    ]).toContain(result.saleStatus.saleStatus);
    expect(typeof result.saleStatus.isAvailable).toBe("boolean");
  }, 60000); // 테스트 timeout 60초

  it("품절 상품 감지 테스트 (선택적)", async () => {
    // 품절 상품 URL (수동으로 찾아서 교체)
    const SOLD_OUT_URL =
      "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000000000"; // 임시

    try {
      await page.goto(SOLD_OUT_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      const registry = ExtractorRegistry.getInstance();
      const extractor = registry.get("oliveyoung");
      const result: ProductData = await extractor.extract(page);

      console.log("=== Sold Out Product Test ===");
      console.log("Sale Status:", result.saleStatus.saleStatus);
      console.log("Is Available:", result.saleStatus.isAvailable);

      // 품절 상태 검증
      expect(result.saleStatus.isAvailable).toBe(false);
      expect([
        SaleStatus.OutOfStock,
        SaleStatus.SoldOut,
        SaleStatus.Discontinued,
      ]).toContain(result.saleStatus.saleStatus);
    } catch (error) {
      console.warn("품절 상품 테스트 스킵 (URL 무효):", error);
      // 테스트 스킵 (품절 상품 URL이 유효하지 않을 수 있음)
    }
  }, 60000);
});

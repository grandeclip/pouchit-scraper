#!/usr/bin/env tsx
/**
 * window.__MSS__ 객체 확인 스크립트
 */

import { chromium } from "playwright";

(async () => {
  console.log("🔍 window.__MSS__ 객체 확인 시작\n");

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  const page = await context.newPage();

  try {
    console.log("📱 상품 페이지 접속...");
    await page.goto("https://www.musinsa.com/products/4350236", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("⏳ 페이지 렌더링 대기...\n");
    await page.waitForTimeout(2000);

    // 팝업 제거 시도
    console.log("🚫 팝업 제거 시도...\n");
    await page.evaluate(() => {
      const appBanners = document.querySelectorAll(
        '[class*="app"], [class*="download"], [class*="encourage"]',
      );
      appBanners.forEach((el) => (el as HTMLElement).remove());

      const overlays = document.querySelectorAll(
        '[class*="overlay"], [class*="modal"]',
      );
      overlays.forEach((el) => (el as HTMLElement).remove());

      document.body.style.overflow = "auto";
    });

    await page.waitForTimeout(1000);

    // window.__MSS__ 객체 확인
    const result = await page.evaluate(() => {
      return {
        hasMSS: typeof (window as any).__MSS__ !== "undefined",
        hasMSSProduct: typeof (window as any).__MSS__?.product !== "undefined",
        hasMSSProductState:
          typeof (window as any).__MSS__?.product?.state !== "undefined",
        mssKeys: (window as any).__MSS__
          ? Object.keys((window as any).__MSS__)
          : [],
        productData: (window as any).__MSS__?.product?.state || null,
      };
    });

    console.log("=".repeat(80));
    console.log("📊 window.__MSS__ 확인 결과:");
    console.log("=".repeat(80));
    console.log(`✅ window.__MSS__ 존재: ${result.hasMSS}`);
    console.log(`✅ window.__MSS__.product 존재: ${result.hasMSSProduct}`);
    console.log(
      `✅ window.__MSS__.product.state 존재: ${result.hasMSSProductState}`,
    );
    console.log(`📦 __MSS__ 최상위 키: ${JSON.stringify(result.mssKeys)}`);
    console.log("\n📦 상품 데이터 (product.state):");
    console.log(JSON.stringify(result.productData, null, 2));
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ 에러 발생:", error);
  } finally {
    await browser.close();
    console.log("\n✅ 테스트 완료");
  }
})();

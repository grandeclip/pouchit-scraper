/**
 * 무신사 모바일 DOM 디버깅 스크립트
 */

import { chromium } from "playwright";

(async () => {
  console.log("🔍 무신사 모바일 DOM 디버깅 시작...\n");

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
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });

  const page = await context.newPage();

  try {
    console.log("📱 모바일 설정으로 페이지 접속 중...");
    await page.goto("https://www.musinsa.com/products/4460527", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    console.log("⏳ 페이지 렌더링 대기...\n");
    await page.waitForTimeout(2000);

    // 앱 팝업 제거
    console.log("🚫 앱 팝업 제거...\n");
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

    const result = await page.evaluate(() => {
      // 모든 selector 테스트
      return {
        url: window.location.href,
        pathname: window.location.pathname,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },

        // 상품명 찾기 (텍스트 기반)
        productName: {
          selector1: document.querySelector("span.GoodsName-sc-1omefes-1")
            ?.textContent,
          selector2: document.querySelector(".GoodsName__Wrap span")
            ?.textContent,
          // "Washed Fortuna" 텍스트가 포함된 모든 요소
          byText: Array.from(document.querySelectorAll("*"))
            .filter(
              (el) =>
                el.textContent?.includes("Washed Fortuna") &&
                el.children.length === 0,
            )
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.trim(),
            })),
        },

        // 가격 찾기 (텍스트 기반)
        price: {
          calculatedPrice: document.querySelector(
            "span.Price__CalculatedPrice-sc-1hw5bl8-10",
          )?.textContent,
          originalPrice: document.querySelector(
            "span.text-body_13px_reg.line-through.text-gray-500",
          )?.textContent,
          // "34,300원" 포함된 요소
          byDiscountedText: Array.from(document.querySelectorAll("*"))
            .filter(
              (el) =>
                el.textContent?.includes("34,300") && el.children.length === 0,
            )
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.trim(),
            })),
          // "49,000원" 포함된 요소
          byOriginalText: Array.from(document.querySelectorAll("*"))
            .filter(
              (el) =>
                el.textContent?.includes("49,000") && el.children.length === 0,
            )
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.trim(),
            })),
        },

        // 썸네일 selector 테스트
        thumbnail: {
          alt0: document.querySelector('img[alt="Thumbnail 0"]')?.src,
          goodsImg: document.querySelector('img[src*="goods_img"]')?.src,
          swiperSlide: document.querySelector(".swiper-slide img")?.src,
          allImages: Array.from(document.querySelectorAll("img"))
            .slice(0, 5)
            .map((el) => ({
              alt: el.alt,
              src: el.src?.slice(0, 80),
            })),
        },

        // 구매 버튼 테스트
        buyButton: {
          all: Array.from(document.querySelectorAll("button")).map((btn) => ({
            text: btn.textContent?.trim().slice(0, 30),
            disabled: btn.disabled,
            visible:
              window.getComputedStyle(btn).display !== "none" &&
              window.getComputedStyle(btn).visibility !== "hidden",
          })),
        },

        // 전체 body text (처음 500자)
        bodyText: document.body.innerText.slice(0, 500),
      };
    });

    console.log("=".repeat(80));
    console.log("📊 디버그 결과:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(result, null, 2));
    console.log("=".repeat(80));

    // 스크린샷 저장
    const screenshotPath = "./debug-musinsa-mobile.png";
    await page.screenshot({ path: screenshotPath });
    console.log(`\n📸 스크린샷 저장: ${screenshotPath}`);
  } catch (error) {
    console.error("❌ 에러 발생:", error);
  } finally {
    await browser.close();
    console.log("\n✅ 디버깅 완료");
  }
})();

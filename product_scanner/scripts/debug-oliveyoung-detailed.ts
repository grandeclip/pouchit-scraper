/**
 * 올리브영 모바일 DOM 상세 분석 스크립트
 */

import { chromium } from "playwright";

(async () => {
  console.log("🔍 올리브영 모바일 DOM 상세 분석...\n");

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
    await page.goto(
      "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822",
      {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      },
    );

    await page.waitForTimeout(2000);

    // 앱 팝업 제거
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
      // goods-detail__primary-info 구조 상세 분석
      const primaryInfo = document.querySelector(".goods-detail__primary-info");

      return {
        url: window.location.href,

        // primary-info 내부 구조
        primaryInfo: {
          exists: !!primaryInfo,
          innerHTML: primaryInfo?.innerHTML.slice(0, 500),
          children: primaryInfo
            ? Array.from(primaryInfo.children).map((el) => ({
                tag: el.tagName,
                class: el.className,
                text: el.textContent?.trim().slice(0, 100),
              }))
            : [],
        },

        // 상품명 후보들
        productNameCandidates: [
          {
            selector: ".goods-detail__primary-info h1",
            text: document
              .querySelector(".goods-detail__primary-info h1")
              ?.textContent?.trim(),
          },
          {
            selector: ".goods-detail__primary-info .prd-name",
            text: document
              .querySelector(".goods-detail__primary-info .prd-name")
              ?.textContent?.trim(),
          },
          {
            selector: ".goods-detail__primary-info strong",
            text: document
              .querySelector(".goods-detail__primary-info strong")
              ?.textContent?.trim(),
          },
          {
            selector: ".goods-detail__primary-info p",
            text: document
              .querySelector(".goods-detail__primary-info p")
              ?.textContent?.trim(),
          },
        ],

        // 브랜드 후보들
        brandCandidates: [
          {
            selector: ".goods-detail__primary-info span",
            text: document
              .querySelector(".goods-detail__primary-info span")
              ?.textContent?.trim(),
          },
          {
            selector: ".goods-detail__primary-info a",
            text: document
              .querySelector(".goods-detail__primary-info a")
              ?.textContent?.trim(),
          },
        ],
      };
    });

    console.log("=".repeat(80));
    console.log("📊 상세 분석 결과:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(result, null, 2));
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ 에러:", error);
  } finally {
    await browser.close();
  }
})();

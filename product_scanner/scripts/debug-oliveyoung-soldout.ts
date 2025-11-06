/**
 * 올리브영 품절 상품 디버깅 스크립트
 */

import { chromium } from "playwright";

(async () => {
  console.log("🔍 올리브영 품절 상품 디버깅...\n");

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
      "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000207761",
      {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      },
    );

    await page.waitForTimeout(3000);

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
      return {
        url: window.location.href,
        pathname: window.location.pathname,

        // 상품명 찾기
        productName: {
          infoGroupTitle: document
            .querySelector(".info-group__title")
            ?.textContent?.trim(),
          prdName: document.querySelector(".prd_name")?.textContent?.trim(),
        },

        // 브랜드
        brand: {
          topUtilsBrandLink: document
            .querySelector(".top-utils__brand-link")
            ?.textContent?.trim(),
          prdBrand: document.querySelector(".prd_brand")?.textContent?.trim(),
        },

        // 가격
        price: {
          infoGroupPrice: document
            .querySelector(".info-group__price .price")
            ?.textContent?.trim(),
          price2: document.querySelector(".price-2")?.textContent?.trim(),
        },

        // 버튼 텍스트 (품절 감지)
        buttons: Array.from(document.querySelectorAll("button"))
          .slice(0, 20)
          .map((btn) => ({
            text: btn.textContent?.trim().slice(0, 30),
            class: btn.className.slice(0, 50),
            visible:
              window.getComputedStyle(btn).display !== "none" &&
              window.getComputedStyle(btn).visibility !== "hidden",
          })),

        // Body text
        bodyText: document.body.innerText.slice(0, 500),
      };
    });

    console.log("=".repeat(80));
    console.log("📊 품절 상품 디버그 결과:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(result, null, 2));
    console.log("=".repeat(80));

    // 스크린샷 저장
    const screenshotPath = "./debug-oliveyoung-soldout.png";
    await page.screenshot({ path: screenshotPath });
    console.log(`\n📸 스크린샷 저장: ${screenshotPath}`);
  } catch (error) {
    console.error("❌ 에러:", error);
  } finally {
    await browser.close();
  }
})();

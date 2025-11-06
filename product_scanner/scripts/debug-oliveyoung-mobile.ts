/**
 * 올리브영 모바일 DOM 디버깅 스크립트
 */

import { chromium } from "playwright";

(async () => {
  console.log("🔍 올리브영 모바일 DOM 디버깅 시작...\n");

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
    console.log("⏰ waitUntil: domcontentloaded 사용\n");

    await page.goto(
      "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822",
      {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      },
    );

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
      // 모바일 DOM selector 테스트
      return {
        url: window.location.href,
        pathname: window.location.pathname,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },

        // 상품명 찾기 (모바일) - 더 많은 selector 시도
        productName: {
          h2PrdName: document.querySelector("h2.prd-name")?.textContent?.trim(),
          goodsName: document.querySelector(".goods-name")?.textContent?.trim(),
          prdNameText: document
            .querySelector(".prd-name-text")
            ?.textContent?.trim(),
          productTitle: document
            .querySelector(".product-title")
            ?.textContent?.trim(),
          allH2: Array.from(document.querySelectorAll("h2")).map((el) => ({
            class: el.className,
            text: el.textContent?.trim().slice(0, 50),
          })),
          allDivWithPrd: Array.from(
            document.querySelectorAll(
              '[class*="prd"], [class*="goods"], [class*="product"]',
            ),
          )
            .slice(0, 20)
            .map((el) => ({
              tag: el.tagName,
              class: el.className.slice(0, 50),
              text: el.textContent?.trim().slice(0, 60),
            })),
        },

        // 브랜드 찾기 (모바일)
        brand: {
          brandName: document.querySelector(".brand-name")?.textContent?.trim(),
          prdBrand: document.querySelector(".prd-brand")?.textContent?.trim(),
        },

        // 가격 찾기 (모바일)
        price: {
          infoGroupPrice: document
            .querySelector(".info-group__price .price")
            ?.textContent?.trim(),
          priceGroupPrice: document
            .querySelector(".price-group .price")
            ?.textContent?.trim(),
          firstPrice: document.querySelector(".price")?.textContent?.trim(),
        },

        // 썸네일 찾기 (모바일)
        thumbnail: {
          oliveyoungImg: document
            .querySelector('img[src*="oliveyoung.co.kr"]')
            ?.getAttribute("src"),
          allImages: Array.from(document.querySelectorAll("img"))
            .slice(0, 5)
            .map((el) => ({
              alt: el.alt,
              src: el.src?.slice(0, 80),
            })),
        },

        // 버튼 찾기 (모바일: 텍스트 기반)
        buttons: {
          hasSoldOut: Array.from(document.querySelectorAll("button")).some(
            (btn) =>
              btn.textContent?.includes("품절") ||
              btn.textContent?.includes("재입고"),
          ),
          hasCart: Array.from(document.querySelectorAll("button")).some((btn) =>
            btn.textContent?.includes("장바구니"),
          ),
          hasBuy: Array.from(document.querySelectorAll("button")).some(
            (btn) =>
              btn.textContent?.includes("바로구매") ||
              btn.textContent?.includes("구매"),
          ),
          allButtons: Array.from(document.querySelectorAll("button"))
            .slice(0, 15)
            .map((btn) => ({
              text: btn.textContent?.trim().slice(0, 30),
              class: btn.className.slice(0, 50),
              visible:
                window.getComputedStyle(btn).display !== "none" &&
                window.getComputedStyle(btn).visibility !== "hidden",
            })),
        },

        // 전체 body text (처음 500자)
        bodyText: document.body.innerText.slice(0, 500),

        // 에러 체크
        errorCheck: {
          h1Text: document.querySelector("h1")?.textContent?.trim(),
          hasErrorPage:
            document
              .querySelector("h1")
              ?.textContent?.includes("페이지를 찾을 수 없") || false,
        },
      };
    });

    console.log("=".repeat(80));
    console.log("📊 디버그 결과:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(result, null, 2));
    console.log("=".repeat(80));

    // 스크린샷 저장
    const screenshotPath = "./debug-oliveyoung-mobile.png";
    await page.screenshot({ path: screenshotPath });
    console.log(`\n📸 스크린샷 저장: ${screenshotPath}`);
  } catch (error) {
    console.error("❌ 에러 발생:", error);
  } finally {
    await browser.close();
    console.log("\n✅ 디버깅 완료");
  }
})();

#!/usr/bin/env tsx

/**
 * a-bly 4개 품목 종합 테스트
 * - 판매중, 품절 2개, 판매중지
 * - Stealth Plugin 사용
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as fs from "fs";
import * as path from "path";

const DEBUG_DIR = "/app/analysis/a-bly-debug";

const TEST_PRODUCTS = [
  { id: "20787714", desc: "판매중 (라운드랩)" },
  { id: "32438971", desc: "품절 1 (네이밍)" },
  { id: "3092743", desc: "품절 2 (기타)" },
  { id: "32438042", desc: "판매중지 (Alert 예상)" },
];

interface ProductData {
  productId: string;
  description: string;
  success: boolean;
  cloudflareBlocked: boolean;
  hasNextData: boolean;
  extractionMethod: string;
  data?: {
    title?: string;
    metaTitle?: string;
    metaImage?: string;
    price?: string;
    saleType?: string;
    images?: string[];
    buttons?: string[];
  };
  error?: string;
  detectionInfo?: {
    webdriver: any;
    chrome: boolean;
    plugins: number;
  };
}

async function testProducts() {
  console.log("🔍 A-bly 4개 품목 종합 테스트\n");
  console.log("🛡️  Stealth Plugin 활성화\n");

  // 디버그 디렉토리 생성
  // if (!fs.existsSync(DEBUG_DIR)) {
  //   fs.mkdirSync(DEBUG_DIR, { recursive: true });
  // }

  // Stealth Plugin 적용
  chromium.use(StealthPlugin());

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
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
  const results: ProductData[] = [];

  for (const [index, product] of TEST_PRODUCTS.entries()) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📦 [${index + 1}/4] ${product.desc} (${product.id})`);
    console.log(`${"=".repeat(70)}\n`);

    const url = `https://m.a-bly.com/goods/${product.id}`;
    const result: ProductData = {
      productId: product.id,
      description: product.desc,
      success: false,
      cloudflareBlocked: false,
      hasNextData: false,
      extractionMethod: "unknown",
    };

    try {
      console.log(`⏱️  로딩: ${url}`);
      const startTime = Date.now();

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await page.waitForTimeout(2000);
      const loadTime = Date.now() - startTime;

      console.log(`✅ 로딩 완료 (${loadTime}ms)`);

      // 1. Cloudflare 및 기본 정보 확인
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          isCloudflare:
            document.title.includes("Just a moment") ||
            document.title.includes("잠시만"),
          hasNextData: !!document.getElementById("__NEXT_DATA__"),
          url: window.location.href,
        };
      });

      result.cloudflareBlocked = pageInfo.isCloudflare;
      result.hasNextData = pageInfo.hasNextData;

      console.log(`📄 제목: ${pageInfo.title}`);
      console.log(
        `🔒 Cloudflare: ${pageInfo.isCloudflare ? "❌ 차단" : "✅ 통과"}`,
      );
      console.log(`📊 Next.js 데이터: ${pageInfo.hasNextData ? "✅" : "❌"}`);

      if (pageInfo.url !== url) {
        console.log(`🔀 리다이렉트: ${pageInfo.url}`);
      }

      // Cloudflare 차단 시 스킵
      if (pageInfo.isCloudflare) {
        result.error = "Cloudflare blocked";
        results.push(result);
        continue;
      }

      // 2. Detection 정보
      const detectionInfo = await page.evaluate(() => {
        return {
          webdriver: (navigator as any).webdriver,
          chrome: !!(window as any).chrome,
          plugins: navigator.plugins.length,
        };
      });

      result.detectionInfo = detectionInfo;
      console.log(
        `🔍 Detection: webdriver=${detectionInfo.webdriver}, chrome=${detectionInfo.chrome}, plugins=${detectionInfo.plugins}`,
      );

      // 3. SSR 데이터 추출 시도
      const ssrData = await page.evaluate(() => {
        const script = document.getElementById("__NEXT_DATA__");
        if (!script) return null;

        try {
          const data = JSON.parse(script.textContent || "{}");
          const queries =
            data.props?.pageProps?.serverQueryClient?.queries || [];
          const goods = queries[0]?.state?.data?.goods;

          if (goods) {
            return {
              method: "SSR",
              name: goods.name,
              saleType: goods.sale_type,
              price: goods.price_info?.thumbnail_price,
              originalPrice: goods.price_info?.consumer,
              images: goods.cover_images?.slice(0, 3) || [],
            };
          }
        } catch (e) {
          return { error: (e as Error).message };
        }

        return null;
      });

      if (ssrData && !ssrData.error) {
        console.log(`✅ SSR 추출 성공`);
        result.extractionMethod = "SSR";
        result.success = true;
        result.data = {
          title: ssrData.name,
          saleType: ssrData.saleType,
          price: ssrData.price?.toString(),
          images: ssrData.images,
        };

        console.log(`   상품명: ${ssrData.name}`);
        console.log(`   상태: ${ssrData.saleType}`);
        console.log(`   가격: ${ssrData.price}원`);
      } else {
        // 4. DOM/Meta 태그 추출 (fallback)
        console.log(`⚠️  SSR 없음 → Meta/DOM 추출`);

        const domData = await page.evaluate(() => {
          return {
            metaTitle: document
              .querySelector('meta[property="og:title"]')
              ?.getAttribute("content"),
            metaImage: document
              .querySelector('meta[property="og:image"]')
              ?.getAttribute("content"),
            metaPrice: document
              .querySelector('meta[property="og:price:amount"]')
              ?.getAttribute("content"),
            buttons: Array.from(document.querySelectorAll("button"))
              .map((btn) => btn.textContent?.trim())
              .filter(Boolean)
              .slice(0, 5),
            images: Array.from(document.querySelectorAll("img"))
              .map((img) => img.src)
              .filter((src) => src && src.startsWith("http"))
              .slice(0, 3),
          };
        });

        result.extractionMethod = "DOM";
        result.success = !!domData.metaTitle;
        result.data = {
          metaTitle: domData.metaTitle || undefined,
          metaImage: domData.metaImage || undefined,
          price: domData.metaPrice || undefined,
          buttons: domData.buttons as string[],
          images: domData.images,
        };

        console.log(`   Meta 제목: ${domData.metaTitle || "없음"}`);
        console.log(`   Meta 가격: ${domData.metaPrice || "없음"}`);
        console.log(`   버튼 개수: ${domData.buttons?.length || 0}`);
      }

      // 스크린샷 저장
      // const screenshotPath = path.join(
      //   DEBUG_DIR,
      //   `4products-${product.id}.png`,
      // );
      // await page.screenshot({ path: screenshotPath, fullPage: false });
      // console.log(`📸 스크린샷: ${screenshotPath}`);
    } catch (error) {
      console.error(`❌ 에러:`, error instanceof Error ? error.message : error);
      result.error = error instanceof Error ? error.message : String(error);
    }

    results.push(result);

    // 다음 요청 전 짧은 대기
    if (index < TEST_PRODUCTS.length - 1) {
      await page.waitForTimeout(1500);
    }
  }

  await browser.close();

  // 결과 요약
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📊 테스트 결과 요약`);
  console.log(`${"=".repeat(70)}\n`);

  const summary = {
    total: results.length,
    success: results.filter((r) => r.success).length,
    cloudflareBlocked: results.filter((r) => r.cloudflareBlocked).length,
    ssrExtraction: results.filter((r) => r.extractionMethod === "SSR").length,
    domExtraction: results.filter((r) => r.extractionMethod === "DOM").length,
    failed: results.filter((r) => !r.success && !r.cloudflareBlocked).length,
  };

  console.log(`전체: ${summary.total}개`);
  console.log(`성공: ${summary.success}개`);
  console.log(`Cloudflare 차단: ${summary.cloudflareBlocked}개`);
  console.log(`SSR 추출: ${summary.ssrExtraction}개`);
  console.log(`DOM 추출: ${summary.domExtraction}개`);
  console.log(`실패: ${summary.failed}개\n`);

  // 개별 결과
  results.forEach((r, i) => {
    const status = r.success
      ? "✅"
      : r.cloudflareBlocked
        ? "🔒"
        : r.error
          ? "❌"
          : "⚠️";
    console.log(
      `${status} [${i + 1}] ${r.description} → ${r.extractionMethod} ${r.data?.title || r.data?.metaTitle || "데이터 없음"}`,
    );
  });

  // JSON 저장
  // const resultPath = path.join(DEBUG_DIR, "4products-test-results.json");
  // fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
  // console.log(`\n💾 결과 저장: ${resultPath}`);

  console.log(`\n✅ 테스트 완료`);
}

testProducts().catch((error) => {
  console.error("💥 치명적 에러:", error);
  process.exit(1);
});

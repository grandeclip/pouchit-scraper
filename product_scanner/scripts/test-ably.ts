#!/usr/bin/env tsx

/**
 * a-bly 4개 품목 종합 테스트
 * - 판매중, 품절 2개, 판매중지
 * - Stealth Plugin 사용
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";


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
      // 1. API 응답 Promise 설정 (BEFORE navigation - 핵심!)
      let apiResponse: any = null;
      const apiPromise = new Promise<any>((resolve) => {
        page.on("response", async (response) => {
          if (response.url().includes(`/api/v3/goods/${product.id}/basic/`)) {
            try {
              const data = await response.json();
              resolve(data);
            } catch (e) {
              console.error(`❌ JSON 파싱 실패: ${(e as Error).message}`);
            }
          }
        });
      });

      // 2. 페이지 로딩
      console.log(`⏱️  로딩: ${url}`);
      const startTime = Date.now();

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await page.waitForTimeout(2000);
      const loadTime = Date.now() - startTime;

      console.log(`✅ 로딩 완료 (${loadTime}ms)`);

      // 3. Cloudflare 및 기본 정보 확인
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

      // 4. Detection 정보
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

      // API 응답 대기 (최대 5초)
      try {
        apiResponse = await Promise.race([
          apiPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("API timeout")), 5000),
          ),
        ]);

        // API 응답 성공
        const goods = apiResponse.goods;
        console.log(`✅ API 캡처 성공\n`);

        if (goods && goods.name) {
          result.extractionMethod = "API";
          result.success = true;
          result.data = {
            title: goods.name,
            saleType: goods.sale_type,
            price: goods.price_info?.thumbnail_price?.toString(),
            images: goods.cover_images?.slice(0, 3) || [],
          };

          console.log(`   상품명: ${goods.name}`);
          console.log(`   브랜드: ${goods.market?.name || "없음"}`);
          console.log(`   상태: ${goods.sale_type}`);
          console.log(`   정가: ${goods.price_info?.consumer || 0}원`);
          console.log(`   할인가: ${goods.price_info?.thumbnail_price || 0}원`);
          console.log(
            `   이미지: ${goods.cover_images?.length || 0}개 (첫번째: ${goods.cover_images?.[0]?.substring(0, 50) || "없음"}...)`,
          );
        }
      } catch (e) {
        console.log(`❌ API 응답 캡처 실패: ${(e as Error).message}`);

        // Fallback: Meta 태그 기반 추출
        console.log(`⚠️  Meta 태그 fallback`);

        const metaData = await page.evaluate(() => {
          const metaTitle = document
            .querySelector('meta[property="og:title"]')
            ?.getAttribute("content");
          const metaImage = document
            .querySelector('meta[property="og:image"]')
            ?.getAttribute("content");

          return {
            metaTitle: metaTitle || "",
            metaImage: metaImage || "",
          };
        });

        result.extractionMethod = "Meta";
        result.success = !!metaData.metaTitle;
        result.data = {
          title: metaData.metaTitle,
          metaTitle: metaData.metaTitle,
          metaImage: metaData.metaImage,
          images: metaData.metaImage ? [metaData.metaImage] : [],
        };

        console.log(`   Meta 상품명: ${metaData.metaTitle || "없음"}`);
        console.log(`   Meta 이미지: ${metaData.metaImage || "없음"}`);
      }

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
    apiExtraction: results.filter((r) => r.extractionMethod === "API").length,
    metaExtraction: results.filter((r) => r.extractionMethod === "Meta").length,
    failed: results.filter((r) => !r.success && !r.cloudflareBlocked).length,
  };

  console.log(`전체: ${summary.total}개`);
  console.log(`성공: ${summary.success}개`);
  console.log(`Cloudflare 차단: ${summary.cloudflareBlocked}개`);
  console.log(`API 추출: ${summary.apiExtraction}개`);
  console.log(`Meta 추출: ${summary.metaExtraction}개`);
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

  console.log(`\n✅ 테스트 완료`);
}

testProducts().catch((error) => {
  console.error("💥 치명적 에러:", error);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Kurly (마켓컬리) 검색 스크립트 (Playwright + Stealth + Mobile)
 *
 * 사용법:
 *   npx tsx scripts/search-kurly.ts "토리든" 10
 *   npx tsx scripts/search-kurly.ts "토리든" 10 --json
 */

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

// Stealth 플러그인 적용
chromium.use(stealth());

interface KurlyGoods {
  no: number;
  name: string;
  shortDescription?: string;
  salesPrice: number;
  discountedPrice?: number;
  discountRate?: number;
  imageUrl?: string;
  productVerticalLargeUrl?: string;
}

interface ApiResponse {
  data?: {
    pagination?: {
      total_count: number;
    };
    products?: KurlyGoods[];
  };
}

interface SearchResult {
  keyword: string;
  total_count: number;
  products: {
    name: string;
    url: string;
    thumbnail: string;
  }[];
}

async function searchKurly(
  keyword: string,
  limit: number
): Promise<SearchResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();

  let allProducts: KurlyGoods[] = [];
  let totalCount = 0;

  // API 응답 인터셉트
  page.on("response", async (response) => {
    const url = response.url();
    
    try {
      const contentType = response.headers()["content-type"] || "";
      if (!contentType.includes("application/json")) return;

      // api.kurly.com/search/v4 - normal-search 엔드포인트
      if (url.includes("api.kurly.com") && url.includes("normal-search")) {
        const json = await response.json();
        console.log(`[API] normal-search 캡처됨`);
        
        // 응답 구조: data.listSections[0].data.items
        if (json.success && json.data?.listSections) {
          for (const section of json.data.listSections) {
            if (section.data?.items && section.data.items.length > 0) {
              allProducts = section.data.items;
              totalCount = json.data.meta?.pagination?.total || allProducts.length;
              console.log(`[API] 상품 ${allProducts.length}개 발견 (총 ${totalCount}개)`);
              break;
            }
          }
        }
      }
      
      // direct-search 폴백
      if (allProducts.length === 0 && url.includes("api.kurly.com") && url.includes("direct-search")) {
        const json = await response.json();
        console.log(`[API] direct-search 캡처됨`);
        
        if (json.success && json.data?.listSections) {
          for (const section of json.data.listSections) {
            if (section.data?.items && section.data.items.length > 0) {
              allProducts = section.data.items;
              totalCount = json.data.meta?.pagination?.total || allProducts.length;
              console.log(`[API] 상품 ${allProducts.length}개 발견`);
              break;
            }
          }
        }
      }
    } catch (e) {
      // 파싱 실패 무시
    }
  });

  try {
    // 홈으로 먼저 이동
    console.log("[Navigate] 홈으로 이동...");
    await page.goto("https://www.kurly.com", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    // 검색 페이지로 이동
    console.log("[Navigate] 검색 페이지로 이동...");
    const searchUrl = `https://www.kurly.com/search?sword=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // API 응답 대기 (최대 20초)
    console.log("[Wait] API 응답 대기...");
    for (let i = 0; i < 40 && allProducts.length === 0; i++) {
      await page.waitForTimeout(500);
    }

    // 스크린샷 저장 (디버깅용)
    await page.screenshot({ path: "/tmp/kurly-debug.png" });
    console.log("[Debug] 스크린샷 저장: /tmp/kurly-debug.png");

    await browser.close();

    if (allProducts.length === 0) {
      throw new Error("상품 데이터를 받지 못했습니다. Kurly가 봇을 차단하고 있을 수 있습니다.");
    }

    const products = allProducts
      .slice(0, limit)
      .map((item: any) => ({
        name: item.name,
        url: `https://www.kurly.com/goods/${item.no}`,
        thumbnail: item.productVerticalMediumUrl || item.listImageUrl || "",
      }));

    return {
      keyword,
      total_count: totalCount,
      products,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// CLI 메인
async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0];
  const limit = parseInt(args[1]) || 5;
  const isJson = args.includes("--json");

  if (!keyword) {
    console.log("사용법: npx tsx scripts/search-kurly.ts <검색어> [limit] [--json]");
    console.log("예시: npx tsx scripts/search-kurly.ts \"토리든\" 10");
    console.log("      npx tsx scripts/search-kurly.ts \"토리든\" 10 --json");
    process.exit(1);
  }

  try {
    const result = await searchKurly(keyword, limit);

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n🔍 검색어: ${result.keyword}`);
      console.log(`📊 총 결과: ${result.total_count}개\n`);
      console.log("=".repeat(60));

      result.products.forEach((product, index) => {
        console.log(`\n[${index + 1}] ${product.name}`);
        console.log(`    📎 URL: ${product.url}`);
        console.log(`    🖼️  Thumbnail: ${product.thumbnail}`);
      });

      console.log("\n" + "=".repeat(60));
    }
  } catch (error) {
    console.error("검색 실패:", error);
    process.exit(1);
  }
}

main();


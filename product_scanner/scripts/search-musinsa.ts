#!/usr/bin/env npx tsx
/**
 * Musinsa (무신사) 검색 스크립트 (Playwright + Stealth + Mobile)
 *
 * 사용법:
 *   npx tsx scripts/search-musinsa.ts "토리든" 10
 *   npx tsx scripts/search-musinsa.ts "토리든" 10 --json
 */

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

// Stealth 플러그인 적용
chromium.use(stealth());

interface MusinsaGoods {
  goodsNo: number;
  goodsName: string;
  goodsLinkUrl: string;
  thumbnail: string;
  price: number;
  salePrice: number;
  discountRate: number;
  brandName?: string;
}

interface ApiResponse {
  data?: {
    pagination?: {
      total: number;
    };
    list?: MusinsaGoods[];
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

async function searchMusinsa(
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

  let apiResponse: ApiResponse | null = null;

  // API 응답 인터셉트
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api2/dp/v1/plp/goods") && !url.includes("/label")) {
      try {
        const json = await response.json();
        apiResponse = json;
      } catch {
        // JSON 파싱 실패 무시
      }
    }
  });

  try {
    // 검색 결과 페이지로 직접 이동
    const searchUrl = `https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(keyword)}&gf=A`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // API 응답 대기 (최대 15초)
    for (let i = 0; i < 30 && !apiResponse; i++) {
      await page.waitForTimeout(500);
    }

    await browser.close();

    if (!apiResponse || !apiResponse.data) {
      throw new Error("API 응답을 받지 못했습니다.");
    }

    const goodsList = apiResponse.data.list || [];
    const totalCount = apiResponse.data.pagination?.total || goodsList.length;

    const products = goodsList
      .slice(0, limit)
      .map((item) => {
        // goodsLinkUrl이 이미 전체 URL인 경우 처리
        const url = item.goodsLinkUrl.startsWith("http")
          ? item.goodsLinkUrl
          : `https://www.musinsa.com${item.goodsLinkUrl}`;
        return {
          name: item.goodsName,
          url,
          thumbnail: item.thumbnail,
        };
      });

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
    console.log("사용법: npx tsx scripts/search-musinsa.ts <검색어> [limit] [--json]");
    console.log("예시: npx tsx scripts/search-musinsa.ts \"토리든\" 10");
    console.log("      npx tsx scripts/search-musinsa.ts \"토리든\" 10 --json");
    process.exit(1);
  }

  try {
    const result = await searchMusinsa(keyword, limit);

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


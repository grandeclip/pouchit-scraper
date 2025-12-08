#!/usr/bin/env npx tsx
/**
 * OliveYoung 검색 스크립트 (Playwright + Stealth + Mobile)
 *
 * 사용법:
 *   npx tsx scripts/search-oliveyoung.ts "수분크림" 10
 *   npx tsx scripts/search-oliveyoung.ts "수분크림" 10 --json
 */

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

// Stealth 플러그인 적용
chromium.use(stealth());

interface OliveYoungGoods {
  goodsNumber: string;
  goodsName: string;
  imagePath: string;
  brandName?: string;
  reviewScore?: number;
  reviewCount?: number;
  salePrice?: number;
  originalPrice?: number;
}

interface ApiResponse {
  data: {
    oliveGoods: {
      totalCount: number;
      data: OliveYoungGoods[];
    };
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

async function searchOliveYoung(
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
  });
  const page = await context.newPage();

  let apiResponse: ApiResponse | null = null;

  // API 응답 인터셉트
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/search/api/v3/common/unified-search/goods") && !url.includes("filters")) {
      try {
        const json = await response.json();
        apiResponse = json;
      } catch {
        // JSON 파싱 실패 무시
      }
    }
  });

  try {
    // 홈으로 먼저 이동 (쿠키/세션 초기화)
    await page.goto("https://m.oliveyoung.co.kr", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // 검색 결과 페이지로 이동
    const searchUrl = `https://m.oliveyoung.co.kr/m/mtn/search/result?query=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // API 응답 대기 (최대 10초)
    for (let i = 0; i < 20 && !apiResponse; i++) {
      await page.waitForTimeout(500);
    }

    await browser.close();

    if (!apiResponse) {
      throw new Error("API 응답을 받지 못했습니다.");
    }

    const oliveGoods = apiResponse.data?.oliveGoods;
    const products = (oliveGoods?.data || [])
      .slice(0, limit)
      .map((item) => ({
        name: item.goodsName,
        url: `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${item.goodsNumber}`,
        thumbnail: item.imagePath.startsWith("http")
          ? item.imagePath
          : `https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/${item.imagePath}`,
      }));

    return {
      keyword,
      total_count: oliveGoods?.totalCount || 0,
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
    console.log("사용법: npx tsx scripts/search-oliveyoung.ts <검색어> [limit] [--json]");
    console.log("예시: npx tsx scripts/search-oliveyoung.ts \"수분크림\" 10");
    console.log("      npx tsx scripts/search-oliveyoung.ts \"수분크림\" 10 --json");
    process.exit(1);
  }

  try {
    const result = await searchOliveYoung(keyword, limit);

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


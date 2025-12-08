#!/usr/bin/env npx tsx
/**
 * Ably (에이블리) 검색 스크립트 (Playwright + Stealth + Mobile)
 *
 * 사용법:
 *   npx tsx scripts/search-ably.ts "토리든" 10
 *   npx tsx scripts/search-ably.ts "토리든" 10 --json
 */

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

// Stealth 플러그인 적용
chromium.use(stealth());

interface AblyGoods {
  sno: number;
  name: string;
  image: string;
  market_name?: string;
  price?: number;
  discount_rate?: number;
}

interface AblyItemWrapper {
  item: AblyGoods;
}

interface AblyComponent {
  type: {
    item_list: string | null;
  };
  entity: {
    item_list: AblyItemWrapper[];
  };
}

interface ApiResponse {
  view_event_logging?: {
    analytics?: {
      SEARCH_RESULTS_GOODS?: number;
    };
  };
  components?: AblyComponent[];
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

async function searchAbly(
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
    if (url.includes("/api/v2/screens/SEARCH_RESULT")) {
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
    await page.goto("https://m.a-bly.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // 검색 페이지로 이동
    await page.goto("https://m.a-bly.com/search", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // 검색창 찾기 및 입력 (placeholder: "하나만 사도 무료배송")
    const searchInput = page.locator('input[placeholder*="무료배송"]');
    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill(keyword);
    await page.keyboard.press("Enter");

    // API 응답 대기 (최대 15초)
    for (let i = 0; i < 30 && !apiResponse; i++) {
      await page.waitForTimeout(500);
    }

    await browser.close();

    if (!apiResponse) {
      throw new Error("API 응답을 받지 못했습니다.");
    }

    // 상품 목록 추출 (THREE_COL_GOODS_LIST 컴포넌트에서)
    let goodsList: AblyGoods[] = [];
    const totalCount = apiResponse.view_event_logging?.analytics?.SEARCH_RESULTS_GOODS || 0;

    const components = apiResponse.components || [];
    for (const component of components) {
      // THREE_COL_GOODS_LIST 타입의 컴포넌트에서 상품 추출
      if (component.type?.item_list === "THREE_COL_GOODS_LIST") {
        const items = component.entity?.item_list || [];
        for (const wrapper of items) {
          if (wrapper.item?.sno) {
            goodsList.push(wrapper.item);
          }
        }
      }
    }

    const products = goodsList
      .slice(0, limit)
      .map((item) => ({
        name: item.name,
        url: `https://m.a-bly.com/goods/${item.sno}`,
        thumbnail: item.image,
      }));

    return {
      keyword,
      total_count: totalCount || goodsList.length,
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
    console.log("사용법: npx tsx scripts/search-ably.ts <검색어> [limit] [--json]");
    console.log("예시: npx tsx scripts/search-ably.ts \"토리든\" 10");
    console.log("      npx tsx scripts/search-ably.ts \"토리든\" 10 --json");
    process.exit(1);
  }

  try {
    const result = await searchAbly(keyword, limit);

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

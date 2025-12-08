#!/usr/bin/env npx tsx
/**
 * Hwahae (화해) 검색 스크립트 (Playwright + Stealth + DOM 파싱)
 *
 * 화해는 SSR(Next.js) 기반이라 API 없음 → DOM에서 직접 추출
 *
 * 사용법:
 *   npx tsx scripts/search-hwahae.ts "토리든" 10
 *   npx tsx scripts/search-hwahae.ts "토리든 세럼" 10 --json
 */

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

// Stealth 플러그인 적용
chromium.use(stealth());

interface HwahaeProduct {
  name: string;
  url: string;
  thumbnail: string;
}

interface SearchResult {
  keyword: string;
  total_count: number;
  products: HwahaeProduct[];
}

async function searchHwahae(
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

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const searchUrl = `https://www.hwahae.co.kr/search?q=${encodedKeyword}`;

    console.log("[Navigate] 검색 페이지로 이동...");
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // 페이지 로드 대기
    await page.waitForTimeout(2000);

    console.log("[Parse] DOM에서 상품 데이터 추출...");

    // 쇼핑상품 총 개수 추출
    const totalCountText = await page
      .locator('h2:has-text("쇼핑상품")')
      .first()
      .textContent()
      .catch(() => "쇼핑상품 0");

    const totalMatch = totalCountText?.match(/쇼핑상품\s*(\d+)/);
    const totalCount = totalMatch ? parseInt(totalMatch[1]) : 0;

    // 쇼핑상품 섹션에서만 상품 추출 (totalCount 개수만큼만)
    const products: HwahaeProduct[] = await page.evaluate(
      (args: { limitNum: number; maxCount: number }) => {
        const items: HwahaeProduct[] = [];
        const actualLimit = Math.min(args.limitNum, args.maxCount);

        // "쇼핑상품" 헤딩을 찾고 그 다음 ul/list에서만 추출
        const headings = document.querySelectorAll("h2");
        let shoppingSection: Element | null = null;

        headings.forEach((h) => {
          if (h.textContent?.includes("쇼핑상품")) {
            // 쇼핑상품 헤딩의 부모나 형제에서 리스트 찾기
            shoppingSection = h.closest("div")?.parentElement || null;
          }
        });

        // 쇼핑상품 섹션 내의 goods 링크만 추출
        const selector = shoppingSection
          ? shoppingSection.querySelectorAll('a[href^="/goods/"]')
          : document.querySelectorAll(
              'section:first-of-type a[href^="/goods/"]'
            );

        selector.forEach((anchor, index) => {
          if (index >= actualLimit) return;

          const href = anchor.getAttribute("href") || "";
          const url = `https://www.hwahae.co.kr${href}`;

          // 이미지 추출
          const img = anchor.querySelector("img");
          let thumbnail = img?.getAttribute("src") || "";

          // srcset에서 추출 시도
          if (!thumbnail && img?.getAttribute("srcset")) {
            const srcset = img.getAttribute("srcset") || "";
            thumbnail = srcset.split(",")[0]?.split(" ")[0] || "";
          }

          // 상품명 추출 및 정리
          let name = anchor.textContent?.trim() || "";
          // 평점/가격 이후 텍스트 제거 (4.6, 4.59 등)
          name = name.replace(/\d\.\d+.*$/, "").trim();
          // only화해 태그 정리
          name = name.replace(/^only화해/, "[only화해] ");

          if (name && url && !items.find((i) => i.url === url)) {
            items.push({ name, url, thumbnail });
          }
        });

        return items;
      },
      { limitNum: limit, maxCount: totalCount }
    );

    await browser.close();

    // totalCount와 limit 중 작은 값으로 제한
    const actualLimit = Math.min(limit, totalCount);
    return {
      keyword,
      total_count: totalCount,
      products: products.slice(0, actualLimit),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const keyword = args[0];
  const limit = parseInt(args[1]) || 5;
  const isJson = args.includes("--json");

  if (!keyword) {
    console.log(
      "사용법: npx tsx scripts/search-hwahae.ts <검색어> [limit] [--json]"
    );
    console.log('예시: npx tsx scripts/search-hwahae.ts "토리든" 10');
    console.log('      npx tsx scripts/search-hwahae.ts "토리든" 10 --json');
    process.exit(1);
  }

  try {
    const result = await searchHwahae(keyword, limit);

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n🔍 검색어: ${result.keyword}`);
      console.log(`📊 총 결과: ${result.total_count}개\n`);
      console.log("=".repeat(60));

      result.products.forEach((product, index) => {
        console.log(`\n[${index + 1}] ${product.name}`);
        console.log(`    📎 URL: ${product.url}`);
        console.log(`    🖼️  Thumbnail: ${product.thumbnail || "N/A"}`);
      });

      console.log("\n" + "=".repeat(60));
    }
  } catch (error) {
    console.error("검색 실패:", error);
    process.exit(1);
  }
}

main();


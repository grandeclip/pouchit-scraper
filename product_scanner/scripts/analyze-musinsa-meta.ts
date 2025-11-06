#!/usr/bin/env tsx

/**
 * 무신사 제품별 메타 태그 분석 스크립트
 * Open Graph + JSON-LD 데이터 수집하여 판매 상태 판별 로직 설계
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

const TEST_CASES = [
  // 정상 판매 상품
  { name: "정상 판매 1", goodsNo: "4350236", expected: "SELNG" },
  { name: "정상 판매 2", goodsNo: "3025352", expected: "SELNG" },
  { name: "정상 판매 3", goodsNo: "3491425", expected: "SELNG" },
  { name: "정상 판매 4", goodsNo: "1430803", expected: "SELNG" },

  // 품절 상품
  { name: "품절 상품 1", goodsNo: "2172345", expected: "SLDOT" },
  { name: "품절 상품 2", goodsNo: "4359070", expected: "SLDOT" },

  // 삭제된 상품
  { name: "삭제된 상품", goodsNo: "3441745", expected: "STSEL" },
];

interface MetaData {
  url: string;
  pageTitle: string;
  ogTitle: string | null;
  ogPrice: string | null;
  ogAvailability: string | null;
  jsonLd: any | null;
  statusCode: number | null;
}

async function extractMetaData(goodsNo: string): Promise<MetaData> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();
    const url = `https://www.musinsa.com/products/${goodsNo}`;

    let statusCode: number | null = null;
    page.on("response", (response) => {
      if (response.url() === url) {
        statusCode = response.status();
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const metaData = await page.evaluate(() => {
      // Open Graph 메타 태그
      const ogTitle = document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content");
      const ogPrice = document
        .querySelector('meta[property="product:price:amount"]')
        ?.getAttribute("content");
      const ogAvailability = document
        .querySelector('meta[property="product:availability"]')
        ?.getAttribute("content");

      // JSON-LD 구조화 데이터
      const jsonLdScript = document.querySelector(
        'script[type="application/ld+json"]',
      );
      let jsonLd = null;
      if (jsonLdScript?.textContent) {
        try {
          jsonLd = JSON.parse(jsonLdScript.textContent);
        } catch (e) {
          // parse error
        }
      }

      return {
        pageTitle: document.title,
        ogTitle,
        ogPrice,
        ogAvailability,
        jsonLd,
      };
    });

    await browser.close();

    return {
      url,
      statusCode,
      ...metaData,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function analyzeMusinsaMeta() {
  console.log("🔍 무신사 메타 태그 분석 시작\n");

  const results: Array<{
    testCase: (typeof TEST_CASES)[0];
    metaData: MetaData | null;
    error: string | null;
  }> = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📦 ${testCase.name} (goodsNo: ${testCase.goodsNo})`);
    console.log(`   기대 상태: ${testCase.expected}`);
    console.log(`${"=".repeat(70)}\n`);

    try {
      const metaData = await extractMetaData(testCase.goodsNo);

      console.log("📊 수집된 메타 데이터:");
      console.log(`  HTTP Status: ${metaData.statusCode}`);
      console.log(`  Page Title: ${metaData.pageTitle}`);
      console.log(`  OG Title: ${metaData.ogTitle || "(없음)"}`);
      console.log(`  OG Price: ${metaData.ogPrice || "(없음)"}`);
      console.log(`  OG Availability: ${metaData.ogAvailability || "(없음)"}`);

      if (metaData.jsonLd) {
        console.log(`\n  JSON-LD:`);
        console.log(`    - name: ${metaData.jsonLd.name || "(없음)"}`);
        console.log(`    - brand: ${metaData.jsonLd.brand?.name || "(없음)"}`);
        console.log(
          `    - price: ${metaData.jsonLd.offers?.price || "(없음)"}`,
        );
        console.log(
          `    - availability: ${metaData.jsonLd.offers?.availability || "(없음)"}`,
        );
        if (metaData.jsonLd.aggregateRating) {
          console.log(
            `    - rating: ${metaData.jsonLd.aggregateRating.ratingValue}`,
          );
          console.log(
            `    - reviews: ${metaData.jsonLd.aggregateRating.reviewCount}`,
          );
        }
      } else {
        console.log(`\n  JSON-LD: (없음)`);
      }

      results.push({ testCase, metaData, error: null });
      console.log("\n✅ 수집 완료");
    } catch (error: any) {
      console.error(`\n❌ 수집 실패: ${error.message}`);
      results.push({ testCase, metaData: null, error: error.message });
    }

    // Rate limiting 방지
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // 패턴 분석
  console.log(`\n\n${"=".repeat(70)}`);
  console.log("📊 패턴 분석 결과");
  console.log(`${"=".repeat(70)}\n`);

  const patterns = {
    SELNG: [] as MetaData[],
    SLDOT: [] as MetaData[],
    STSEL: [] as MetaData[],
  };

  for (const result of results) {
    if (result.metaData && result.testCase.expected) {
      patterns[result.testCase.expected as keyof typeof patterns].push(
        result.metaData,
      );
    }
  }

  console.log("🟢 정상 판매 (SELNG) 패턴:");
  if (patterns.SELNG.length > 0) {
    const sample = patterns.SELNG[0];
    console.log(`  - OG Availability: "${sample.ogAvailability}"`);
    console.log(
      `  - JSON-LD Availability: "${sample.jsonLd?.offers?.availability}"`,
    );
    console.log(
      `  - JSON-LD Price 존재: ${sample.jsonLd?.offers?.price ? "✅" : "❌"}`,
    );
  }

  console.log("\n🟡 품절 (SLDOT) 패턴:");
  if (patterns.SLDOT.length > 0) {
    const sample = patterns.SLDOT[0];
    console.log(`  - OG Availability: "${sample.ogAvailability}"`);
    console.log(
      `  - JSON-LD Availability: "${sample.jsonLd?.offers?.availability}"`,
    );
    console.log(
      `  - JSON-LD Price 존재: ${sample.jsonLd?.offers?.price ? "✅" : "❌"}`,
    );
  }

  console.log("\n🔴 판매 중지 (STSEL) 패턴:");
  if (patterns.STSEL.length > 0) {
    const sample = patterns.STSEL[0];
    console.log(`  - OG Availability: "${sample.ogAvailability}"`);
    console.log(
      `  - JSON-LD Availability: "${sample.jsonLd?.offers?.availability}"`,
    );
    console.log(`  - JSON-LD 존재: ${sample.jsonLd ? "✅" : "❌"}`);
  }

  console.log("\n\n💡 판별 로직 제안:");
  console.log("  1. JSON-LD 우선 사용 (더 구조화됨)");
  console.log("  2. availability 필드로 판매 상태 판별:");
  console.log('     - "https://schema.org/InStock" → SELNG (정상)');
  console.log('     - "https://schema.org/OutOfStock" → SLDOT (품절)');
  console.log("     - JSON-LD 없음 → STSEL (판매중지)");
  console.log("  3. Fallback: OG 메타 태그 사용");
}

analyzeMusinsaMeta().catch(console.error);

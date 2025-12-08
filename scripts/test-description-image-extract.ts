#!/usr/bin/env tsx
/**
 * 상품 설명 이미지 URL 추출 테스트
 *
 * Option A: Description API 방식
 * 1. OliveYoung 검색 → 첫 번째 상품 선택
 * 2. Description API 호출 (Playwright fetch intercept)
 * 3. HTML 파싱 → 이미지 URL 추출
 *
 * Usage:
 *   npx tsx scripts/test-description-image-extract.ts "브랜드" "상품명" [maxImages]
 *   npx tsx scripts/test-description-image-extract.ts "아렌시아" "떡솝" 5
 */

import { chromium, Browser, BrowserContext, Page } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { BROWSER_ARGS } from "@/config/BrowserArgs";

// Stealth 플러그인 적용
chromium.use(StealthPlugin());

// ============================================
// 설정
// ============================================

const OLIVEYOUNG_CONFIG = {
  baseUrl: "https://m.oliveyoung.co.kr",
  searchUrl: "https://m.oliveyoung.co.kr/m/mtn/search/result",
  descriptionApiPattern: "/goods/api/v1/description",
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
};

// 지원 이미지 확장자
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png"];

// ============================================
// 타입 정의
// ============================================

interface SearchResult {
  productId: string;
  productName: string;
  brand?: string;
  thumbnail?: string;
  productUrl: string;
}

interface DescriptionApiResponse {
  status: string;
  code: number;
  message: string;
  data?: {
    description?: string;
  };
}

interface ExtractedImages {
  urls: string[];
  totalFound: number;
  filtered: number;
  skipped: {
    url: string;
    reason: string;
  }[];
}

// ============================================
// OliveYoung 검색 (기존 Searcher 로직 간소화)
// ============================================

async function searchOliveYoung(
  page: Page,
  keyword: string,
): Promise<SearchResult | null> {
  console.log(`\n🔍 검색 중: "${keyword}"`);

  // API 응답 인터셉트 준비
  let searchResponse: unknown = null;
  const interceptPattern = "/search/api/v3/common/unified-search/goods";

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes(interceptPattern) && !url.includes("filters")) {
      try {
        searchResponse = await response.json();
      } catch {
        // ignore
      }
    }
  });

  // 1. 홈 먼저 방문 (세션/쿠키 초기화)
  await page.goto(OLIVEYOUNG_CONFIG.baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await sleep(1000);

  // 2. 검색 결과 페이지 이동
  const searchUrl = `${OLIVEYOUNG_CONFIG.searchUrl}?query=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await sleep(2000);

  // 3. API 응답 대기
  const maxWait = 10000;
  const interval = 200;
  let waited = 0;
  while (!searchResponse && waited < maxWait) {
    await sleep(interval);
    waited += interval;
  }

  if (!searchResponse) {
    console.error("❌ 검색 API 응답 없음");
    return null;
  }

  // 4. 응답 파싱
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = searchResponse as any;
  const products = data?.data?.oliveGoods?.data || [];

  if (products.length === 0) {
    console.log("⚠️ 검색 결과 없음");
    return null;
  }

  const first = products[0];
  console.log(`✅ 검색 결과: ${products.length}개 (첫 번째 선택)`);

  return {
    productId: first.goodsNumber,
    productName: first.goodsName,
    brand: first.onlineBrandName,
    thumbnail: first.imagePath
      ? `https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/${first.imagePath}`
      : undefined,
    productUrl: `https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=${first.goodsNumber}`,
  };
}

// ============================================
// Description API 호출
// ============================================

async function fetchDescriptionHtml(
  page: Page,
  goodsNumber: string,
): Promise<string | null> {
  console.log(`\n📄 Description API 호출: ${goodsNumber}`);

  // API 응답 인터셉트 준비
  let descriptionResponse: DescriptionApiResponse | null = null;

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes(OLIVEYOUNG_CONFIG.descriptionApiPattern)) {
      try {
        descriptionResponse = (await response.json()) as DescriptionApiResponse;
      } catch {
        // ignore
      }
    }
  });

  // 상품 상세 페이지 이동 (Description API 자동 호출됨)
  const productUrl = `${OLIVEYOUNG_CONFIG.baseUrl}/m/goods/getGoodsDetail.do?goodsNo=${goodsNumber}`;
  await page.goto(productUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // API 응답 대기
  const maxWait = 15000;
  const interval = 200;
  let waited = 0;
  while (!descriptionResponse && waited < maxWait) {
    await sleep(interval);
    waited += interval;
  }

  if (!descriptionResponse) {
    console.error("❌ Description API 응답 없음");
    return null;
  }

  if (descriptionResponse.status !== "SUCCESS") {
    console.error(`❌ Description API 실패: ${descriptionResponse.message}`);
    return null;
  }

  // descriptionContents 필드에서 HTML 추출
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyData = descriptionResponse.data as any;
  const html = anyData?.descriptionContents;
  
  if (!html) {
    console.error("❌ Description HTML 없음");
    return null;
  }

  console.log(`✅ Description HTML 수신: ${html.length} bytes`);
  return html;
}

// ============================================
// HTML에서 이미지 URL 추출 (정규표현식 사용)
// ============================================

function extractImageUrls(html: string, maxImages: number): ExtractedImages {
  const allImages: string[] = [];
  const skipped: { url: string; reason: string }[] = [];

  // img 태그에서 src 속성 추출 (정규표현식)
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !allImages.includes(src)) {
      allImages.push(src);
    }
  }

  // data-src 속성도 확인 (lazy loading)
  const dataSrcRegex = /<img[^>]+data-src=["']([^"']+)["'][^>]*>/gi;
  while ((match = dataSrcRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !allImages.includes(src)) {
      allImages.push(src);
    }
  }

  console.log(`\n🖼️ 발견된 이미지: ${allImages.length}개`);

  // 필터링
  const filtered = allImages.filter((url) => {
    const lowerUrl = url.toLowerCase();

    // 1. data:image (placeholder) 제외
    if (url.startsWith("data:image")) {
      skipped.push({ url: url.substring(0, 50) + "...", reason: "data_uri_placeholder" });
      return false;
    }

    // 2. gif, webp, svg 제외
    if (
      lowerUrl.includes(".gif") ||
      lowerUrl.endsWith(".webp") ||
      lowerUrl.includes(".svg")
    ) {
      skipped.push({ url, reason: "unsupported_format" });
      return false;
    }

    // 3. 너무 작은 이미지 (아이콘 등) 제외 - URL 기반 휴리스틱
    if (
      lowerUrl.includes("icon") ||
      lowerUrl.includes("logo") ||
      lowerUrl.includes("badge") ||
      lowerUrl.includes("btn_") ||
      lowerUrl.includes("button")
    ) {
      skipped.push({ url, reason: "icon_or_badge" });
      return false;
    }

    // 4. 외부 트래킹 이미지 제외
    if (
      lowerUrl.includes("facebook") ||
      lowerUrl.includes("google") ||
      lowerUrl.includes("analytics") ||
      lowerUrl.includes("pixel")
    ) {
      skipped.push({ url, reason: "tracking_pixel" });
      return false;
    }

    // 5. 지원 확장자 확인 (jpg, jpeg, png)
    const hasJpg = lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg");
    const hasPng = lowerUrl.includes(".png");
    
    if (!hasJpg && !hasPng) {
      // 확장자 없지만 올리브영 CDN 또는 상품 이미지 패턴이면 허용
      const isLikelyProductImage =
        url.includes("image.oliveyoung.co.kr") ||
        url.includes("cfimages") ||
        url.includes("speedgabia.com");
      
      if (!isLikelyProductImage) {
        skipped.push({ url, reason: "no_supported_extension" });
        return false;
      }
    }

    return true;
  });

  // maxImages 제한
  const limited = filtered.slice(0, maxImages);

  return {
    urls: limited,
    totalFound: allImages.length,
    filtered: filtered.length,
    skipped,
  };
}

// ============================================
// 유틸리티
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// 메인 실행
// ============================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
사용법: npx tsx scripts/test-description-image-extract.ts "브랜드" "상품명" [maxImages]

예시:
  npx tsx scripts/test-description-image-extract.ts "아렌시아" "떡솝" 5
  npx tsx scripts/test-description-image-extract.ts "에스트라" "아토베리어"
`);
    process.exit(1);
  }

  const brand = args[0];
  const productName = args[1];
  const maxImages = parseInt(args[2] || "10", 10);
  const keyword = `${brand} ${productName}`;

  console.log("=" .repeat(60));
  console.log("🧪 상품 설명 이미지 URL 추출 테스트");
  console.log("=" .repeat(60));
  console.log(`브랜드: ${brand}`);
  console.log(`상품명: ${productName}`);
  console.log(`검색어: ${keyword}`);
  console.log(`최대 이미지: ${maxImages}`);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // 1. 브라우저 시작
    console.log("\n🚀 브라우저 시작...");
    browser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS.DEFAULT,
    });

    context = await browser.newContext({
      viewport: OLIVEYOUNG_CONFIG.viewport,
      isMobile: OLIVEYOUNG_CONFIG.isMobile,
      hasTouch: OLIVEYOUNG_CONFIG.hasTouch,
      deviceScaleFactor: OLIVEYOUNG_CONFIG.deviceScaleFactor,
      userAgent: OLIVEYOUNG_CONFIG.userAgent,
    });

    page = await context.newPage();

    // 2. 검색
    const searchResult = await searchOliveYoung(page, keyword);
    if (!searchResult) {
      console.log("\n❌ 검색 결과 없음 - 종료");
      process.exit(0);
    }

    console.log("\n📦 선택된 상품:");
    console.log(`  - ID: ${searchResult.productId}`);
    console.log(`  - 이름: ${searchResult.productName}`);
    console.log(`  - 브랜드: ${searchResult.brand || "N/A"}`);
    console.log(`  - URL: ${searchResult.productUrl}`);

    // 3. Description API 호출
    // 새 페이지로 상품 상세 접근
    const productPage = await context.newPage();
    const html = await fetchDescriptionHtml(productPage, searchResult.productId);
    await productPage.close();

    if (!html) {
      console.log("\n❌ Description HTML 없음 - 종료");
      process.exit(1);
    }

    // 4. 이미지 URL 추출
    const images = extractImageUrls(html, maxImages);

    console.log("\n" + "=" .repeat(60));
    console.log("📊 결과 요약");
    console.log("=" .repeat(60));
    console.log(`총 발견: ${images.totalFound}개`);
    console.log(`필터 통과: ${images.filtered}개`);
    console.log(`최종 선택: ${images.urls.length}개 (max: ${maxImages})`);
    console.log(`스킵됨: ${images.skipped.length}개`);

    console.log("\n✅ 추출된 이미지 URL:");
    images.urls.forEach((url, i) => {
      console.log(`  [${i + 1}] ${url.substring(0, 100)}${url.length > 100 ? "..." : ""}`);
    });

    if (images.skipped.length > 0) {
      console.log("\n⏭️ 스킵된 이미지 (처음 5개):");
      images.skipped.slice(0, 5).forEach((item) => {
        console.log(`  - [${item.reason}] ${item.url.substring(0, 60)}...`);
      });
    }

    // 5. JSON 출력
    console.log("\n📄 JSON 결과:");
    console.log(
      JSON.stringify(
        {
          product: searchResult,
          images: {
            urls: images.urls,
            totalFound: images.totalFound,
            filtered: images.filtered,
          },
        },
        null,
        2,
      ),
    );

    console.log("\n✅ 테스트 완료!");
  } catch (error) {
    console.error("\n❌ 에러 발생:", error);
    process.exit(1);
  } finally {
    // 정리
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

main();


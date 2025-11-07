/**
 * ZigZag Playwright 테스트 스크립트
 *
 * 목적: __NEXT_DATA__ 추출을 통한 정확한 판매 상태 확인
 * - 정상 상품
 * - 존재하지 않는 상품
 * - 판매중단 상품
 * - 품절 상품
 */

import { chromium, Browser, Page } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Stealth 플러그인 적용
chromium.use(StealthPlugin());

const BASE_URL = "https://zigzag.kr/catalog/products/";

// 모바일 User Agent (iPhone)
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

interface TestCase {
  id: string;
  description: string;
  expectedStatus?: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: "157001205",
    description: "정상 상품 1 (에뛰드 마스카라)",
    expectedStatus: "ON_SALE",
  },
  { id: "111018539", description: "정상 상품 2", expectedStatus: "ON_SALE" },
  {
    id: "1570012055",
    description: "존재하지 않는 상품 (ID 오류)",
    expectedStatus: "ERROR",
  },
  { id: "110848364", description: "판매중단 1", expectedStatus: "SUSPENDED" },
  { id: "164410989", description: "판매중단 2", expectedStatus: "SUSPENDED" },
  { id: "162525042", description: "품절", expectedStatus: "SOLD_OUT" },
];

/**
 * __NEXT_DATA__ 추출 함수
 */
async function extractNextData(page: Page) {
  return await page.evaluate(() => {
    const script = document.getElementById("__NEXT_DATA__");
    if (!script || !script.textContent) {
      return { error: "__NEXT_DATA__ not found" };
    }

    try {
      const data = JSON.parse(script.textContent);
      const product = data.props?.pageProps?.product;
      const shop = data.props?.pageProps?.shop;

      if (!product) {
        return { error: "product data not found in __NEXT_DATA__" };
      }

      // 핵심 필드 추출
      return {
        // 기본 정보
        id: product.id,
        name: product.name,
        brand: shop?.name || null,

        // 가격 정보
        originalPrice: product.product_price?.max_price_info?.price || null,
        discountedPrice:
          product.product_price?.final_discount_info?.discount_price || null,

        // ⭐ 판매 상태 (핵심)
        isPurchasable: product.is_purchasable,
        salesStatus: product.sales_status,
        displayStatus: product.display_status,

        // 쿠폰
        couponStatus: product.coupon_available_status || null,

        // 이미지
        thumbnailUrl:
          product.product_image_list?.find(
            (img: any) => img.image_type === "MAIN",
          )?.pdp_thumbnail_url || null,
      };
    } catch (error: any) {
      return { error: `JSON parse error: ${error.message}` };
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPrice(price: number | null): string {
  if (price === null) return "N/A";
  return price.toLocaleString("ko-KR");
}

function calculateDiscountRate(
  original: number | null,
  discounted: number | null,
): number {
  if (!original || !discounted) return 0;
  return Math.round(((original - discounted) / original) * 100);
}

async function testProduct(page: Page, testCase: TestCase): Promise<void> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`테스트: ${testCase.description}`);
  console.log(`상품 ID: ${testCase.id}`);
  console.log(`예상 상태: ${testCase.expectedStatus || "UNKNOWN"}`);
  console.log("=".repeat(80));

  const url = `${BASE_URL}${testCase.id}`;

  try {
    // 페이지 이동
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (!response) {
      console.log("❌ 페이지 응답 없음");
      return;
    }

    console.log(`✅ 페이지 로드 완료 (HTTP ${response.status()})`);

    // __NEXT_DATA__ 추출
    const result = await extractNextData(page);

    // 에러 확인
    if ("error" in result) {
      console.log(`❌ 데이터 추출 실패: ${result.error}`);
      return;
    }

    // 기본 정보
    console.log("\n✅ 상품 정보 추출 성공");
    console.log(`  ID: ${result.id}`);
    console.log(`  이름: ${result.name}`);
    console.log(`  브랜드: ${result.brand || "N/A"}`);

    // 가격 정보
    if (result.originalPrice && result.discountedPrice) {
      const discountRate = calculateDiscountRate(
        result.originalPrice,
        result.discountedPrice,
      );
      console.log(`\n💰 가격 정보:`);
      console.log(`  정가: ${formatPrice(result.originalPrice)}원`);
      console.log(`  할인가: ${formatPrice(result.discountedPrice)}원`);
      console.log(`  할인율: ${discountRate}%`);
    }

    // 판매 상태 (핵심 필드)
    console.log(`\n📦 판매 상태 (__NEXT_DATA__):`);
    console.log(`  is_purchasable: ${result.isPurchasable}`);
    console.log(`  sales_status: ${result.salesStatus}`);
    console.log(`  display_status: ${result.displayStatus}`);

    // 예상 상태와 비교
    if (testCase.expectedStatus) {
      if (result.salesStatus !== testCase.expectedStatus) {
        console.log(
          `  ⚠️  예상과 다름! (예상: ${testCase.expectedStatus}, 실제: ${result.salesStatus})`,
        );
      } else {
        console.log(`  ✅ 예상 상태 일치`);
      }
    }

    // 상태별 한글 설명
    const statusMap: Record<string, string> = {
      ON_SALE: "판매중",
      SOLD_OUT: "품절",
      SUSPENDED: "판매중단",
    };
    const statusKo = statusMap[result.salesStatus] || "알 수 없음";
    console.log(`  상태: ${statusKo}`);

    // 구매 가능 여부
    const purchaseText = result.isPurchasable ? "구매 가능" : "구매 불가";
    console.log(`  구매 가능: ${purchaseText}`);

    // 썸네일 이미지
    if (result.thumbnailUrl) {
      console.log(`\n🖼️  썸네일:`);
      console.log(`  ${result.thumbnailUrl.substring(0, 70)}...`);
    }
  } catch (error: any) {
    console.log(`❌ 요청 실패: ${error.message}`);
    if (error.stack) {
      console.log(`   스택: ${error.stack.split("\n")[1]?.trim()}`);
    }
  }
}

async function main() {
  console.log("ZigZag Playwright 테스트 시작\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User Agent: Mobile (iPhone)`);
  console.log(`총 테스트 케이스: ${TEST_CASES.length}개`);
  console.log(`딜레이: 2초\n`);

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // 브라우저 시작 (headless mode)
    console.log("🚀 브라우저 시작 중...");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    // 모바일 컨텍스트 생성
    const context = await browser.newContext({
      userAgent: MOBILE_USER_AGENT,
      viewport: { width: 375, height: 812 }, // iPhone 13 Pro
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      extraHTTPHeaders: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        Origin: "https://zigzag.kr",
        Referer: "https://zigzag.kr/",
      },
    });

    page = await context.newPage();
    console.log("✅ 모바일 브라우저 컨텍스트 생성 완료\n");

    // 각 테스트 케이스 실행
    for (let i = 0; i < TEST_CASES.length; i++) {
      const testCase = TEST_CASES[i];

      await testProduct(page, testCase);

      // 마지막 케이스가 아니면 2초 대기
      if (i < TEST_CASES.length - 1) {
        console.log("\n⏳ 2초 대기 중...");
        await sleep(2000);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ 모든 테스트 완료");
    console.log("=".repeat(80));
  } catch (error: any) {
    console.error("❌ 테스트 실행 중 오류 발생:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // 정리
    if (page) await page.close();
    if (browser) await browser.close();
    console.log("\n🔒 브라우저 종료 완료");
  }
}

// 실행
main().catch((error) => {
  console.error("스크립트 실행 실패:", error);
  process.exit(1);
});

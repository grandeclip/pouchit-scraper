/**
 * ZigZag GraphQL API 테스트 스크립트
 *
 * 목적: GetCatalogProductDetailPageOption API 동작 확인
 * - 정상 상품
 * - 존재하지 않는 상품
 * - 판매중단 상품
 * - 품절 상품
 */

const GRAPHQL_ENDPOINT =
  "https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption";

// 최소 필드 GraphQL 쿼리 (핵심 데이터 + thumbnail)
const PRODUCT_QUERY = `
  query GetCatalogProductDetailPageOption($catalog_product_id: ID!, $input: PdpBaseInfoInput) {
    pdp_option_info(catalog_product_id: $catalog_product_id, input: $input) {
      catalog_product {
        id
        name
        shop_name
        product_price {
          max_price_info { price }
          final_discount_info { discount_price }
        }
        matched_item_list {
          sales_status
          display_status
        }
        product_image_list {
          image_type
          pdp_thumbnail_url
        }
      }
    }
  }
`;

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

async function fetchProductInfo(productId: string) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://zigzag.kr",
      Referer: "https://zigzag.kr/",
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    },
    body: JSON.stringify({
      query: PRODUCT_QUERY,
      variables: {
        catalog_product_id: productId,
        input: {
          catalog_product_id: productId,
          entry_source_type: "",
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR");
}

function calculateDiscountRate(original: number, discounted: number): number {
  return Math.round(((original - discounted) / original) * 100);
}

async function testProduct(testCase: TestCase) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`테스트: ${testCase.description}`);
  console.log(`상품 ID: ${testCase.id}`);
  console.log(`예상 상태: ${testCase.expectedStatus || "UNKNOWN"}`);
  console.log("=".repeat(80));

  try {
    const result = await fetchProductInfo(testCase.id);

    // GraphQL 에러 확인
    if (result.errors) {
      console.log("❌ GraphQL 에러 발생:");
      result.errors.forEach((err: any, idx: number) => {
        console.log(`  [${idx + 1}] ${err.message}`);
        if (err.extensions) {
          console.log(
            `      Extensions:`,
            JSON.stringify(err.extensions, null, 2),
          );
        }
      });
      return;
    }

    // 데이터 존재 확인
    if (!result.data || !result.data.pdp_option_info) {
      console.log("⚠️  데이터 없음 (상품 존재하지 않음)");
      console.log("Response:", JSON.stringify(result, null, 2));
      return;
    }

    const product = result.data.pdp_option_info.catalog_product;

    // 상품이 null인 경우
    if (!product) {
      console.log("⚠️  상품 정보 없음 (catalog_product = null)");
      return;
    }

    // 기본 정보
    console.log("\n✅ 상품 정보 조회 성공");
    console.log(`  ID: ${product.id}`);
    console.log(`  이름: ${product.name}`);
    console.log(`  브랜드: ${product.shop_name}`);

    // 가격 정보
    if (product.product_price) {
      const price = product.product_price;
      const original = price.max_price_info?.price;
      const discounted = price.final_discount_info?.discount_price;

      if (original && discounted) {
        const discountRate = calculateDiscountRate(original, discounted);
        console.log(`\n💰 가격 정보:`);
        console.log(`  정가: ${formatPrice(original)}원`);
        console.log(`  할인가: ${formatPrice(discounted)}원`);
        console.log(`  할인율: ${discountRate}%`);
      }
    }

    // 판매 상태 (핵심 필드)
    if (product.matched_item_list && product.matched_item_list.length > 0) {
      const item = product.matched_item_list[0];
      console.log(`\n📦 판매 상태:`);
      console.log(`  sales_status: ${item.sales_status}`);
      console.log(`  display_status: ${item.display_status}`);

      // 예상 상태와 비교
      if (
        testCase.expectedStatus &&
        item.sales_status !== testCase.expectedStatus
      ) {
        console.log(
          `  ⚠️  예상과 다름! (예상: ${testCase.expectedStatus}, 실제: ${item.sales_status})`,
        );
      } else if (testCase.expectedStatus) {
        console.log(`  ✅ 예상 상태 일치`);
      }

      // 상태별 한글 설명
      const statusMap: Record<string, string> = {
        ON_SALE: "판매중",
        SOLD_OUT: "품절",
        SUSPENDED: "판매중단",
      };
      const statusKo = statusMap[item.sales_status] || "알 수 없음";
      console.log(`  상태: ${statusKo}`);
    }

    // 썸네일 이미지
    if (product.product_image_list && product.product_image_list.length > 0) {
      const mainImage = product.product_image_list.find(
        (img: any) => img.image_type === "MAIN",
      );
      if (mainImage?.pdp_thumbnail_url) {
        console.log(`\n🖼️  썸네일:`);
        console.log(`  ${mainImage.pdp_thumbnail_url.substring(0, 70)}...`);
      }
    }
  } catch (error: any) {
    console.log("❌ 요청 실패:", error.message);
    if (error.cause) {
      console.log("   원인:", error.cause);
    }
  }
}

async function main() {
  console.log("ZigZag GraphQL API 테스트 시작\n");
  console.log(`엔드포인트: ${GRAPHQL_ENDPOINT}`);
  console.log(`총 테스트 케이스: ${TEST_CASES.length}개`);
  console.log(`딜레이: 2초\n`);

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];

    await testProduct(testCase);

    // 마지막 케이스가 아니면 2초 대기
    if (i < TEST_CASES.length - 1) {
      console.log("\n⏳ 2초 대기 중...");
      await sleep(2000);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ 모든 테스트 완료");
  console.log("=".repeat(80));
}

// 실행
main().catch((error) => {
  console.error("스크립트 실행 실패:", error);
  process.exit(1);
});

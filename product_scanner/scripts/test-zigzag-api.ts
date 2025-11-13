/**
 * Zigzag 필요 데이터 추출 테스트
 *
 * 추출 필드:
 * - product_name: catalog_product.name
 * - thumbnail: catalog_product.product_image_list (MAIN)
 * - sale_status: catalog_product.matched_item_list[0].sales_status
 * - original_price: catalog_product.product_price.max_price_info.price
 * - discounted_price: 첫구매 제외 가격
 */

const GRAPHQL_ENDPOINT =
  "https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption";

// 필요 필드만 추출하는 최적화된 쿼리
const EXTRACTION_QUERY = `
  query GetCatalogProductDetailPageOption($catalog_product_id: ID!, $input: PdpBaseInfoInput) {
    pdp_option_info(catalog_product_id: $catalog_product_id, input: $input) {
      catalog_product {
        id
        name
        shop_name

        product_image_list {
          image_type
          pdp_thumbnail_url
        }

        matched_item_list {
          sales_status
          display_status
        }

        product_price {
          max_price_info {
            price
          }
          final_discount_info {
            discount_price
          }
          product_promotion_discount_info {
            discount_amount
          }
          display_final_price {
            final_price {
              price
              badge {
                text
              }
            }
            final_price_additional {
              price
              badge {
                text
              }
            }
          }
        }
      }
    }
  }
`;

interface ExtractedData {
  product_id: string;
  product_name: string;
  shop_name: string;
  thumbnail: string;
  sale_status: string;
  original_price: number;
  discounted_price: number;
  is_first_purchase: boolean;
  badge?: string;
}

interface TestCase {
  id: string;
  description: string;
  expectedBadge?: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: "117931583",
    description: "케이스 1: 일반 쿠폰 (판매중)",
    expectedBadge: "쿠폰할인가",
  },
  {
    id: "116580170",
    description: "케이스 2: 일반 할인 (품절)",
    expectedBadge: null,
  },
  {
    id: "155514630",
    description: "케이스 3: 직잭픽",
    expectedBadge: "직잭픽",
  },
  {
    id: "135275589",
    description: "케이스 4: 첫구매 쿠폰",
    expectedBadge: "첫구매쿠폰",
  },
];

async function fetchProductData(productId: string) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://zigzag.kr",
      Referer: "https://zigzag.kr/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      query: EXTRACTION_QUERY,
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

function extractData(result: any): ExtractedData {
  const product = result.data?.pdp_option_info?.catalog_product;

  if (!product) {
    throw new Error("상품 데이터 없음");
  }

  // 썸네일 추출 (MAIN 이미지)
  const mainImage = product.product_image_list?.find(
    (img: any) => img.image_type === "MAIN",
  );
  const thumbnail = mainImage?.pdp_thumbnail_url || "";

  // 판매 상태 (첫 번째 아이템 기준)
  const saleStatus = product.matched_item_list?.[0]?.sales_status || "UNKNOWN";

  // 가격 정보
  const priceData = product.product_price;
  const originalPrice = priceData.max_price_info?.price || 0;

  // 첫구매 제외 가격 계산
  const displayPrice = priceData.display_final_price;
  const badge = displayPrice.final_price_additional?.badge?.text;
  const isFirstPurchase = badge?.includes("첫구매") ?? false;

  // 첫구매 쿠폰인 경우: final_price가 첫구매 제외 가격
  // 그 외의 경우: final_discount_info.discount_price 사용
  let discountedPrice: number;

  if (isFirstPurchase) {
    // 첫구매 제외 가격 = display_final_price.final_price.price
    discountedPrice = displayPrice.final_price.price;
  } else {
    // 일반 할인가
    discountedPrice = priceData.final_discount_info?.discount_price || 0;
  }

  return {
    product_id: product.id,
    product_name: product.name,
    shop_name: product.shop_name,
    thumbnail,
    sale_status: saleStatus,
    original_price: originalPrice,
    discounted_price: discountedPrice,
    is_first_purchase: isFirstPurchase,
    badge: badge || displayPrice.final_price.badge?.text || undefined,
  };
}

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR");
}

function calculateDiscountRate(original: number, discounted: number): number {
  if (original === 0) return 0;
  return Math.round(((original - discounted) / original) * 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testExtraction(testCase: TestCase) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`${testCase.description}`);
  console.log(`상품 ID: ${testCase.id}`);
  console.log("=".repeat(80));

  try {
    const result = await fetchProductData(testCase.id);

    if (result.errors) {
      console.log("❌ GraphQL 에러:");
      result.errors.forEach((err: any) => console.log(`  - ${err.message}`));
      return;
    }

    const extracted = extractData(result);

    console.log("\n✅ 데이터 추출 성공\n");

    console.log(`📦 기본 정보:`);
    console.log(`  Product ID: ${extracted.product_id}`);
    console.log(`  Product Name: ${extracted.product_name}`);
    console.log(`  Shop: ${extracted.shop_name}`);

    console.log(`\n🖼️  Thumbnail:`);
    console.log(`  ${extracted.thumbnail.substring(0, 80)}...`);

    console.log(`\n💰 가격 정보:`);
    console.log(
      `  정가 (original_price): ${formatPrice(extracted.original_price)}원`,
    );
    console.log(
      `  할인가 (discounted_price): ${formatPrice(extracted.discounted_price)}원`,
    );
    const discountRate = calculateDiscountRate(
      extracted.original_price,
      extracted.discounted_price,
    );
    console.log(`  할인율: ${discountRate}%`);

    console.log(`\n📊 판매 상태:`);
    console.log(`  sale_status: ${extracted.sale_status}`);

    if (extracted.badge) {
      console.log(`\n🏷️  배지:`);
      console.log(`  ${extracted.badge}`);

      if (extracted.is_first_purchase) {
        console.log(`  ⚠️  첫구매 쿠폰 상품`);
        console.log(`  → discounted_price는 첫구매 제외 가격입니다`);
      }
    }

    // 예상 배지 검증
    if (testCase.expectedBadge !== undefined) {
      const actualBadge = extracted.badge || null;
      if (actualBadge === testCase.expectedBadge) {
        console.log(`\n  ✅ 배지 일치: ${actualBadge || "(없음)"}`);
      } else {
        console.log(
          `\n  ⚠️  배지 불일치: 예상(${testCase.expectedBadge}) vs 실제(${actualBadge})`,
        );
      }
    }
  } catch (error: any) {
    console.log("❌ 추출 실패:", error.message);
  }
}

async function main() {
  console.log("Zigzag 데이터 추출 테스트\n");
  console.log(`총 테스트: ${TEST_CASES.length}개`);
  console.log(`딜레이: 2초\n`);

  for (let i = 0; i < TEST_CASES.length; i++) {
    await testExtraction(TEST_CASES[i]);

    if (i < TEST_CASES.length - 1) {
      console.log("\n⏳ 2초 대기...");
      await sleep(2000);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ 모든 테스트 완료");
  console.log("=".repeat(80));
}

main().catch((error) => {
  console.error("실행 실패:", error);
  process.exit(1);
});

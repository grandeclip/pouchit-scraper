/**
 * ZigZag API 전체 응답 확인 스크립트
 *
 * 목적: GetCatalogProductDetailPageOption의 전체 응답 구조 확인
 */

const GRAPHQL_ENDPOINT =
  "https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption";

// 전체 필드 포함 쿼리 (유효한 필드만)
const FULL_QUERY = `
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
          remain_stock
        }
      }
    }
  }
`;

async function checkFullResponse(productId: string) {
  console.log(`\n검사 중: 상품 ID ${productId}`);
  console.log("=".repeat(80));

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
      query: FULL_QUERY,
      variables: {
        catalog_product_id: productId,
        input: {
          catalog_product_id: productId,
          entry_source_type: "",
        },
      },
    }),
  });

  const result = await response.json();

  console.log("\n전체 응답:");
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  // 판매중단으로 예상되는 상품
  await checkFullResponse("110848364");
}

main().catch((error) => {
  console.error("스크립트 실행 실패:", error);
  process.exit(1);
});

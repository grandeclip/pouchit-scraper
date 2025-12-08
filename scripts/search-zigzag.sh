#!/bin/bash
# Zigzag 검색 API 스크립트
# 사용법: ./search-zigzag.sh "검색어" [limit] [--json]
# 예시: 
#   ./search-zigzag.sh "토리든" 10
#   ./search-zigzag.sh "토리든" 10 --json

set -e

KEYWORD="${1:-}"
LIMIT="${2:-20}"
JSON_OUTPUT=false

# --json 옵션 체크
for arg in "$@"; do
  if [ "$arg" = "--json" ]; then
    JSON_OUTPUT=true
  fi
done

if [ -z "$KEYWORD" ]; then
  echo "사용법: $0 <검색어> [limit] [--json]"
  echo "예시: $0 \"토리든\" 10"
  echo "      $0 \"토리든\" 10 --json"
  exit 1
fi

# jq가 설치되어 있는지 확인
if ! command -v jq &> /dev/null; then
  echo "Error: jq가 필요합니다. 'brew install jq' 로 설치하세요."
  exit 1
fi

# GraphQL Query
GRAPHQL_QUERY='
  query GetSearchResult($input: SearchResultInput!) {
    search_result(input: $input) {
      total_count
      has_next
      end_cursor
      searched_keyword
      ui_item_list {
        __typename
        ... on UxGoodsCardItem {
          catalog_product_id
          title
          product_url
          webp_image_url
        }
      }
    }
  }
'

# GraphQL Variables
GRAPHQL_VARIABLES='{
  "input": {
    "q": "'"${KEYWORD}"'",
    "page_id": "srp_item",
    "filter_id_list": ["205"],
    "initial": true,
    "after": null,
    "enable_guided_keyword_search": true
  }
}'

# API 호출
RESPONSE=$(curl -s -k -X POST "https://api.zigzag.kr/api/2/graphql/GetSearchResult" \
  -H "Content-Type: application/json" \
  -H "Origin: https://zigzag.kr" \
  -H "Referer: https://zigzag.kr/" \
  --data-raw "$(jq -n \
    --arg operationName "GetSearchResult" \
    --argjson variables "${GRAPHQL_VARIABLES}" \
    --arg query "${GRAPHQL_QUERY}" \
    '{operationName: $operationName, variables: $variables, query: $query}')")

# 에러 체크
if echo "$RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
  echo "API 에러:"
  echo "$RESPONSE" | jq '.errors'
  exit 1
fi

# 결과 파싱
TOTAL_COUNT=$(echo "$RESPONSE" | jq -r '.data.search_result.total_count // 0')
SEARCHED_KEYWORD=$(echo "$RESPONSE" | jq -r '.data.search_result.searched_keyword // "N/A"')

# 상품 목록 추출 (UxGoodsCardItem만)
PRODUCTS=$(echo "$RESPONSE" | jq "[.data.search_result.ui_item_list[] | select(.__typename == \"UxGoodsCardItem\") | {
  name: .title,
  url: (\"https://zigzag.kr\" + .product_url),
  thumbnail: .webp_image_url
}] | .[0:${LIMIT}]")

if [ "$JSON_OUTPUT" = true ]; then
  # JSON 형식 출력
  jq -n \
    --arg keyword "$SEARCHED_KEYWORD" \
    --argjson total_count "$TOTAL_COUNT" \
    --argjson products "$PRODUCTS" \
    '{keyword: $keyword, total_count: $total_count, products: $products}'
else
  # 텍스트 형식 출력
  echo ""
  echo "🔍 검색어: $SEARCHED_KEYWORD"
  echo "📊 총 결과: ${TOTAL_COUNT}개"
  echo ""
  echo "============================================================"
  
  echo "$PRODUCTS" | jq -r 'to_entries[] | "\n[\(.key + 1)] \(.value.name)\n    📎 URL: \(.value.url)\n    🖼️  Thumbnail: \(.value.thumbnail)"'
  
  echo ""
  echo "============================================================"
fi


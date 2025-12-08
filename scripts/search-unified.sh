#!/bin/bash
# 6개 플랫폼 통합 검색 API 스크립트
# 사용법: ./search-unified.sh "브랜드" "상품명" [max_per_platform]
# 예시:
#   ./search-unified.sh "라네즈" "워터뱅크 크림"
#   ./search-unified.sh "라네즈" "워터뱅크 크림" 3

set -e

BRAND="${1:-}"
PRODUCT_NAME="${2:-}"
MAX_PER_PLATFORM="${3:-5}"

if [ -z "$BRAND" ]; then
  echo "사용법: $0 <브랜드> [상품명] [max_per_platform]"
  echo ""
  echo "예시:"
  echo "  $0 \"라네즈\" \"워터뱅크 크림\""
  echo "  $0 \"라네즈\" \"워터뱅크 크림\" 3"
  echo "  $0 \"토리든\""
  exit 1
fi

# API 서버 주소 (환경변수 또는 기본값)
API_HOST="${API_HOST:-localhost}"
API_PORT="${API_PORT:-3989}"
API_URL="http://${API_HOST}:${API_PORT}/api/v2/search/unified"

echo ""
echo "🔍 통합 검색: $BRAND $PRODUCT_NAME (max: $MAX_PER_PLATFORM)"
echo "   API: $API_URL"
echo ""

# maxPerPlatform이 숫자인지 확인
if ! [[ "$MAX_PER_PLATFORM" =~ ^[0-9]+$ ]]; then
  MAX_PER_PLATFORM=5
fi

# API 호출 - raw JSON 출력
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{\"brand\":\"$BRAND\",\"productName\":\"$PRODUCT_NAME\",\"maxPerPlatform\":$MAX_PER_PLATFORM}"

echo ""

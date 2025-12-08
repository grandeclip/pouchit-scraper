#!/bin/bash
# URL 기반 상품 추출 워크플로우 테스트
#
# TypedNodeStrategy 기반 extract_url 노드 테스트
# - PlatformScannerRegistry를 통한 플랫폼별 스캔
# - Supabase 조회 없음 (db: null, comparison: null)
#
# 사용법:
#   ./test-extract-url.sh "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000223456"
#   URL="https://..." ./test-extract-url.sh

set -e

API_BASE_URL="http://localhost:3989/api/v2"
URL="${URL:-$1}"

if [ -z "$URL" ]; then
  echo "❌ URL이 필요합니다."
  echo ""
  echo "사용법:"
  echo "  ./test-extract-url.sh \"https://www.oliveyoung.co.kr/...\""
  echo "  URL=\"https://...\" ./test-extract-url.sh"
  echo ""
  echo "지원 플랫폼:"
  echo "  - oliveyoung (Playwright)"
  echo "  - ably (Playwright)"
  echo "  - kurly (Playwright)"
  echo "  - hwahae (HTTP API)"
  echo "  - musinsa (HTTP API)"
  echo "  - zigzag (GraphQL)"
  exit 1
fi

echo "🧪 URL 기반 상품 추출 테스트"
echo "📊 설정:"
echo "   - URL=${URL}"
echo ""

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-url-validation-v2",
  "priority": 5,
  "params": {
    "url": "${URL}"
  },
  "metadata": {
    "test": true,
    
    "description": "URL 기반 상품 추출 테스트"
  }
}
EOF
)

echo "🔍 전송할 JSON Payload:"
echo "${JSON_PAYLOAD}" | jq '.'
echo ""

echo "📤 워크플로우 실행 요청..."
RESPONSE=$(curl -s -X POST "${API_BASE_URL}/workflows/execute" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}")

JOB_ID=$(echo $RESPONSE | jq -r '.job_id')

if [ "$JOB_ID" == "null" ] || [ -z "$JOB_ID" ]; then
  echo "❌ Job 생성 실패:"
  echo $RESPONSE | jq '.'
  exit 1
fi

echo "✅ Job 생성 완료: ${JOB_ID}"
echo ""

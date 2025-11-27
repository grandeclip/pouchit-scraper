#!/bin/bash
# Phase 2 멀티 플랫폼 상품 추출 워크플로우 테스트
#
# v2 API 상품 추출 (extract_multi_platform)
# - ProductId 기반 여러 플랫폼 상품 동시 추출
# - 플랫폼별 그룹화 + 순차 처리
#
# 사용법:
#   ./test-extract-multi-platform.sh "product-uuid"
#   PRODUCT_ID="uuid" SALE_STATUS="on_sale" ./test-extract-multi-platform.sh

set -e

API_BASE_URL="http://localhost:3989/api/v1"
PRODUCT_ID="${PRODUCT_ID:-$1}"
SALE_STATUS="${SALE_STATUS:-on_sale}"

if [ -z "$PRODUCT_ID" ]; then
  echo "❌ PRODUCT_ID가 필요합니다."
  echo ""
  echo "사용법:"
  echo "  ./test-extract-multi-platform.sh \"product-uuid\""
  echo "  PRODUCT_ID=\"uuid\" SALE_STATUS=\"on_sale\" ./test-extract-multi-platform.sh"
  exit 1
fi

echo "🧪 Phase 2 멀티 플랫폼 상품 추출 테스트"
echo "📊 설정:"
echo "   - PRODUCT_ID=${PRODUCT_ID}"
echo "   - SALE_STATUS=${SALE_STATUS}"
echo ""

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF2
{
  "workflow_id": "extract-multi-platform-v1",
  "priority": 5,
  "params": {
    "product_id": "${PRODUCT_ID}",
    "sale_status": "${SALE_STATUS}"
  },
  "metadata": {
    "test": true,
    "phase": "2",
    "description": "Phase 2 멀티 플랫폼 상품 추출 테스트"
  }
}
EOF2
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

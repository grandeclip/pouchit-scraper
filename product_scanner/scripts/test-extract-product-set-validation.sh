#!/bin/bash
# ProductSet ID 기반 상품 추출 워크플로우 테스트
#
# TypedNodeStrategy 기반 extract_product_set 노드 테스트
# - Supabase에서 ProductSet 조회
# - PlatformScannerRegistry를 통한 플랫폼별 스캔
# - DB 데이터와 스캔 결과 비교
#
# 사용법:
#   ./test-extract-product-set.sh "product-set-uuid"
#   PRODUCT_SET_ID="uuid" ./test-extract-product-set.sh

set -e

API_BASE_URL="http://localhost:3989/api/v2"
PRODUCT_SET_ID="${PRODUCT_SET_ID:-$1}"

if [ -z "$PRODUCT_SET_ID" ]; then
  echo "❌ PRODUCT_SET_ID가 필요합니다."
  echo ""
  echo "사용법:"
  echo "  ./test-extract-product-set.sh \"product-set-uuid\""
  echo "  PRODUCT_SET_ID=\"uuid\" ./test-extract-product-set.sh"
  exit 1
fi

echo "🧪 ProductSet ID 기반 상품 추출 테스트"
echo "📊 설정:"
echo "   - PRODUCT_SET_ID=${PRODUCT_SET_ID}"
echo ""

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-product-set-validation-v2",
  "priority": 5,
  "params": {
    "product_set_id": "${PRODUCT_SET_ID}"
  },
  "metadata": {
    "test": true,
    
    "description": "ProductSet ID 기반 상품 추출 테스트"
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

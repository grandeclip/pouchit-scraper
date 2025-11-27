#!/bin/bash
# Product UUID 기반 멀티 플랫폼 상품 추출 + Supabase 업데이트 워크플로우 테스트
#
# TypedNodeStrategy 기반 extract_product + update_product_set 노드 테스트
# - Product ID (UUID)로 모든 product_set 조회
# - PlatformScannerRegistry를 통한 플랫폼별 스캔
# - DB 데이터와 스캔 결과 비교
# - 변경 사항 Supabase 업데이트
#
# 사용법:
#   ./test-extract-product-update.sh "product-uuid"
#   PRODUCT_ID="uuid" SALE_STATUS="on_sale" ./test-extract-product-update.sh
#   UPDATE_SALE_STATUS=false ./test-extract-product-update.sh "uuid"

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 설정
API_BASE_URL="${API_BASE_URL:-http://localhost:3989/api/v2}"
PRODUCT_ID="${PRODUCT_ID:-$1}"
SALE_STATUS="${SALE_STATUS:-}"
UPDATE_SALE_STATUS="${UPDATE_SALE_STATUS:-true}"

# 사용법 출력
usage() {
  echo "사용법: $0 <product-uuid> [sale_status]"
  echo ""
  echo "예시:"
  echo "  $0 \"550e8400-e29b-41d4-a716-446655440000\""
  echo "  PRODUCT_ID=\"uuid\" SALE_STATUS=\"on_sale\" $0"
  echo "  UPDATE_SALE_STATUS=false $0 \"uuid\""
  echo ""
  echo "환경변수:"
  echo "  PRODUCT_ID         - 상품 UUID (필수)"
  echo "  SALE_STATUS        - 판매 상태 필터 (선택: on_sale, off_sale)"
  echo "  UPDATE_SALE_STATUS - sale_status 업데이트 여부 (기본: true)"
  echo "  API_BASE_URL       - API 서버 주소 (기본: http://localhost:3989/api/v2)"
}

if [ -z "$PRODUCT_ID" ]; then
  echo -e "${RED}❌ PRODUCT_ID가 필요합니다.${NC}"
  echo ""
  usage
  exit 1
fi

echo -e "${CYAN}🧪 Product UUID 기반 멀티 플랫폼 상품 추출 + 업데이트 테스트${NC}"
echo -e "${BLUE}📊 설정:${NC}"
echo "   - PRODUCT_ID=${PRODUCT_ID}"
echo "   - SALE_STATUS=${SALE_STATUS:-전체}"
echo "   - UPDATE_SALE_STATUS=${UPDATE_SALE_STATUS}"
echo "   - API_BASE_URL=${API_BASE_URL}"
echo ""

# JSON Payload 생성
if [ -n "$SALE_STATUS" ]; then
  JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-product-update-v2",
  "priority": 5,
  "params": {
    "product_id": "${PRODUCT_ID}",
    "sale_status": "${SALE_STATUS}",
    "update_sale_status": ${UPDATE_SALE_STATUS}
  },
  "metadata": {
    "test": true,
    
    "description": "Product UUID 기반 멀티 플랫폼 추출 + 업데이트 테스트"
  }
}
EOF
)
else
  JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-product-update-v2",
  "priority": 5,
  "params": {
    "product_id": "${PRODUCT_ID}",
    "update_sale_status": ${UPDATE_SALE_STATUS}
  },
  "metadata": {
    "test": true,
    
    "description": "Product UUID 기반 멀티 플랫폼 추출 + 업데이트 테스트"
  }
}
EOF
)
fi

echo -e "${YELLOW}🔍 전송할 JSON Payload:${NC}"
echo "${JSON_PAYLOAD}" | jq '.'
echo ""

echo -e "${BLUE}📤 워크플로우 실행 요청...${NC}"
RESPONSE=$(curl -s -X POST "${API_BASE_URL}/workflows/execute" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}")

JOB_ID=$(echo $RESPONSE | jq -r '.job_id')

if [ "$JOB_ID" == "null" ] || [ -z "$JOB_ID" ]; then
  echo -e "${RED}❌ Job 생성 실패:${NC}"
  echo $RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Job 생성 완료: ${JOB_ID}${NC}"
echo ""

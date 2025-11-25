#!/bin/bash
# 단일 상품 추출 테스트 스크립트 (Job 기반)
#
# 사용법:
#   ./scripts/test-extract-product.sh <product_set_id>
#   ./scripts/test-extract-product.sh cdf36183-a449-43af-92cc-af39ebfe0520
#
# 환경변수:
#   API_BASE_URL - API 서버 주소 (기본: http://localhost:3989/api/v1)

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 설정
API_BASE_URL="${API_BASE_URL:-http://localhost:3989/api/v1}"
PRODUCT_SET_ID="${1:-}"

# 사용법 출력
usage() {
  echo "사용법: $0 <product_set_id>"
  echo ""
  echo "예시:"
  echo "  $0 cdf36183-a449-43af-92cc-af39ebfe0520"
  echo ""
  echo "환경변수:"
  echo "  API_BASE_URL - API 서버 주소 (기본: http://localhost:3989/api/v1)"
  exit 1
}

# product_set_id 검증
if [ -z "$PRODUCT_SET_ID" ]; then
  echo -e "${RED}❌ product_set_id가 필요합니다${NC}"
  usage
fi

# UUID 형식 검증 (간단한 정규식)
if ! [[ "$PRODUCT_SET_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo -e "${RED}❌ 유효하지 않은 UUID 형식: ${PRODUCT_SET_ID}${NC}"
  exit 1
fi

echo -e "${BLUE}🚀 단일 상품 추출 (Job 기반)${NC}"
echo -e "${YELLOW}📦 ProductSetId: ${PRODUCT_SET_ID}${NC}"
echo -e "${YELLOW}🌐 API: ${API_BASE_URL}${NC}"
echo ""

# Step 1: 워크플로우 실행 요청
echo -e "${BLUE}📤 워크플로우 실행 요청...${NC}"

JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-single-product-v1",
  "priority": 5,
  "params": {
    "product_set_id": "${PRODUCT_SET_ID}",
    "platform": "single_product"
  },
  "metadata": {
    "source": "test-script",
    "description": "단일 상품 추출 테스트"
  }
}
EOF
)

echo -e "${YELLOW}📝 Request:${NC}"
echo "${JSON_PAYLOAD}" | jq '.'
echo ""

RESPONSE=$(curl -s -X POST "${API_BASE_URL}/workflows/execute" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}")

JOB_ID=$(echo "$RESPONSE" | jq -r '.job_id')

if [ "$JOB_ID" == "null" ] || [ -z "$JOB_ID" ]; then
  echo -e "${RED}❌ Job 생성 실패:${NC}"
  echo "$RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Job 생성 완료${NC}"
echo -e "${YELLOW}📋 Job ID: ${JOB_ID}${NC}"
echo ""

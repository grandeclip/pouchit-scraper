#!/bin/bash
# Multi-Platform 상품 추출 테스트 스크립트 (Job 기반)
#
# 사용법:
#   ./scripts/test-extract-multi-platform.sh <product_id>
#   ./scripts/test-extract-multi-platform.sh "550e8400-e29b-41d4-a716-446655440000"
#
# 환경변수:
#   API_BASE_URL - API 서버 주소 (기본: http://localhost:3989/api/v1)

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 설정
API_BASE_URL="${API_BASE_URL:-http://localhost:3989/api/v1}"
PRODUCT_ID="${1:-}"
SALE_STATUS="${SALE_STATUS:-on_sale}"

# 사용법 출력
usage() {
  echo "사용법: $0 <product_id>"
  echo ""
  echo "product_id는 Supabase product_sets 테이블의 product_id (UUID) 입니다."
  echo "동일한 product_id를 가진 여러 product_set이 있을 때,"
  echo "플랫폼별로 그룹화하여 순차 처리합니다."
  echo ""
  echo "예시:"
  echo "  $0 \"550e8400-e29b-41d4-a716-446655440000\""
  echo "  SALE_STATUS=off_sale $0 \"550e8400-e29b-41d4-a716-446655440000\""
  echo "  SALE_STATUS=all $0 \"550e8400-e29b-41d4-a716-446655440000\""
  echo ""
  echo "환경변수:"
  echo "  API_BASE_URL  - API 서버 주소 (기본: http://localhost:3989/api/v1)"
  echo "  SALE_STATUS   - 판매 상태 필터 (기본: on_sale)"
  echo "                  on_sale  : 판매 중인 상품만"
  echo "                  off_sale : 판매 종료 상품만"
  echo "                  all      : 모든 상태 검색"
  exit 1
}

# UUID 형식 검증
validate_uuid() {
  local uuid=$1
  if [[ ! "$uuid" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    echo -e "${RED}❌ 유효하지 않은 UUID 형식: ${uuid}${NC}"
    echo "UUID 형식: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    exit 1
  fi
}

# product_id 검증
if [ -z "$PRODUCT_ID" ]; then
  echo -e "${RED}❌ product_id가 필요합니다${NC}"
  usage
fi

# UUID 형식 검증
validate_uuid "$PRODUCT_ID"

echo -e "${BLUE}🚀 Multi-Platform 상품 추출 (Job 기반)${NC}"
echo -e "${YELLOW}📋 Product ID: ${PRODUCT_ID}${NC}"
echo -e "${YELLOW}📊 Sale Status: ${SALE_STATUS}${NC}"
echo -e "${YELLOW}🌐 API: ${API_BASE_URL}${NC}"
echo ""

# 워크플로우 실행 요청
echo -e "${BLUE}📤 워크플로우 실행 요청...${NC}"

# SALE_STATUS에 따라 JSON 생성
if [ "$SALE_STATUS" == "all" ]; then
  # all: sale_status 조건 없음 (전체 검색)
  JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-multi-platform-v1",
  "priority": 5,
  "params": {
    "product_id": "${PRODUCT_ID}",
    "platform": "multi_platform"
  },
  "metadata": {
    "source": "test-script",
    "description": "Multi-Platform 상품 추출 테스트 (all status)"
  }
}
EOF
)
else
  # on_sale / off_sale: sale_status 조건 추가
  JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-multi-platform-v1",
  "priority": 5,
  "params": {
    "product_id": "${PRODUCT_ID}",
    "platform": "multi_platform",
    "sale_status": "${SALE_STATUS}"
  },
  "metadata": {
    "source": "test-script",
    "description": "Multi-Platform 상품 추출 테스트 (${SALE_STATUS})"
  }
}
EOF
)
fi

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
echo -e "${CYAN}💡 Job 상태 확인:${NC}"
echo "   curl ${API_BASE_URL}/jobs/${JOB_ID}"
echo ""
echo -e "${CYAN}💡 처리 순서 (Browser/API 번갈아가며):${NC}"
echo "   1. oliveyoung (Browser)"
echo "   2. hwahae (API)"
echo "   3. ably (Browser)"
echo "   4. musinsa (API)"
echo "   5. kurly (Browser)"
echo "   6. zigzag (GraphQL)"
echo ""
echo -e "${CYAN}💡 결과 파일:${NC}"
echo "   /app/results/YYYY-MM-DD/job_multi_platform_\${JOB_ID}.jsonl"

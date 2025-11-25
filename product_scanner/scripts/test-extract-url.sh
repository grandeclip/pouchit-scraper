#!/bin/bash
# URL 기반 상품 추출 테스트 스크립트 (Job 기반)
#
# 사용법:
#   ./scripts/test-extract-url.sh <url>
#   ./scripts/test-extract-url.sh "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822"
#   ./scripts/test-extract-url.sh "https://www.hwahae.co.kr/goods/21320"
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
PRODUCT_URL="${1:-}"

# 사용법 출력
usage() {
  echo "사용법: $0 <url>"
  echo ""
  echo "예시:"
  echo "  $0 \"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822\""
  echo "  $0 \"https://www.hwahae.co.kr/goods/21320\""
  echo "  $0 \"https://www.musinsa.com/products/4350236\""
  echo "  $0 \"https://m.a-bly.com/goods/32438971\""
  echo "  $0 \"https://www.kurly.com/goods/1000284986\""
  echo "  $0 \"https://zigzag.kr/catalog/products/157001205\""
  echo ""
  echo "지원 플랫폼:"
  echo "  - oliveyoung.co.kr"
  echo "  - hwahae.co.kr"
  echo "  - musinsa.com"
  echo "  - a-bly.com"
  echo "  - kurly.com"
  echo "  - zigzag.kr"
  echo ""
  echo "환경변수:"
  echo "  API_BASE_URL - API 서버 주소 (기본: http://localhost:3989/api/v1)"
  exit 1
}

# URL 검증
if [ -z "$PRODUCT_URL" ]; then
  echo -e "${RED}❌ URL이 필요합니다${NC}"
  usage
fi

# URL 형식 간단 검증
if ! [[ "$PRODUCT_URL" =~ ^https?:// ]]; then
  echo -e "${RED}❌ 유효하지 않은 URL 형식: ${PRODUCT_URL}${NC}"
  echo "URL은 http:// 또는 https://로 시작해야 합니다."
  exit 1
fi

echo -e "${BLUE}🚀 URL 기반 상품 추출 (Job 기반)${NC}"
echo -e "${YELLOW}🔗 URL: ${PRODUCT_URL}${NC}"
echo -e "${YELLOW}🌐 API: ${API_BASE_URL}${NC}"
echo ""

# 워크플로우 실행 요청
echo -e "${BLUE}📤 워크플로우 실행 요청...${NC}"

JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "extract-by-url-v1",
  "priority": 5,
  "params": {
    "url": "${PRODUCT_URL}",
    "platform": "url_extraction"
  },
  "metadata": {
    "source": "test-script",
    "description": "URL 기반 상품 추출 테스트"
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
echo -e "${CYAN}💡 Job 상태 확인:${NC}"
echo "   curl ${API_BASE_URL}/jobs/${JOB_ID}"

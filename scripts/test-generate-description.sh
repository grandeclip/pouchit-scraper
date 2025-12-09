#!/bin/bash
# LLM 기반 상품 설명 생성 API 테스트
#
# POST /api/v2/llm/generate-description 엔드포인트 테스트
# - URL Context로 상품 페이지 분석
# - 마케팅용 상품 설명 + 카테고리 분류
# - 2단계 LLM 호출 (URL Context → Structured Output)
#
# 사용법:
#   ./test-generate-description.sh           # 기본 테스트 데이터 사용
#   ./test-generate-description.sh --check   # 테스트 + LLM 비용 로그 확인
#   ./test-generate-description.sh --stats   # 오늘 비용 통계 조회

set -e

API_BASE_URL="${API_URL:-http://localhost:3989}/api/v2"
OPTION="${1:-}"

echo "🧪 LLM 상품 설명 생성 테스트"
echo "📊 API: POST ${API_BASE_URL}/llm/generate-description"
echo ""

# --stats 옵션: 비용 통계만 조회
if [ "$OPTION" == "--stats" ]; then
  echo "📊 오늘 LLM 비용 통계 조회..."
  echo ""

  STATS_RESPONSE=$(curl -s -X GET "${API_BASE_URL}/llm/cost-stats")
  echo "${STATS_RESPONSE}" | jq '.'

  SUCCESS=$(echo "${STATS_RESPONSE}" | jq -r '.success')
  if [ "$SUCCESS" == "true" ]; then
    echo ""
    echo "💰 비용 요약:"
    echo "${STATS_RESPONSE}" | jq -r '.data | "   총 비용: $\(.total_cost_usd | . * 1000 | round / 1000) (약 ₩\(.total_cost_usd * 1400 | floor))"'
    echo "${STATS_RESPONSE}" | jq -r '.data | "   총 레코드: \(.total_records)건"'
    echo "${STATS_RESPONSE}" | jq -r '.data | "   입력 토큰: \(.total_input_tokens)"'
    echo "${STATS_RESPONSE}" | jq -r '.data | "   출력 토큰: \(.total_output_tokens)"'
  fi
  exit 0
fi

# 테스트 데이터: 토리든 다이브인 세럼
JSON_PAYLOAD=$(cat <<'EOF'
{
  "brand": "토리든",
  "product_name": "다이브인 저분자 히알루론산 세럼",
  "urls": [
    "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000238213",
    "https://zigzag.kr/catalog/products/131281148"
  ]
}
EOF
)

echo "📥 요청 데이터:"
echo "${JSON_PAYLOAD}" | jq '.'
echo ""

echo "⏳ API 호출 중... (URL Context 분석으로 10-30초 소요)"

RESPONSE=$(curl -s -X POST "${API_BASE_URL}/llm/generate-description" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}")

# API 응답에서 duration_ms 추출
DURATION=$(echo "${RESPONSE}" | jq -r '.data.duration_ms // "N/A"')

echo ""
echo "📤 응답 (${DURATION}ms):"
echo "${RESPONSE}" | jq '.'
echo ""

# 성공 여부 확인
SUCCESS=$(echo "${RESPONSE}" | jq -r '.success')
if [ "$SUCCESS" == "true" ]; then
  echo "✅ 테스트 성공"

  # 결과 요약
  echo ""
  echo "📝 생성된 설명:"
  echo "${RESPONSE}" | jq -r '.data.description' | fold -s -w 80

  echo ""
  echo "📁 카테고리:"
  echo "${RESPONSE}" | jq -r '.data.category | "   ID: \(.id)"'
  echo "${RESPONSE}" | jq -r '.data.category | "   경로: \(.path)"'

  # 토큰 사용량
  echo ""
  echo "💰 토큰 사용량:"
  echo "${RESPONSE}" | jq -r '.data.usage.stage1 | "   1단계 (URL Context): 입력=\(.input), 출력=\(.output), URL Context=\(.url_context)"'
  echo "${RESPONSE}" | jq -r '.data.usage.stage2 | "   2단계 (Structured): 입력=\(.input), 출력=\(.output)"'
  echo "${RESPONSE}" | jq -r '.data.usage.total | "   총합: 입력=\(.input), 출력=\(.output), URL Context=\(.url_context)"'
  echo "${RESPONSE}" | jq -r '.data.usage.total | "   비용: $\(.cost_usd | . * 1000 | round / 1000) (약 ₩\(.cost_usd * 1400 | floor))"'

  echo ""
  echo "⏱️  모델: $(echo "${RESPONSE}" | jq -r '.data.model')"
  echo "⏱️  소요시간: $(echo "${RESPONSE}" | jq -r '.data.duration_ms')ms"
else
  echo "❌ 테스트 실패"
  echo "${RESPONSE}" | jq -r '.error'
  exit 1
fi

# LLM 비용 로그 확인 (--check 옵션)
if [ "$OPTION" == "--check" ]; then
  echo ""
  echo "📁 LLM 비용 로그 확인..."

  TODAY=$(date +%Y-%m-%d)
  COST_FILE="results/${TODAY}/llm_cost__${TODAY}.jsonl"

  if [ -f "$COST_FILE" ]; then
    echo "   파일: ${COST_FILE}"
    echo ""
    echo "   최근 product_description 레코드:"
    grep -E '"operation":"product_description_(extract|structured)"' "$COST_FILE" | tail -4 | jq '.'
  else
    echo "   ⚠️  비용 로그 파일 없음: ${COST_FILE}"
    echo "   (Docker 컨테이너 내부 results/ 디렉토리 확인 필요)"
  fi
fi

echo ""
echo "🎉 완료"

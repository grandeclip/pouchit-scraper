#!/bin/bash
# LLM 기반 상품 필터링 API 테스트
#
# POST /api/v2/search/filter-products 엔드포인트 테스트
# - 본품 필터링 (구성품/증정품/다른 상품 제외)
# - LLM 비용 로깅 확인
#
# 사용법:
#   ./test-filter-products.sh           # 기본 테스트 데이터 사용
#   ./test-filter-products.sh --check   # 테스트 + LLM 비용 로그 확인

set -e

API_BASE_URL="${API_URL:-http://localhost:3989}/api/v2"
CHECK_COST="${1:-}"

echo "🧪 LLM 상품 필터링 테스트"
echo "📊 API: POST ${API_BASE_URL}/search/filter-products"
echo ""

# 테스트 데이터
JSON_PAYLOAD=$(cat <<'EOF'
{
  "brand": "토리든",
  "product_name": "다이브인 저분자 히알루론산 세럼",
  "product_names": {
    "oliveyoung": [
      "[2025 어워즈] 토리든 다이브인 저분자 히알루론산 세럼 100ml 어워즈 한정기획",
      "[1등세럼/단독기획] 토리든 다이브인 저분자 히알루론산 세럼 50ml 기획(+멀티패드 10매)",
      "[NEW/단독기획] 토리든 밸런스풀 시카 컨트롤 세럼 50ml 기획 (+크림 20ml)"
    ],
    "zigzag": [
      "[직잭픽] 토리든 다이브인 저분자 히알루론산 세럼 50ml+( 다이브인 세럼 2ml*3매)",
      "[2종세트] 토리든 다이브인 저분자 히알루론산 세럼 50ml+40ml (+다이브인 수딩크림 2ml 5매+다이브인 마스크 1매)",
      "[직잭픽] [SET] 토리든 밸런스풀 시카 컨트롤 세럼 50ml + 밸런스풀 진정 크림 80ml (+시카 진정 세럼 10ml+진정크림 20ml)"
    ],
    "ably": [
      "토리든 다이브인 저분자 히알루론산 세럼 50ml(+밸런스풀시카컨트롤세럼10ml미니어쳐증정)",
      "토리든 다이브인 저분자 히알루론산 멀티패드 80매(+밸런스풀시카컨트롤세럼10ml미니어쳐증정)",
      "토리든 다이브인 저분자 히알루론산 토너 300ml(+밸런스풀시카컨트롤세럼10ml미니어쳐증정)"
    ]
  }
}
EOF
)

echo "📥 요청 데이터:"
echo "${JSON_PAYLOAD}" | jq '.'
echo ""

echo "⏳ API 호출 중..."
START_TIME=$(date +%s%3N)

RESPONSE=$(curl -s -X POST "${API_BASE_URL}/search/filter-products" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}")

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

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
  echo "📊 결과 요약:"
  echo "${RESPONSE}" | jq -r '.data.platforms[] | "   - \(.platform): valid_indices=\(.valid_indices)"'

  # 토큰 사용량
  echo ""
  echo "💰 토큰 사용량:"
  echo "${RESPONSE}" | jq -r '.data.usage | "   - 입력: \(.input_tokens) tokens"'
  echo "${RESPONSE}" | jq -r '.data.usage | "   - 출력: \(.output_tokens) tokens"'
  echo "${RESPONSE}" | jq -r '.data.usage | "   - 비용: $\(.cost_usd) (약 ₩\(.cost_usd * 1400 | floor))"'
else
  echo "❌ 테스트 실패"
  echo "${RESPONSE}" | jq -r '.error'
  exit 1
fi

# LLM 비용 로그 확인 (--check 옵션)
if [ "$CHECK_COST" == "--check" ]; then
  echo ""
  echo "📁 LLM 비용 로그 확인..."

  TODAY=$(date +%Y-%m-%d)
  COST_FILE="results/${TODAY}/llm_cost__${TODAY}.jsonl"

  if [ -f "$COST_FILE" ]; then
    echo "   파일: ${COST_FILE}"
    echo ""
    echo "   최근 product_filtering 레코드:"
    grep '"operation":"product_filtering"' "$COST_FILE" | tail -3 | jq '.'
  else
    echo "   ⚠️  비용 로그 파일 없음: ${COST_FILE}"
    echo "   (Docker 컨테이너 내부 results/ 디렉토리 확인 필요)"
  fi
fi

echo ""
echo "🎉 완료"

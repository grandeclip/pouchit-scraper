#!/bin/bash
# Votes 모니터링 테스트 스크립트
#
# 스케줄러와 관계없이 votes 모니터링을 즉시 실행합니다.
# - votes 테이블에서 활성 투표 조회 (start_date <= now <= end_date)
# - 각 투표의 product_set_a, product_set_b 상품 fetch 확인
# - 실패 시 ALERT_SLACK_CHANNEL_ID로 알림
#
# 사용법:
#   ./test-votes-monitor.sh
#   DEBUG_MODE=false ./test-votes-monitor.sh

set -e

API_BASE_URL="${API_URL:-http://localhost:3989}/api/v2"
DEBUG_MODE="${DEBUG_MODE:-true}"

echo "🗳️ Votes 모니터링 테스트"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 설정:"
echo "   - API_URL: ${API_BASE_URL}"
echo "   - DEBUG_MODE: ${DEBUG_MODE}"
echo ""

# Step 1: 워크플로우 실행 요청
echo "📤 워크플로우 실행 요청..."

JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "votes-monitor",
  "priority": 10,
  "params": {
    "debug_mode": ${DEBUG_MODE}
  },
  "metadata": {
    "test": true,
    "description": "Votes 모니터링 수동 테스트"
  }
}
EOF
)

echo "🔍 전송할 JSON Payload:"
echo "${JSON_PAYLOAD}" | jq '.'
echo ""

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

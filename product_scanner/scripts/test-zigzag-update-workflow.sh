#!/bin/bash
# Zigzag 워크플로우 검증 + 업데이트 스크립트

set -e

API_BASE_URL="http://localhost:3989/api/v1"
SALE_STATUS="${SALE_STATUS:-on_sale}"
LIMIT="${LIMIT:-5}"

echo "🧪 Zigzag 검증 + 업데이트 워크플로우 테스트 시작"
echo "📊 설정: LIMIT=${LIMIT}, SALE_STATUS=${SALE_STATUS}"
echo ""

# Step 1: 워크플로우 실행 요청
echo "📤 워크플로우 실행 요청..."

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "zigzag-validation-update-v1",
  "priority": 5,
  "params": {
    "platform": "zigzag",
    "link_url_pattern": "%zigzag.kr%",
    "sale_status": "${SALE_STATUS}",
    "limit": ${LIMIT}
  },
  "metadata": {
    "test": true,
    "description": "Zigzag 검증 + 업데이트 통합 테스트"
  }
}
EOF
)

# 전송할 JSON 출력
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

#!/bin/bash
# 올리브영 워크플로우 검증 스크립트

set -e

API_BASE_URL="http://localhost:3989/api/v1"
MAX_POLLS=60
POLL_INTERVAL=5
SALE_STATUS="on_sale"
LIMIT=3

echo "🧪 올리브영 워크플로우 테스트 시작"
echo ""

# Step 1: 워크플로우 실행 요청
echo "📤 워크플로우 실행 요청..."

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "oliveyoung-validation-v1",
  "priority": 5,
  "params": {
    "platform": "oliveyoung",
    "link_url_pattern": "%oliveyoung.co.kr%",
    "sale_status": "${SALE_STATUS}",
    "limit": ${LIMIT}
  },
  "metadata": {
    "test": true,
    "description": "올리브영 워크플로우 검증 테스트"
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

# Step 2: Job 상태 폴링
echo "⏳ Job 실행 대기 중..."
POLL_COUNT=0

while [ $POLL_COUNT -lt $MAX_POLLS ]; do
  sleep $POLL_INTERVAL
  POLL_COUNT=$((POLL_COUNT + 1))

  STATUS_RESPONSE=$(curl -s "${API_BASE_URL}/workflows/jobs/${JOB_ID}")
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
  PROGRESS=$(echo $STATUS_RESPONSE | jq -r '.progress')
  CURRENT_NODE=$(echo $STATUS_RESPONSE | jq -r '.current_node // "N/A"')

  echo "[${POLL_COUNT}] Status: ${STATUS}, Progress: ${PROGRESS}%, Node: ${CURRENT_NODE}"

  if [ "$STATUS" == "completed" ]; then
    echo ""
    echo "🎉 워크플로우 완료!"
    echo ""
    break
  fi

  if [ "$STATUS" == "failed" ]; then
    echo ""
    echo "❌ 워크플로우 실패:"
    echo $STATUS_RESPONSE | jq '.error'
    exit 1
  fi
done

if [ $POLL_COUNT -ge $MAX_POLLS ]; then
  echo ""
  echo "⏱️ 타임아웃: 워크플로우가 제한 시간 내에 완료되지 않았습니다."
  exit 1
fi

# Step 3: 결과 확인
echo "📊 최종 결과:"
echo $STATUS_RESPONSE | jq '.result'
echo ""

# Step 4: 검증 요약
echo "✅ 검증 요약:"
echo $STATUS_RESPONSE | jq -r '
  .result.oliveyoung_validation.summary |
  "  - 전체: \(.total)
  - 성공: \(.success)
  - 실패: \(.failed)
  - Not Found: \(.not_found)
  - 매칭: \(.total_matched)
  - 매칭률: \(.match_rate)%"
'

echo ""
echo "🎉 테스트 성공!"

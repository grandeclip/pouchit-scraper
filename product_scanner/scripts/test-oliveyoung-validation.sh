#!/bin/bash
# 올리브영 워크플로우 검증 스크립트
#
# 타입드 노드 기반 검증 파이프라인 테스트
# - FetchProductNode → ScanProductNode → ValidateProductNode
#   → CompareProductNode → SaveResultNode → NotifyResultNode

set -e

API_BASE_URL="http://localhost:3989/api/v2"
SALE_STATUS="${SALE_STATUS:-on_sale}"
# LIMIT: 생략 시 전체 조회, 지정 시 해당 개수만 조회
BATCH_SIZE="${BATCH_SIZE:-10}"
CONCURRENCY="${CONCURRENCY:-4}"

echo "🧪 올리브영 워크플로우 테스트 시작"
echo "📊 설정:"
if [ -n "$LIMIT" ]; then
  echo "   - LIMIT=${LIMIT}"
else
  echo "   - LIMIT=(전체 조회)"
fi
echo "   - BATCH_SIZE=${BATCH_SIZE}"
echo "   - CONCURRENCY=${CONCURRENCY}"
echo "   - SALE_STATUS=${SALE_STATUS}"
echo ""

# Step 1: 워크플로우 실행 요청
echo "📤 워크플로우 실행 요청..."

# LIMIT 파라미터 조건부 생성
if [ -n "$LIMIT" ]; then
  LIMIT_PARAM="\"limit\": ${LIMIT},"
else
  LIMIT_PARAM=""
fi

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "oliveyoung-validation-v2",
  "priority": 5,
  "params": {
    "platform": "oliveyoung",
    "link_url_pattern": "oliveyoung.co.kr",
    "sale_status": "${SALE_STATUS}",
    ${LIMIT_PARAM}
    "batch_size": ${BATCH_SIZE},
    "concurrency": ${CONCURRENCY}
  },
  "metadata": {
    "test": true,
    "description": "올리브영 타입드 노드 파이프라인 테스트"
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

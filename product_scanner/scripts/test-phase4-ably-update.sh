#!/bin/bash
# Phase 4 에이블리 업데이트 워크플로우 테스트 스크립트
#
# Phase 4 타입드 노드 기반 업데이트 파이프라인 테스트
# - FetchProductNode → ScanProductNode → ValidateProductNode
#   → CompareProductNode → SaveResultNode → UpdateProductSetNode → NotifyResultNode

set -e

API_BASE_URL="http://localhost:3989/api/v2"
SALE_STATUS="${SALE_STATUS:-on_sale}"
LIMIT="${LIMIT:-5}"
BATCH_SIZE="${BATCH_SIZE:-10}"
CONCURRENCY="${CONCURRENCY:-4}"
WAIT_TIME_MS="${WAIT_TIME_MS:-2000}"
UPDATE_SALE_STATUS="${UPDATE_SALE_STATUS:-true}"

echo "🧪 Phase 4 에이블리 업데이트 워크플로우 테스트 시작"
echo "📊 설정:"
echo "   - LIMIT=${LIMIT}"
echo "   - BATCH_SIZE=${BATCH_SIZE}"
echo "   - CONCURRENCY=${CONCURRENCY}"
echo "   - WAIT_TIME_MS=${WAIT_TIME_MS}"
echo "   - SALE_STATUS=${SALE_STATUS}"
echo "   - UPDATE_SALE_STATUS=${UPDATE_SALE_STATUS}"
echo ""

# Step 1: 워크플로우 실행 요청
echo "📤 워크플로우 실행 요청..."

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "phase4-ably-update-v2",
  "priority": 5,
  "params": {
    "platform": "ably",
    "link_url_pattern": "a-bly.com",
    "sale_status": "${SALE_STATUS}",
    "limit": ${LIMIT},
    "batch_size": ${BATCH_SIZE},
    "concurrency": ${CONCURRENCY},
    "wait_time_ms": ${WAIT_TIME_MS},
    "update_sale_status": ${UPDATE_SALE_STATUS}
  },
  "metadata": {
    "test": true,
    "phase": "4",
    "description": "Phase 4 에이블리 타입드 노드 업데이트 파이프라인 테스트"
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

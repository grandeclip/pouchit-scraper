#!/bin/bash
# 컬리 워크플로우 검증 스크립트
#
# 타입드 노드 기반 검증 파이프라인 테스트 (Playwright 방식)
# - FetchProductNode → ScanProductNode (Playwright) → ValidateProductNode
#   → CompareProductNode → SaveResultNode → NotifyResultNode
#
# 특징: Playwright 브라우저 기반, 병렬 처리 지원
# - concurrency: 4 (기본 병렬 처리)
# - wait_time_ms: 2500ms (요청 간 대기)

set -e

API_BASE_URL="http://localhost:3989/api/v2"
SALE_STATUS="${SALE_STATUS:-on_sale}"
LIMIT="${LIMIT:-5}"
BATCH_SIZE="${BATCH_SIZE:-10}"
CONCURRENCY="${CONCURRENCY:-4}"
WAIT_TIME_MS="${WAIT_TIME_MS:-2500}"

echo "🧪 컬리 워크플로우 테스트 시작"
echo "📊 설정:"
echo "   - LIMIT=${LIMIT}"
echo "   - BATCH_SIZE=${BATCH_SIZE}"
echo "   - CONCURRENCY=${CONCURRENCY} (병렬 처리)"
echo "   - WAIT_TIME_MS=${WAIT_TIME_MS} (요청 간 대기)"
echo "   - SALE_STATUS=${SALE_STATUS}"
echo ""
echo "🌐 컬리는 Playwright 브라우저 기반 스캔 (병렬 처리 지원)"
echo ""

# Step 1: 워크플로우 실행 요청
echo "📤 워크플로우 실행 요청..."

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "kurly-validation-v2",
  "priority": 5,
  "params": {
    "platform": "kurly",
    "link_url_pattern": "kurly.com",
    "sale_status": "${SALE_STATUS}",
    "limit": ${LIMIT},
    "batch_size": ${BATCH_SIZE},
    "concurrency": ${CONCURRENCY},
    "wait_time_ms": ${WAIT_TIME_MS}
  },
  "metadata": {
    "test": true,
    
    "description": "컬리 Playwright 기반 검증 테스트 (병렬 처리)"
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

#!/bin/bash
# 무신사 워크플로우 검증 스크립트
#
# 타입드 노드 기반 검증 파이프라인 테스트 (API 방식)
# - FetchProductNode → ScanProductNode (API) → ValidateProductNode
#   → CompareProductNode → SaveResultNode → NotifyResultNode
#
# 주의: musinsa는 API 기반이므로 gentle rate limiting 적용
# - concurrency: 1 (순차 처리)
# - wait_time_ms: 2500ms (요청 간 대기)

set -e

API_BASE_URL="http://localhost:3989/api/v2"
SALE_STATUS="${SALE_STATUS:-on_sale}"
LIMIT="${LIMIT:-5}"
BATCH_SIZE="${BATCH_SIZE:-10}"
CONCURRENCY="${CONCURRENCY:-1}"
WAIT_TIME_MS="${WAIT_TIME_MS:-2500}"

echo "🧪 무신사 워크플로우 테스트 시작"
echo "📊 설정:"
echo "   - LIMIT=${LIMIT}"
echo "   - BATCH_SIZE=${BATCH_SIZE}"
echo "   - CONCURRENCY=${CONCURRENCY} (순차 처리)"
echo "   - WAIT_TIME_MS=${WAIT_TIME_MS} (요청 간 대기)"
echo "   - SALE_STATUS=${SALE_STATUS}"
echo ""
echo "⚠️  무신사는 API 기반이므로 gentle rate limiting 적용됨"
echo ""

# Step 1: 워크플로우 실행 요청
echo "📤 워크플로우 실행 요청..."

# JSON Payload 생성
JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "musinsa-validation-v2",
  "priority": 5,
  "params": {
    "platform": "musinsa",
    "link_url_pattern": "musinsa.com",
    "sale_status": "${SALE_STATUS}",
    "limit": ${LIMIT},
    "batch_size": ${BATCH_SIZE},
    "concurrency": ${CONCURRENCY},
    "wait_time_ms": ${WAIT_TIME_MS}
  },
  "metadata": {
    "test": true,
    
    "description": "무신사 API 기반 검증 테스트 (Gentle Rate Limiting)"
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

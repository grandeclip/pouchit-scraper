#!/bin/bash
# Daily Sync Workflow 테스트
#
# products 테이블을 순회하며 6개 플랫폼에서 신규 상품 URL을 검색/등록하는 워크플로우
#
# 특징:
# - batch_size=4 (기본값): 4개 product 처리 후 다음 배치 Job enqueue
# - JSONL 기반 resume 지원
# - Queue 공정성: 다른 Job이 끼어들 수 있음
#
# 사용법:
#   ./test-daily-sync.sh                          # 기본 실행 (batch_size=4)
#   ./test-daily-sync.sh --dry-run                # dry run 모드 (INSERT/enqueue 안함)
#   ./test-daily-sync.sh --batch-size 2           # batch_size 변경
#   ./test-daily-sync.sh --product-ids "uuid1,uuid2"  # 특정 product만 테스트
#   ./test-daily-sync.sh --resume "/app/results/daily_sync/job_xxx.jsonl"  # resume

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:3989/api/v2}"
BATCH_SIZE="${BATCH_SIZE:-4}"
LIMIT=""
DELAY_MS="${DELAY_MS:-2000}"
DRY_RUN="${DRY_RUN:-false}"
PRODUCT_IDS=""
JOB_LOG_FILE=""

# 인자 파싱
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --batch-size)
      BATCH_SIZE="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --delay-ms)
      DELAY_MS="$2"
      shift 2
      ;;
    --product-ids)
      PRODUCT_IDS="$2"
      shift 2
      ;;
    --resume)
      JOB_LOG_FILE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Daily Sync Workflow 테스트"
      echo ""
      echo "사용법:"
      echo "  ./test-daily-sync.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run              INSERT/enqueue 없이 테스트만 실행"
      echo "  --batch-size <n>       배치 크기 - Queue 재등록 단위 (기본: 4)"
      echo "  --limit <n>            처리할 product 최대 수 (테스트용)"
      echo "  --delay-ms <n>         요청 간 딜레이 (기본: 2000)"
      echo "  --product-ids <ids>    특정 product_id만 처리 (쉼표 구분)"
      echo "  --resume <path>        기존 JSONL 파일로 resume"
      echo ""
      echo "환경변수:"
      echo "  API_BASE_URL           API 기본 URL (기본: http://localhost:3989/api/v2)"
      echo ""
      echo "예시:"
      echo "  ./test-daily-sync.sh --dry-run"
      echo "  ./test-daily-sync.sh --limit 10              # 10개 product만 테스트"
      echo "  ./test-daily-sync.sh --batch-size 2 --limit 10"
      echo "  ./test-daily-sync.sh --product-ids 'uuid1,uuid2'"
      echo "  ./test-daily-sync.sh --resume '/app/results/daily_sync/job_xxx.jsonl'"
      exit 0
      ;;
    *)
      echo "❌ 알 수 없는 옵션: $1"
      echo "도움말: ./test-daily-sync.sh --help"
      exit 1
      ;;
  esac
done

echo "🚀 Daily Sync Workflow 테스트"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 설정:"
echo "   - batch_size: ${BATCH_SIZE} (Queue 재등록 단위)"
if [ -n "$LIMIT" ]; then
  echo "   - limit: ${LIMIT} (처리할 product 수)"
fi
echo "   - delay_ms: ${DELAY_MS}"
echo "   - dry_run: ${DRY_RUN}"
if [ -n "$PRODUCT_IDS" ]; then
  echo "   - product_ids: ${PRODUCT_IDS}"
fi
if [ -n "$JOB_LOG_FILE" ]; then
  echo "   - resume: ${JOB_LOG_FILE}"
fi
echo ""

# JSON Payload 생성
PARAMS="{
  \"batch_size\": ${BATCH_SIZE},
  \"delay_ms\": ${DELAY_MS},
  \"dry_run\": ${DRY_RUN}"

if [ -n "$LIMIT" ]; then
  PARAMS="${PARAMS},
  \"limit\": ${LIMIT}"
fi

if [ -n "$PRODUCT_IDS" ]; then
  # 쉼표로 구분된 ID를 JSON 배열로 변환
  IDS_ARRAY=$(echo "$PRODUCT_IDS" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | paste -sd, -)
  PARAMS="${PARAMS},
  \"product_ids\": [${IDS_ARRAY}]"
fi

if [ -n "$JOB_LOG_FILE" ]; then
  PARAMS="${PARAMS},
  \"job_log_file\": \"${JOB_LOG_FILE}\""
fi

PARAMS="${PARAMS}
}"

JSON_PAYLOAD=$(cat <<EOF
{
  "workflow_id": "daily-sync-v2",
  "platform": "default",
  "priority": 5,
  "params": ${PARAMS},
  "metadata": {
    "test": true,
    "description": "Daily Sync Workflow 테스트"
  }
}
EOF
)

echo "🔍 전송할 JSON Payload:"
echo "${JSON_PAYLOAD}" | jq '.'
echo ""

echo "📤 워크플로우 실행 요청..."
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
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Job 상태 확인:"
echo "   curl -s \"${API_BASE_URL}/jobs/${JOB_ID}\" | jq '.'"
echo ""
echo "📊 진행률 모니터링:"
echo "   watch -n 5 'curl -s \"${API_BASE_URL}/jobs/${JOB_ID}\" | jq \"{status, progress, current_node}\"'"
echo ""
echo "📁 JSONL 로그 확인 (컨테이너 내부):"
echo "   docker exec scoob-scraper-worker_default-1 ls -la /app/results/daily_sync/"
echo "   docker exec scoob-scraper-worker_default-1 tail -f /app/results/daily_sync/job_daily_sync_*.jsonl"
echo ""
echo "🔄 Queue 상태 확인:"
echo "   ./scripts/check-running-jobs.sh"
echo ""

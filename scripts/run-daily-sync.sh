#!/bin/bash
# Daily Sync Workflow 수동 실행 스크립트
#
# 사용법:
#   ./run-daily-sync.sh                    # 전체 실행 (운영)
#   ./run-daily-sync.sh --limit 10         # 10개만 실행
#   ./run-daily-sync.sh --dry-run          # dry run (INSERT 안함)
#   ./run-daily-sync.sh --dry-run --limit 5

set -e

API_URL="${API_URL:-http://localhost:3989/api/v2/workflows/execute}"
DRY_RUN="false"
LIMIT=""

# 인자 파싱
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Daily Sync Workflow 수동 실행"
      echo ""
      echo "사용법:"
      echo "  ./run-daily-sync.sh [옵션]"
      echo ""
      echo "옵션:"
      echo "  --dry-run        INSERT/enqueue 없이 테스트만 실행"
      echo "  --limit <n>      처리할 product 최대 수"
      echo ""
      echo "예시:"
      echo "  ./run-daily-sync.sh                     # 전체 실행"
      echo "  ./run-daily-sync.sh --limit 10          # 10개만"
      echo "  ./run-daily-sync.sh --dry-run --limit 5 # 5개 dry run"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# params 생성
PARAMS="{\"dry_run\": ${DRY_RUN}"
if [ -n "$LIMIT" ]; then
  PARAMS="${PARAMS}, \"limit\": ${LIMIT}"
fi
PARAMS="${PARAMS}}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Daily Sync 시작"
echo "  dry_run: ${DRY_RUN}"
[ -n "$LIMIT" ] && echo "  limit: ${LIMIT}"

RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{\"workflow_id\": \"daily-sync-v2\", \"platform\": \"default\", \"params\": ${PARAMS}}")

JOB_ID=$(echo "$RESPONSE" | jq -r '.job_id // empty')

if [ -z "$JOB_ID" ]; then
  echo "ERROR: $RESPONSE"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Job 생성: ${JOB_ID}"
echo ""
echo "결과 확인:"
echo "  cat results/\$(date +%Y-%m-%d)/job_daily_sync_${JOB_ID}.jsonl | jq ."

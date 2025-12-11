#!/bin/bash
# Daily Sync Workflow 스케줄 실행 스크립트
#
# Host crontab에서 실행:
#   0 2 * * * /path/to/scripts/cron-daily-sync.sh >> /var/log/daily-sync.log 2>&1

set -e

LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
API_URL="http://localhost:3989/api/v2/workflows/execute"

echo "${LOG_PREFIX} Daily Sync 시작"

RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "daily-sync-v2",
    "platform": "default",
    "params": {},
    "metadata": {"source": "cron"}
  }')

JOB_ID=$(echo "$RESPONSE" | jq -r '.job_id // empty')

if [ -z "$JOB_ID" ]; then
  echo "${LOG_PREFIX} ERROR: $RESPONSE"
  exit 1
fi

echo "${LOG_PREFIX} Job 생성: ${JOB_ID}"

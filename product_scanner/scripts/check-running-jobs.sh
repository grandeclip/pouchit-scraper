#!/bin/bash
#
# 실행 중인 Job 조회 스크립트
# API를 통해 각 플랫폼별 현재 실행 중인 Job 정보를 표시합니다.
#

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3989}"

# API 호출
response=$(curl -s "${API_URL}/api/v2/jobs/running" 2>/dev/null)

# API 응답 확인
if [ -z "$response" ]; then
    echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
    echo "API_URL: ${API_URL}"
    echo ""
    echo "서버 상태 확인:"
    echo "  docker ps | grep product_scanner"
    exit 1
fi

# JSON 파싱 확인
success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
if [ "$success" != "true" ]; then
    echo -e "${RED}Error: API 응답 오류${NC}"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    exit 1
fi

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                    실행 중인 Job 현황${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# 실행 중인 Job 출력
running_count=$(echo "$response" | jq -r '.data.summary.running_count')

if [ "$running_count" -gt 0 ]; then
    echo "$response" | jq -r '.data.running[] | "\(.platform)|\(.job_id)|\(.workflow_id // "N/A")|\(.started_at)|\(.elapsed_seconds)"' | while IFS='|' read -r platform job_id workflow_id started_at elapsed_seconds; do
        # 경과 시간 포맷
        elapsed_min=$((elapsed_seconds / 60))
        elapsed_sec=$((elapsed_seconds % 60))
        elapsed_str="${elapsed_min}m ${elapsed_sec}s"

        echo -e "${GREEN}▶ ${platform}${NC} ${YELLOW}[실행 중]${NC}"
        echo -e "  Job ID:      ${BLUE}${job_id}${NC}"
        echo -e "  Workflow:    ${workflow_id}"
        echo -e "  Started:     ${started_at}"
        echo -e "  Elapsed:     ${elapsed_str}"
        echo ""
    done
else
    echo -e "  ${GREEN}실행 중인 Job이 없습니다.${NC}"
    echo ""
fi

# Queue 현황 출력
echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
echo -e "${CYAN}                      Queue 현황${NC}"
echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
echo ""

queued_count=$(echo "$response" | jq -r '.data.summary.queued_count')

if [ "$queued_count" -gt 0 ]; then
    echo "$response" | jq -r '.data.queued | to_entries[] | "  \(.key): \(.value) jobs 대기 중"' | while read -r line; do
        echo -e "${line/jobs/${YELLOW}jobs${NC}}"
    done
else
    echo -e "  ${GREEN}모든 Queue가 비어있습니다.${NC}"
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "  실행 중: ${GREEN}${running_count}${NC} jobs | 대기 중: ${YELLOW}${queued_count}${NC} jobs"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

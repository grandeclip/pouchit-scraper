#!/bin/bash
#
# Alert Watcher 제어 스크립트
# API를 통해 Alert Watcher를 시작/중지하고 상태를 확인합니다.
#
# 사용법:
#   ./alert-watcher-control.sh start   # Alert Watcher 시작
#   ./alert-watcher-control.sh stop    # Alert Watcher 중지
#   ./alert-watcher-control.sh status  # 상태 확인
#
# 환경변수:
#   API_URL - API 서버 주소 (기본값: http://localhost:3989)
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
COMMAND="${1:-status}"
CLEAR_QUEUE=false

# Parse options
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
    case "$1" in
        --clear-queue)
            CLEAR_QUEUE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# 사용법 출력
usage() {
    echo -e "${CYAN}Alert Watcher 제어 스크립트${NC}"
    echo ""
    echo "사용법: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start   - Alert Watcher 시작 (활성화)"
    echo "  stop    - Alert Watcher 중지 (비활성화)"
    echo "  status  - Alert Watcher 상태 확인"
    echo ""
    echo "Options:"
    echo "  --clear-queue  - stop 시 대기 중인 alert Job 삭제"
    echo ""
    echo "환경변수:"
    echo "  API_URL - API 서버 주소 (기본값: http://localhost:3989)"
    echo ""
    echo "감시 작업:"
    echo "  - collabo_banner (완료 후 20분 대기)"
    echo "  - votes (완료 후 20분 대기)"
    echo "  - (추가 예정) pick_sections"
    echo ""
    echo "예시:"
    echo "  $0 start"
    echo "  $0 stop"
    echo "  $0 stop --clear-queue"
    echo "  API_URL=http://remote-server:3989 $0 status"
    echo ""
    echo "개별 테스트:"
    echo "  ./test-collabo-banner-monitor.sh"
    echo "  ./test-votes-monitor.sh"
    exit 1
}

# API 호출 함수
call_api() {
    local method="$1"
    local endpoint="$2"

    if [ "$method" = "GET" ]; then
        curl -s "${API_URL}${endpoint}" 2>/dev/null
    else
        curl -s -X POST "${API_URL}${endpoint}" 2>/dev/null
    fi
}

# 상태 확인
show_status() {
    local response=$(call_api GET "/api/v2/alert-watcher/status")
    local jobs_response=$(call_api GET "/api/v2/jobs/running")

    if [ -z "$response" ]; then
        echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
        echo "API_URL: ${API_URL}"
        exit 1
    fi

    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    if [ "$success" != "true" ]; then
        echo -e "${RED}Error: API 응답 오류${NC}"
        echo "$response" | jq . 2>/dev/null || echo "$response"
        exit 1
    fi

    # Alert Watcher 상태
    local enabled=$(echo "$response" | jq -r '.data.watcher.enabled')
    local running=$(echo "$response" | jq -r '.data.watcher.running')
    local last_heartbeat=$(echo "$response" | jq -r '.data.watcher.last_heartbeat_at // "N/A"')
    local total_jobs=$(echo "$response" | jq -r '.data.watcher.total_jobs_executed // 0')

    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                   Alert Watcher 상태${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # 활성화 상태
    if [ "$enabled" = "true" ]; then
        echo -e "  활성화 상태: ${GREEN}✓ 활성화됨${NC}"
    else
        echo -e "  활성화 상태: ${YELLOW}✗ 비활성화됨${NC}"
    fi

    # 컨테이너 실행 상태
    if [ "$running" = "true" ]; then
        echo -e "  컨테이너:    ${GREEN}✓ 실행 중${NC}"
    else
        echo -e "  컨테이너:    ${RED}✗ 중지됨${NC}"
    fi

    echo -e "  총 실행 Job: ${BLUE}${total_jobs}${NC}"

    if [ "$last_heartbeat" != "N/A" ] && [ "$last_heartbeat" != "null" ]; then
        echo -e "  마지막 Heartbeat: ${last_heartbeat}"
    fi

    echo ""

    # 현재 실행 중인 alert 작업
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}                  현재 실행 중인 작업${NC}"
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo ""

    if [ -n "$jobs_response" ]; then
        local alert_jobs=$(echo "$jobs_response" | jq -r '[.data.running[] | select(.platform == "alert")] | length' 2>/dev/null)
        if [ "$alert_jobs" -gt 0 ] 2>/dev/null; then
            echo "$jobs_response" | jq -r '.data.running[] | select(.platform == "alert") | "\(.workflow_id // "N/A")|\(.job_id)|\(.started_at)|\(.elapsed_seconds)"' 2>/dev/null | while IFS='|' read -r workflow_id job_id started_at elapsed_seconds; do
                elapsed_min=$((elapsed_seconds / 60))
                elapsed_sec=$((elapsed_seconds % 60))
                echo -e "  ${GREEN}▶ ${workflow_id}${NC} ${YELLOW}[실행 중]${NC}"
                echo -e "    Job ID:  ${BLUE}${job_id}${NC}"
                echo -e "    경과:    ${elapsed_min}분 ${elapsed_sec}초"
                echo ""
            done
        else
            echo -e "  ${GREEN}현재 실행 중인 작업이 없습니다.${NC}"
            echo ""
        fi

        # 대기 중인 alert 작업
        local queued_alert=$(echo "$jobs_response" | jq -r '.data.queued.alert // 0' 2>/dev/null)
        if [ "$queued_alert" -gt 0 ] 2>/dev/null; then
            echo -e "  ${YELLOW}대기 중: ${queued_alert} jobs${NC}"
            echo ""
        fi
    fi

    # 감시 작업 정보
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}                     등록된 감시 작업${NC}"
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo ""

    # 작업 목록 출력
    echo "$response" | jq -r '.data.config.tasks[] | "  • \(.id) - \(.name) (\(.interval_min)분 간격)"' 2>/dev/null

    echo ""

    # 작업별 마지막 완료 시간
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}                   작업별 마지막 완료${NC}"
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo ""

    echo "$response" | jq -r '.data.tasks | to_entries[] | "  \(.key): \(.value.last_completed_at // "미실행")"' 2>/dev/null

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

# Alert Watcher 시작
start_watcher() {
    echo -e "${CYAN}Alert Watcher 시작 중...${NC}"

    local response=$(call_api POST "/api/v2/alert-watcher/start")

    if [ -z "$response" ]; then
        echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
        exit 1
    fi

    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    local message=$(echo "$response" | jq -r '.message // "Unknown"' 2>/dev/null)

    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ ${message}${NC}"
    else
        echo -e "${RED}✗ 시작 실패: ${message}${NC}"
        exit 1
    fi
}

# Alert Watcher 중지
stop_watcher() {
    if [ "$CLEAR_QUEUE" = "true" ]; then
        echo -e "${CYAN}Alert Watcher 중지 + 큐 비우기 중...${NC}"
    else
        echo -e "${CYAN}Alert Watcher 중지 중...${NC}"
    fi

    local endpoint="/api/v2/alert-watcher/stop"
    if [ "$CLEAR_QUEUE" = "true" ]; then
        endpoint="${endpoint}?clear_queue=true"
    fi

    local response=$(call_api POST "$endpoint")

    if [ -z "$response" ]; then
        echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
        exit 1
    fi

    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    local message=$(echo "$response" | jq -r '.message // "Unknown"' 2>/dev/null)

    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ ${message}${NC}"

        # 큐 비우기 결과 표시
        if [ "$CLEAR_QUEUE" = "true" ]; then
            local cleared_jobs=$(echo "$response" | jq -r '.data.cleared_jobs // 0' 2>/dev/null)
            if [ "$cleared_jobs" -gt 0 ]; then
                echo ""
                echo -e "${YELLOW}삭제된 alert Job: ${cleared_jobs}${NC}"
            fi
        fi
    else
        echo -e "${RED}✗ 중지 실패: ${message}${NC}"
        exit 1
    fi
}

# 메인 로직
case "$COMMAND" in
    start)
        start_watcher
        ;;
    stop)
        stop_watcher
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo ""
        usage
        ;;
esac

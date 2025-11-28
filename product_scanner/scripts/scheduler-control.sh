#!/bin/bash
#
# 스케줄러 제어 스크립트
# API를 통해 스케줄러를 시작/중지하고 상태를 확인합니다.
#
# 사용법:
#   ./scheduler-control.sh start   # 스케줄러 시작
#   ./scheduler-control.sh stop    # 스케줄러 중지
#   ./scheduler-control.sh status  # 상태 확인
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
    echo -e "${CYAN}스케줄러 제어 스크립트${NC}"
    echo ""
    echo "사용법: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start   - 스케줄러 시작 (활성화)"
    echo "  stop    - 스케줄러 중지 (비활성화)"
    echo "  status  - 스케줄러 상태 확인"
    echo ""
    echo "Options:"
    echo "  --clear-queue  - stop 시 대기 중인 모든 Job 삭제"
    echo ""
    echo "환경변수:"
    echo "  API_URL - API 서버 주소 (기본값: http://localhost:3989)"
    echo ""
    echo "예시:"
    echo "  $0 start"
    echo "  $0 stop"
    echo "  $0 stop --clear-queue"
    echo "  API_URL=http://remote-server:3989 $0 status"
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
    local response=$(call_api GET "/api/v2/scheduler/status")

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

    # 스케줄러 상태
    local enabled=$(echo "$response" | jq -r '.data.scheduler.enabled')
    local running=$(echo "$response" | jq -r '.data.scheduler.running')
    local last_heartbeat=$(echo "$response" | jq -r '.data.scheduler.last_heartbeat_at // "N/A"')
    local total_jobs=$(echo "$response" | jq -r '.data.scheduler.total_jobs_scheduled // 0')

    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                     스케줄러 상태${NC}"
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

    echo -e "  총 스케줄 Job: ${BLUE}${total_jobs}${NC}"

    if [ "$last_heartbeat" != "N/A" ] && [ "$last_heartbeat" != "null" ]; then
        echo -e "  마지막 Heartbeat: ${last_heartbeat}"
    fi

    echo ""

    # 설정 정보
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}                        설정${NC}"
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo ""

    local platforms=$(echo "$response" | jq -r '.data.config.platforms | join(", ")')
    local inter_delay=$(echo "$response" | jq -r '.data.config.inter_platform_delay_ms')
    local cooldown=$(echo "$response" | jq -r '.data.config.same_platform_cooldown_ms')
    local ratio=$(echo "$response" | jq -r '.data.config.on_sale_ratio')
    local limit=$(echo "$response" | jq -r '.data.config.default_limit')

    echo -e "  플랫폼: ${platforms}"
    echo -e "  플랫폼 간 간격: $((inter_delay / 1000))초"
    echo -e "  동일 플랫폼 쿨다운: $((cooldown / 1000))초"
    echo -e "  on_sale 비율: ${ratio}:1"
    echo -e "  기본 LIMIT: ${limit}"

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

# 스케줄러 시작
start_scheduler() {
    echo -e "${CYAN}스케줄러 시작 중...${NC}"

    local response=$(call_api POST "/api/v2/scheduler/start")

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

# 스케줄러 중지
stop_scheduler() {
    if [ "$CLEAR_QUEUE" = "true" ]; then
        echo -e "${CYAN}스케줄러 중지 + 큐 비우기 중...${NC}"
    else
        echo -e "${CYAN}스케줄러 중지 중...${NC}"
    fi

    local endpoint="/api/v2/scheduler/stop"
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
            local total_cleared=$(echo "$response" | jq -r '.data.total_cleared // 0' 2>/dev/null)
            if [ "$total_cleared" -gt 0 ]; then
                echo ""
                echo -e "${YELLOW}삭제된 Job:${NC}"
                echo "$response" | jq -r '.data.cleared_jobs | to_entries[] | "  \(.key): \(.value) jobs"' 2>/dev/null
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
        start_scheduler
        ;;
    stop)
        stop_scheduler
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

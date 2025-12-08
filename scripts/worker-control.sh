#!/bin/bash
#
# Worker 제어 스크립트
# API를 통해 Worker를 재시작하고 상태를 확인합니다.
#
# 사용법:
#   ./worker-control.sh status              # 전체 Worker 상태 확인
#   ./worker-control.sh restart oliveyoung  # oliveyoung Worker 재시작
#   ./worker-control.sh restart all         # 모든 Worker 재시작
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
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3989}"
COMMAND="${1:-status}"
PLATFORM="${2:-}"

# 지원하는 플랫폼 목록
PLATFORMS=("oliveyoung" "ably" "kurly" "hwahae" "musinsa" "zigzag" "default")

# 사용법 출력
usage() {
    echo -e "${CYAN}Worker 제어 스크립트${NC}"
    echo ""
    echo "사용법: $0 <command> [platform]"
    echo ""
    echo "Commands:"
    echo "  status            - 전체 Worker 상태 확인"
    echo "  restart <platform> - 특정 Worker 재시작"
    echo "  restart all       - 모든 Worker 재시작"
    echo ""
    echo "Platforms:"
    echo "  oliveyoung, ably, kurly, hwahae, musinsa, zigzag, default"
    echo ""
    echo "환경변수:"
    echo "  API_URL - API 서버 주소 (기본값: http://localhost:3989)"
    echo ""
    echo "예시:"
    echo "  $0 status                    # 상태 확인"
    echo "  $0 restart oliveyoung        # oliveyoung Worker 재시작"
    echo "  $0 restart all               # 모든 Worker 재시작"
    echo "  API_URL=http://server:3989 $0 status"
    echo ""
}

# 상태 확인
check_status() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Worker 상태 조회${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    RESPONSE=$(curl -s "${API_URL}/api/v2/workers/status")

    if ! echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "${RED}✗ API 호출 실패${NC}"
        echo "$RESPONSE"
        exit 1
    fi

    # Summary
    TOTAL=$(echo "$RESPONSE" | jq -r '.data.summary.total')
    RUNNING=$(echo "$RESPONSE" | jq -r '.data.summary.running')
    KILL_FLAGS=$(echo "$RESPONSE" | jq -r '.data.summary.kill_flags_set')

    echo -e "${YELLOW}Summary:${NC}"
    echo -e "  Total Workers: ${CYAN}${TOTAL}${NC}"
    echo -e "  Running Jobs:  ${GREEN}${RUNNING}${NC}"
    echo -e "  Kill Flags:    ${RED}${KILL_FLAGS}${NC}"
    echo ""

    # Worker 상태 테이블
    echo -e "${YELLOW}Workers:${NC}"
    printf "  %-12s %-8s %-10s %-20s\n" "PLATFORM" "STATUS" "KILL_FLAG" "RUNNING_JOB"
    echo "  ────────────────────────────────────────────────────────"

    echo "$RESPONSE" | jq -r '.data.workers[] | "\(.platform)|\(.running_job != null)|\(.kill_flag_set)|\(.running_job.job_id // "-")|\(.running_job.elapsed_seconds // 0)"' | while IFS='|' read -r platform has_job kill_flag job_id elapsed; do
        if [ "$has_job" = "true" ]; then
            STATUS="${GREEN}RUNNING${NC}"
            JOB_INFO="${job_id} (${elapsed}s)"
        else
            STATUS="${BLUE}IDLE${NC}"
            JOB_INFO="-"
        fi

        if [ "$kill_flag" = "true" ]; then
            KILL="${RED}SET${NC}"
        else
            KILL="${GREEN}-${NC}"
        fi

        printf "  %-12s ${STATUS}%-2s ${KILL}%-4s %-20s\n" "$platform" "" "" "$JOB_INFO"
    done

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Worker 재시작
restart_worker() {
    local platform=$1

    echo -e "${YELLOW}► ${platform} Worker 재시작 요청...${NC}"

    RESPONSE=$(curl -s -X POST "${API_URL}/api/v2/workers/${platform}/restart")

    if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
        SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
        if [ "$SUCCESS" = "true" ]; then
            echo -e "${GREEN}✓ ${platform} Worker 재시작 요청 완료${NC}"

            # 실행 중이던 Job 정보
            RUNNING_JOB=$(echo "$RESPONSE" | jq -r '.data.running_job.job_id // empty')
            if [ -n "$RUNNING_JOB" ]; then
                echo -e "  ${YELLOW}⚠ 실행 중이던 Job: ${RUNNING_JOB} → FAILED${NC}"
            fi

            echo -e "  ${CYAN}ℹ Worker가 5~10초 내에 재시작됩니다${NC}"
        else
            echo -e "${RED}✗ ${platform} Worker 재시작 실패${NC}"
            echo "$RESPONSE" | jq -r '.message // .error'
        fi
    else
        echo -e "${RED}✗ API 호출 실패${NC}"
        echo "$RESPONSE"
    fi
}

# 모든 Worker 재시작
restart_all() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}모든 Worker 재시작${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    for platform in "${PLATFORMS[@]}"; do
        restart_worker "$platform"
        echo ""
    done

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ 모든 Worker 재시작 요청 완료${NC}"
    echo -e "${CYAN}ℹ 5~10초 후 상태 확인: $0 status${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 단일 Worker 재시작
restart_single() {
    local platform=$1

    # 플랫폼 유효성 검사
    local valid=false
    for p in "${PLATFORMS[@]}"; do
        if [ "$p" = "$platform" ]; then
            valid=true
            break
        fi
    done

    if [ "$valid" = "false" ]; then
        echo -e "${RED}✗ 유효하지 않은 플랫폼: ${platform}${NC}"
        echo -e "  지원 플랫폼: ${PLATFORMS[*]}"
        exit 1
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}${platform} Worker 재시작${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    restart_worker "$platform"

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 메인 로직
case "$COMMAND" in
    status)
        check_status
        ;;
    restart)
        if [ -z "$PLATFORM" ]; then
            echo -e "${RED}✗ 플랫폼을 지정해주세요${NC}"
            echo ""
            usage
            exit 1
        fi

        if [ "$PLATFORM" = "all" ]; then
            restart_all
        else
            restart_single "$PLATFORM"
        fi
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo -e "${RED}✗ 알 수 없는 명령: ${COMMAND}${NC}"
        echo ""
        usage
        exit 1
        ;;
esac

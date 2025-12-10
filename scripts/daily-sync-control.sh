#!/bin/bash
#
# Daily Sync 제어 스크립트
# API를 통해 Daily Sync 스케줄러를 시작/중지하고 상태를 확인합니다.
#
# 사용법:
#   ./daily-sync-control.sh start         # 스케줄러 시작 (기본: 02:00)
#   ./daily-sync-control.sh start --hour 3 --minute 30  # 03:30에 실행
#   ./daily-sync-control.sh stop          # 스케줄러 중지
#   ./daily-sync-control.sh status        # 상태 확인
#   ./daily-sync-control.sh run           # 즉시 실행
#   ./daily-sync-control.sh run --dry-run # 테스트 실행 (INSERT 없음)
#   ./daily-sync-control.sh config --hour 4  # 실행 시간 변경
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

# 옵션 파싱
shift 2>/dev/null || true
HOUR=""
MINUTE=""
DRY_RUN=false
PRODUCT_IDS=""
BATCH_SIZE=""
DELAY_MS=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --hour)
            HOUR="$2"
            shift 2
            ;;
        --minute)
            MINUTE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --product-ids)
            PRODUCT_IDS="$2"
            shift 2
            ;;
        --batch-size)
            BATCH_SIZE="$2"
            shift 2
            ;;
        --delay)
            DELAY_MS="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# 사용법 출력
usage() {
    echo -e "${CYAN}Daily Sync 제어 스크립트${NC}"
    echo ""
    echo "사용법: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start   - Daily Sync 스케줄러 시작 (활성화)"
    echo "  stop    - Daily Sync 스케줄러 중지 (비활성화)"
    echo "  status  - Daily Sync 상태 확인"
    echo "  run     - Daily Sync 즉시 실행"
    echo "  config  - 실행 시간 설정 변경"
    echo ""
    echo "Options:"
    echo "  --hour <0-23>       실행 시간 (기본: 2)"
    echo "  --minute <0-59>     실행 분 (기본: 0)"
    echo "  --dry-run           테스트 모드 (INSERT/enqueue 없음)"
    echo "  --product-ids <ids> 특정 product_id만 처리 (콤마 구분)"
    echo "  --batch-size <n>    배치 크기 (기본: 10)"
    echo "  --delay <ms>        요청 간 딜레이 (기본: 2000)"
    echo ""
    echo "환경변수:"
    echo "  API_URL - API 서버 주소 (기본값: http://localhost:3989)"
    echo ""
    echo "예시:"
    echo "  $0 start"
    echo "  $0 start --hour 3 --minute 30"
    echo "  $0 stop"
    echo "  $0 status"
    echo "  $0 run --dry-run"
    echo "  $0 run --product-ids 'id1,id2,id3'"
    echo "  $0 config --hour 4 --minute 0"
    echo "  API_URL=http://remote-server:3989 $0 status"
    exit 1
}

# API 호출 함수 (GET)
call_api_get() {
    local endpoint="$1"
    curl -s "${API_URL}${endpoint}" 2>/dev/null
}

# API 호출 함수 (POST with JSON body)
call_api_post() {
    local endpoint="$1"
    local body="$2"

    if [ -z "$body" ]; then
        curl -s -X POST "${API_URL}${endpoint}" 2>/dev/null
    else
        curl -s -X POST "${API_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$body" 2>/dev/null
    fi
}

# API 호출 함수 (PUT with JSON body)
call_api_put() {
    local endpoint="$1"
    local body="$2"

    curl -s -X PUT "${API_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "$body" 2>/dev/null
}

# 상태 확인
show_status() {
    local response=$(call_api_get "/api/v2/daily-sync/status")

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
    local next_run=$(echo "$response" | jq -r '.data.scheduler.next_run_at // "N/A"')

    # 설정 정보
    local hour=$(echo "$response" | jq -r '.data.config.hour')
    local minute=$(echo "$response" | jq -r '.data.config.minute')
    local cron_expr=$(echo "$response" | jq -r '.data.config.cron_expression')
    local timezone=$(echo "$response" | jq -r '.data.config.timezone')

    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                   Daily Sync 상태${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # 활성화 상태
    if [ "$enabled" = "true" ]; then
        echo -e "  활성화 상태: ${GREEN}✓ 활성화됨${NC}"
    else
        echo -e "  활성화 상태: ${YELLOW}✗ 비활성화됨${NC}"
    fi

    echo ""

    # 설정 정보
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}                        설정${NC}"
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo ""

    printf "  실행 시간: %02d:%02d\n" "$hour" "$minute"
    echo -e "  Cron 표현식: ${cron_expr}"
    echo -e "  타임존: ${timezone}"

    if [ "$next_run" != "N/A" ] && [ "$next_run" != "null" ]; then
        echo -e "  다음 실행: ${BLUE}${next_run}${NC}"
    fi

    echo ""

    # 마지막 실행 결과
    local last_run=$(echo "$response" | jq '.data.last_run // null')
    if [ "$last_run" != "null" ]; then
        echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
        echo -e "${CYAN}                    마지막 실행${NC}"
        echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
        echo ""

        local last_success=$(echo "$last_run" | jq -r '.success')
        local last_started=$(echo "$last_run" | jq -r '.started_at // "N/A"')
        local last_completed=$(echo "$last_run" | jq -r '.completed_at // "N/A"')

        echo -e "  시작: ${last_started}"
        echo -e "  완료: ${last_completed}"

        if [ "$last_success" = "true" ]; then
            echo -e "  결과: ${GREEN}✓ 성공${NC}"

            local total=$(echo "$last_run" | jq -r '.summary.total_products // 0')
            local success_count=$(echo "$last_run" | jq -r '.summary.success_count // 0')
            local failed=$(echo "$last_run" | jq -r '.summary.failed_count // 0')
            local new_sets=$(echo "$last_run" | jq -r '.summary.new_product_sets // 0')
            local duration=$(echo "$last_run" | jq -r '.summary.duration_ms // 0')

            echo -e "  총 상품: ${total}, 성공: ${GREEN}${success_count}${NC}, 실패: ${RED}${failed}${NC}"
            echo -e "  신규 ProductSet: ${BLUE}${new_sets}${NC}"
            echo -e "  소요 시간: $((duration / 1000))초"
        else
            echo -e "  결과: ${RED}✗ 실패${NC}"
            local error=$(echo "$last_run" | jq -r '.error // "Unknown error"')
            echo -e "  오류: ${error}"
        fi
        echo ""
    fi

    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

# 스케줄러 시작
start_scheduler() {
    echo -e "${CYAN}Daily Sync 스케줄러 시작 중...${NC}"

    # JSON body 구성
    local body="{}"
    if [ -n "$HOUR" ] || [ -n "$MINUTE" ]; then
        local json_parts=""
        [ -n "$HOUR" ] && json_parts="\"hour\": $HOUR"
        [ -n "$MINUTE" ] && {
            [ -n "$json_parts" ] && json_parts="$json_parts, "
            json_parts="${json_parts}\"minute\": $MINUTE"
        }
        body="{$json_parts}"
    fi

    local response=$(call_api_post "/api/v2/daily-sync/start" "$body")

    if [ -z "$response" ]; then
        echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
        exit 1
    fi

    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    local message=$(echo "$response" | jq -r '.message // "Unknown"' 2>/dev/null)

    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ ${message}${NC}"

        local hour=$(echo "$response" | jq -r '.data.config.hour // 2')
        local minute=$(echo "$response" | jq -r '.data.config.minute // 0')
        local cron=$(echo "$response" | jq -r '.data.config.cron_expression // "N/A"')

        printf "  실행 시간: %02d:%02d (KST)\n" "$hour" "$minute"
        echo "  Cron: $cron"
    else
        echo -e "${RED}✗ 시작 실패: ${message}${NC}"
        exit 1
    fi
}

# 스케줄러 중지
stop_scheduler() {
    echo -e "${CYAN}Daily Sync 스케줄러 중지 중...${NC}"

    local response=$(call_api_post "/api/v2/daily-sync/stop" "")

    if [ -z "$response" ]; then
        echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
        exit 1
    fi

    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    local message=$(echo "$response" | jq -r '.message // "Unknown"' 2>/dev/null)

    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ ${message}${NC}"
    else
        echo -e "${RED}✗ 중지 실패: ${message}${NC}"
        exit 1
    fi
}

# 즉시 실행
run_sync() {
    if [ "$DRY_RUN" = "true" ]; then
        echo -e "${CYAN}Daily Sync 테스트 실행 중 (dry-run)...${NC}"
    else
        echo -e "${CYAN}Daily Sync 즉시 실행 중...${NC}"
    fi

    # JSON body 구성
    local json_parts="\"dry_run\": $DRY_RUN"

    if [ -n "$PRODUCT_IDS" ]; then
        # 콤마로 분리된 ID를 JSON 배열로 변환
        local ids_array=$(echo "$PRODUCT_IDS" | tr ',' '\n' | jq -R . | jq -s .)
        json_parts="$json_parts, \"product_ids\": $ids_array"
    fi

    [ -n "$BATCH_SIZE" ] && json_parts="$json_parts, \"batch_size\": $BATCH_SIZE"
    [ -n "$DELAY_MS" ] && json_parts="$json_parts, \"delay_ms\": $DELAY_MS"

    local body="{$json_parts}"

    local response=$(call_api_post "/api/v2/daily-sync/run" "$body")

    if [ -z "$response" ]; then
        echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
        exit 1
    fi

    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    local message=$(echo "$response" | jq -r '.message // "Unknown"' 2>/dev/null)

    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ ${message}${NC}"
        echo ""

        local total=$(echo "$response" | jq -r '.data.total_products // 0')
        local success_count=$(echo "$response" | jq -r '.data.success_count // 0')
        local skipped=$(echo "$response" | jq -r '.data.skipped_count // 0')
        local failed=$(echo "$response" | jq -r '.data.failed_count // 0')
        local new_sets=$(echo "$response" | jq -r '.data.new_product_sets_count // 0')
        local enqueued=$(echo "$response" | jq -r '.data.enqueued_jobs_count // 0')
        local duration=$(echo "$response" | jq -r '.data.duration_ms // 0')

        echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
        echo -e "${CYAN}                      실행 결과${NC}"
        echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
        echo ""
        echo -e "  총 상품:         ${BLUE}${total}${NC}"
        echo -e "  성공:            ${GREEN}${success_count}${NC}"
        echo -e "  스킵:            ${YELLOW}${skipped}${NC}"
        echo -e "  실패:            ${RED}${failed}${NC}"
        echo -e "  신규 ProductSet: ${BLUE}${new_sets}${NC}"
        echo -e "  Enqueue된 Job:   ${BLUE}${enqueued}${NC}"
        echo -e "  소요 시간:       $((duration / 1000))초"

        # 에러 표시
        local has_errors=$(echo "$response" | jq -r '.data.errors // [] | length')
        if [ "$has_errors" -gt 0 ]; then
            echo ""
            echo -e "${RED}오류 목록:${NC}"
            echo "$response" | jq -r '.data.errors[]' 2>/dev/null | while read -r error; do
                echo -e "  - ${error}"
            done

            local truncated=$(echo "$response" | jq -r '.data.errors_truncated // false')
            if [ "$truncated" = "true" ]; then
                echo -e "  ${YELLOW}(더 많은 오류가 있습니다)${NC}"
            fi
        fi

        echo ""
        echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    else
        echo -e "${RED}✗ 실행 실패: ${message}${NC}"
        exit 1
    fi
}

# 설정 변경
update_config() {
    if [ -z "$HOUR" ]; then
        echo -e "${RED}Error: --hour 옵션이 필요합니다.${NC}"
        usage
    fi

    echo -e "${CYAN}Daily Sync 설정 변경 중...${NC}"

    local json_parts="\"hour\": $HOUR"
    [ -n "$MINUTE" ] && json_parts="$json_parts, \"minute\": $MINUTE"

    local body="{$json_parts}"

    local response=$(call_api_put "/api/v2/daily-sync/config" "$body")

    if [ -z "$response" ]; then
        echo -e "${RED}Error: API 서버에 연결할 수 없습니다.${NC}"
        exit 1
    fi

    local success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)
    local message=$(echo "$response" | jq -r '.message // "Unknown"' 2>/dev/null)

    if [ "$success" = "true" ]; then
        echo -e "${GREEN}✓ ${message}${NC}"

        local new_hour=$(echo "$response" | jq -r '.data.hour // 2')
        local new_minute=$(echo "$response" | jq -r '.data.minute // 0')
        local cron=$(echo "$response" | jq -r '.data.cron_expression // "N/A"')

        printf "  새 실행 시간: %02d:%02d (KST)\n" "$new_hour" "$new_minute"
        echo "  Cron: $cron"
        echo ""
        echo -e "${YELLOW}참고: 변경사항은 스케줄러 재시작 후 적용됩니다.${NC}"
    else
        echo -e "${RED}✗ 설정 변경 실패: ${message}${NC}"
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
    run)
        run_sync
        ;;
    config)
        update_config
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

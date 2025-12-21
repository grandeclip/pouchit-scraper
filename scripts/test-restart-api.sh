#!/bin/bash
# Container Auto-Restart API 테스트
# Usage: ./scripts/test-restart-api.sh [status|trigger|cancel]

BASE_URL="http://localhost:3989/api/v2/system"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 헬퍼 함수
print_header() {
  echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
  echo -e "${GREEN}$1${NC}"
}

print_warning() {
  echo -e "${YELLOW}$1${NC}"
}

print_error() {
  echo -e "${RED}$1${NC}"
}

# 상태 조회
get_status() {
  print_header "재시작 상태 조회"
  response=$(curl -s "${BASE_URL}/restart-status")
  echo "$response" | jq .

  # pending 상태 확인
  pending=$(echo "$response" | jq -r '.data.pending // false')
  if [ "$pending" = "true" ]; then
    print_warning "재시작 대기 중..."
    ttl=$(echo "$response" | jq -r '.data.ttl_seconds')
    echo "남은 시간: ${ttl}초"
  else
    print_success "재시작 대기 없음"
  fi
}

# 재시작 트리거
trigger_restart() {
  local reason="${1:-Manual test via script}"

  print_header "재시작 트리거"
  echo "Reason: $reason"
  echo ""

  response=$(curl -s -X POST "${BASE_URL}/restart-all" \
    -H "Content-Type: application/json" \
    -d "{\"reason\": \"$reason\"}")

  echo "$response" | jq .

  success=$(echo "$response" | jq -r '.success')
  if [ "$success" = "true" ]; then
    print_success "트리거 설정 완료!"
    print_warning "30초 이내에 Restarter가 감지하여 재시작 시작"
  else
    print_error "트리거 설정 실패"
  fi
}

# 트리거 취소
cancel_restart() {
  print_header "재시작 트리거 취소"

  response=$(curl -s -X DELETE "${BASE_URL}/restart-all")
  echo "$response" | jq .

  success=$(echo "$response" | jq -r '.success')
  if [ "$success" = "true" ]; then
    print_success "트리거 취소 완료"
  else
    error=$(echo "$response" | jq -r '.error')
    print_warning "취소 실패: $error"
  fi
}

# 전체 테스트 (대화형)
interactive_test() {
  print_header "Container Restart API Test"
  echo ""

  # 1. 현재 상태 조회
  echo "[1/4] 현재 상태 조회..."
  get_status
  echo ""

  # 2. 재시작 트리거 여부 확인
  read -p "[2/4] 재시작 트리거 실행? (y/N): " do_trigger
  if [ "$do_trigger" = "y" ] || [ "$do_trigger" = "Y" ]; then
    trigger_restart "Manual test via interactive script"
    echo ""

    # 3. 트리거 후 상태 확인
    echo "[3/4] 트리거 후 상태 확인..."
    sleep 1
    get_status
    echo ""

    # 4. 취소 여부 확인
    read -p "[4/4] 트리거 취소? (y/N): " do_cancel
    if [ "$do_cancel" = "y" ] || [ "$do_cancel" = "Y" ]; then
      cancel_restart
      echo ""
      get_status
    fi
  fi

  echo ""
  print_header "Test Complete"
}

# 사용법 출력
usage() {
  echo "Usage: $0 [command] [options]"
  echo ""
  echo "Commands:"
  echo "  status     현재 재시작 상태 조회"
  echo "  trigger    재시작 트리거 설정"
  echo "  cancel     재시작 트리거 취소"
  echo "  test       대화형 전체 테스트 (기본값)"
  echo ""
  echo "Options:"
  echo "  -r, --reason <reason>  트리거 시 사유 지정"
  echo ""
  echo "Examples:"
  echo "  $0 status"
  echo "  $0 trigger --reason 'Maintenance'"
  echo "  $0 cancel"
  echo "  $0 test"
}

# 메인
case "${1:-test}" in
  status)
    get_status
    ;;
  trigger)
    reason="Manual trigger"
    if [ "$2" = "-r" ] || [ "$2" = "--reason" ]; then
      reason="$3"
    fi
    trigger_restart "$reason"
    ;;
  cancel)
    cancel_restart
    ;;
  test)
    interactive_test
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $1"
    usage
    exit 1
    ;;
esac

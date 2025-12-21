#!/bin/bash
# =============================================================================
# 전체 시스템 시작 스크립트
# =============================================================================
#
# 설명:
#   Gatekeeper와 Scoob Scraper를 순차적으로 시작합니다.
#
# 사용법:
#   ./scripts/startup-all.sh
#
# 실행 순서:
#   1. Gatekeeper 컨테이너 확인 (comfyui-chugume, chugume_nginx_gatekeeper)
#   2. 컨테이너가 없으면 → /home/grandeclip/project/chugume_backend/gatekeeper 로 이동
#   3. ./run.sh 실행하여 Gatekeeper 시작
#   4. 20초 대기 (컨테이너 시작 시간)
#   5. Gatekeeper 시작 확인 (실패 시 종료)
#   6. 원래 경로로 복귀 (/home/grandeclip/project/scoob-scraper)
#   7. make up 실행하여 Scoob Scraper 시작
#   8. 30초 대기 (컨테이너 안정화)
#   9. Scheduler 시작 (./scripts/scheduler-control.sh start)
#  10. 5초 대기
#  11. Alert Watcher 시작 (./scripts/alert-watcher-control.sh start)
#
# 환경:
#   - 테스트 서버: /home/grandeclip/project/scoob-scraper
#   - 프로덕션 서버: 경로 수정 필요
#
# =============================================================================

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# 설정
# =============================================================================
GATEKEEPER_PATH="/home/grandeclip/project/chugume_backend/gatekeeper"
SCRAPER_PATH="/home/grandeclip/project/scoob-scraper"
GATEKEEPER_CONTAINERS=("comfyui-chugume" "chugume_nginx_gatekeeper")
STARTUP_WAIT=20

# 원래 경로 저장
ORIGINAL_DIR=$(pwd)

# =============================================================================
# 1. Gatekeeper 컨테이너 확인 및 실행
# =============================================================================
log_info "=== Gatekeeper 컨테이너 확인 ==="

check_container_running() {
  local container=$1
  docker ps --format '{{.Names}}' | grep -q "^${container}$"
}

all_running=true
for container in "${GATEKEEPER_CONTAINERS[@]}"; do
  if check_container_running "$container"; then
    log_info "✓ $container 실행 중"
  else
    log_warn "✗ $container 실행되지 않음"
    all_running=false
  fi
done

if [ "$all_running" = true ]; then
  log_info "Gatekeeper 컨테이너 모두 실행 중 - PASS"
else
  log_info "Gatekeeper 컨테이너 시작 중..."

  # 경로 이동
  if [ ! -d "$GATEKEEPER_PATH" ]; then
    log_error "Gatekeeper 경로를 찾을 수 없음: $GATEKEEPER_PATH"
    exit 1
  fi

  cd "$GATEKEEPER_PATH"
  log_info "경로 이동: $(pwd)"

  # run.sh 실행
  if [ -f "./run.sh" ]; then
    log_info "./run.sh 실행"
    ./run.sh
  else
    log_error "run.sh 파일을 찾을 수 없음"
    exit 1
  fi

  # 컨테이너 시작 대기
  log_info "컨테이너 시작 대기 (${STARTUP_WAIT}초)..."
  sleep "$STARTUP_WAIT"

  # 시작 확인
  gatekeeper_failed=false
  for container in "${GATEKEEPER_CONTAINERS[@]}"; do
    if check_container_running "$container"; then
      log_info "✓ $container 시작됨"
    else
      log_error "✗ $container 시작 실패"
      gatekeeper_failed=true
    fi
  done

  if [ "$gatekeeper_failed" = true ]; then
    log_error "Gatekeeper 시작 실패 - 스크립트 종료"
    exit 1
  fi
fi

# =============================================================================
# 2. Scoob Scraper 실행
# =============================================================================
log_info "=== Scoob Scraper 시작 ==="

# 원래 경로로 복귀 시도
cd "$ORIGINAL_DIR" 2>/dev/null || cd "$SCRAPER_PATH"
log_info "경로 이동: $(pwd)"

# make up 실행
if [ -f "Makefile" ]; then
  log_info "make up 실행"
  make up
else
  log_error "Makefile을 찾을 수 없음"
  exit 1
fi

# =============================================================================
# 3. 서비스 활성화 (Scheduler, Alert Watcher)
# =============================================================================
log_info "=== 서비스 활성화 ==="

# 컨테이너 안정화 대기
log_info "컨테이너 안정화 대기 (30초)..."
sleep 30

# Scheduler 시작
if [ -f "./scripts/scheduler-control.sh" ]; then
  log_info "Scheduler 시작"
  ./scripts/scheduler-control.sh start
else
  log_warn "scheduler-control.sh 없음 - 스킵"
fi

sleep 5

# Alert Watcher 시작
if [ -f "./scripts/alert-watcher-control.sh" ]; then
  log_info "Alert Watcher 시작"
  ./scripts/alert-watcher-control.sh start
else
  log_warn "alert-watcher-control.sh 없음 - 스킵"
fi

log_info "=== 전체 시스템 시작 완료 ==="

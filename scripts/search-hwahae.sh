#!/bin/bash
# Hwahae 검색 스크립트 (Playwright 기반)
# 사용법: ./search-hwahae.sh "검색어" [limit] [--json]
# 예시:
#   ./search-hwahae.sh "토리든" 10
#   ./search-hwahae.sh "토리든 세럼" 10 --json
#
# 참고: Hwahae는 SSR 기반이라 API 없음
#       → Playwright + DOM 파싱으로 데이터 추출

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

npx tsx scripts/search-hwahae.ts "$@"


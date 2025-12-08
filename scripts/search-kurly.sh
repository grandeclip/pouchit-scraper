#!/bin/bash
# Kurly (마켓컬리) 검색 스크립트 (Playwright 기반)
# 사용법: ./search-kurly.sh "검색어" [limit] [--json]
# 예시: 
#   ./search-kurly.sh "토리든" 10
#   ./search-kurly.sh "토리든" 10 --json
#
# 참고: Kurly는 강력한 봇 차단으로 curl/일반 브라우저 불가
#       → Playwright + Stealth 브라우저 자동화로 API 응답 캡쳐

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

npx tsx scripts/search-kurly.ts "$@"


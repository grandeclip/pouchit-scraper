#!/bin/bash
# OliveYoung 검색 스크립트 (Playwright 기반)
# 사용법: ./search-oliveyoung.sh "검색어" [limit] [--json]
# 예시: 
#   ./search-oliveyoung.sh "수분크림" 10
#   ./search-oliveyoung.sh "수분크림" 10 --json
#
# 참고: OliveYoung은 Cloudflare 보호로 curl 직접 호출 불가
#       → Playwright 브라우저 자동화로 API 응답 캡쳐

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

npx tsx scripts/search-oliveyoung.ts "$@"


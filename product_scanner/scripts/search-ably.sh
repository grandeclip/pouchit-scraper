#!/bin/bash
# Ably (에이블리) 검색 스크립트 (Playwright 기반)
# 사용법: ./search-ably.sh "검색어" [limit] [--json]
# 예시: 
#   ./search-ably.sh "토리든" 10
#   ./search-ably.sh "토리든" 10 --json
#
# 참고: Ably는 인증 필요 + Cloudflare 보호로 curl 직접 호출 불가
#       → Playwright 브라우저 자동화로 API 응답 캡쳐

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

npx tsx scripts/search-ably.ts "$@"


#!/bin/bash
# Musinsa (무신사) 검색 스크립트 (Playwright 기반)
# 사용법: ./search-musinsa.sh "검색어" [limit] [--json]
# 예시: 
#   ./search-musinsa.sh "토리든" 10
#   ./search-musinsa.sh "토리든" 10 --json
#
# 참고: Musinsa는 Cloudflare 보호로 curl 직접 호출 시 403 에러
#       → Playwright 브라우저 자동화로 API 응답 캡쳐

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

npx tsx scripts/search-musinsa.ts "$@"

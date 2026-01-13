#!/bin/bash
#
# 올리브영 배치 크롤링 스크립트
# 1000개씩 분할하여 전체 상품 처리
#

API_URL="http://localhost:9607/api/v2/batch/oliveyoung-sync"
BATCH_SIZE=50
START_OFFSET=300  # 이미 처리된 상품 수
MAX_OFFSET=20000  # 필요시 조정

echo "============================================"
echo "올리브영 배치 크롤링 시작"
echo "시작 시간: $(date)"
echo "배치 크기: $BATCH_SIZE"
echo "시작 오프셋: $START_OFFSET"
echo "============================================"

for ((i=START_OFFSET; i<MAX_OFFSET; i+=BATCH_SIZE)); do
  echo ""
  echo "[$(date '+%H:%M:%S')] 배치 시작: offset=$i, limit=$BATCH_SIZE"

  RESPONSE=$(curl -s --max-time 3600 -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{\"limit\": $BATCH_SIZE, \"offset\": $i}")

  # 결과 파싱
  SUCCESS=$(echo "$RESPONSE" | grep -o '"success":[0-9]*' | cut -d: -f2)
  FAILED=$(echo "$RESPONSE" | grep -o '"failed":[0-9]*' | cut -d: -f2)
  TOTAL=$(echo "$RESPONSE" | grep -o '"totalProducts":[0-9]*' | cut -d: -f2)

  echo "[$(date '+%H:%M:%S')] 완료: total=$TOTAL, success=$SUCCESS, failed=$FAILED"

  # 에러 체크 (TOTAL이 비어있으면 에러 발생)
  if [ -z "$TOTAL" ]; then
    echo "ERROR: API 응답 파싱 실패. 응답: $RESPONSE"
    continue  # 다음 배치로 계속
  fi

  # 더 이상 상품이 없으면 종료
  if [ "$TOTAL" -eq 0 ]; then
    echo ""
    echo "더 이상 처리할 상품이 없습니다. 종료합니다."
    break
  fi
done

echo ""
echo "============================================"
echo "올리브영 배치 크롤링 완료"
echo "종료 시간: $(date)"
echo "============================================"

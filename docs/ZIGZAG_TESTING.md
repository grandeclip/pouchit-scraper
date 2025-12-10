# ZigZag 플랫폼 테스트 가이드

## 📋 테스트 개요

ZigZag 플랫폼 구현에 대한 검증 방법을 설명합니다.

## 🧪 테스트 종류

### 1. Strategy 테스트 (단위 테스트)

Scanner 동작을 직접 검증합니다.

```bash
# Docker dev 환경에서 실행
cd product_scanner
make up

# 컨테이너 내부에서
npx tsx scripts/test-zigzag-strategy.ts
```

**테스트 케이스**:

- ✅ 정상 판매 상품 (157001205, 111018539)
- ✅ 잘못된 상품 ID (1570012055)
- ✅ 판매 중단 상품 (110848364, 164410989)
- ✅ 품절 상품 (162525042)

**검증 항목**:

- `saleStatus`: on_sale / sold_out / off_sale
- `isPurchasable`: true / false
- `productName`: 존재 여부
- `discountedPrice`: 가격 유효성

### 2. Workflow 테스트 (통합 테스트)

Supabase → Scanner → Result Writer 전체 플로우 검증합니다.

```bash
# API 서버 실행 후
./scripts/test-zigzag-workflow.sh
```

**워크플로우 파일**: `workflows/zigzag-validation-v1.json`

**실행 흐름**:

1. Supabase에서 `link_url LIKE '%zigzag.kr%'` 상품 검색
2. ZigZag Playwright Scanner로 검증 (concurrency: 4)
3. 결과를 `/app/results/` 디렉토리에 JSON 저장

## 🔍 수동 테스트

### API 직접 호출

```bash
# 단일 상품 스캔
curl -X POST http://localhost:3989/api/v1/scan \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "zigzag",
    "product_id": "157001205",
    "strategy_id": "browser"
  }'
```

### 워크플로우 실행

```bash
curl -X POST http://localhost:3989/api/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "zigzag-validation-v1",
    "priority": 5,
    "params": {
      "platform": "zigzag",
      "link_url_pattern": "%zigzag.kr%",
      "sale_status": "on_sale",
      "limit": 10
    }
  }'
```

## 📊 예상 결과

### 정상 판매 상품 (157001205)

```json
{
  "productId": "157001205",
  "productName": "토리버치 백",
  "brand": "TORY BURCH",
  "originalPrice": 750000,
  "discountedPrice": 675000,
  "saleStatus": "on_sale",
  "isPurchasable": true,
  "displayStatus": "EXPOSURE",
  "thumbnail": "https://..."
}
```

### 판매 중단 상품 (110848364)

```json
{
  "productId": "110848364",
  "productName": "칼하트 WIP 니트",
  "brand": "CARHARTT WIP",
  "originalPrice": 145000,
  "discountedPrice": 145000,
  "saleStatus": "off_sale",
  "isPurchasable": false,
  "displayStatus": "HIDDEN",
  "thumbnail": "https://..."
}
```

### 품절 상품 (162525042)

```json
{
  "productId": "162525042",
  "productName": "상품명",
  "brand": "브랜드",
  "saleStatus": "sold_out",
  "isPurchasable": false,
  "displayStatus": "EXPOSURE"
}
```

## 🐛 문제 해결

### 1. 브라우저 실행 실패

```bash
# Playwright 브라우저 재설치
npx playwright install chromium --with-deps
```

### 2. Rate Limiting

ZigZag는 접근 제한이 있을 수 있습니다:

- Concurrency 4로 제한됨
- 테스트 간 2초 대기 적용됨
- User-Agent: Mobile iPhone Safari

### 3. **NEXT_DATA** 없음

일부 페이지는 SSR 데이터가 없을 수 있습니다:

- Fallback 데이터 반환 (`_source: "no_next_data"`)
- `sale_status: "off_sale"` 처리

## 📈 성능 벤치마크

**단일 상품 스캔**:

- 평균: 3-5초
- 최대: 10초 (타임아웃)

**Bulk 검증 (100개)**:

- Concurrency 4: ~5분
- Memory: ~300MB

## ✅ 체크리스트

테스트 완료 확인:

- [ ] `test-zigzag-strategy.ts` 모든 케이스 통과
- [ ] `test-zigzag-workflow.sh` 정상 실행
- [ ] 정상 판매 상품 데이터 정확성
- [ ] 판매 중단 상품 감지
- [ ] 품절 상품 감지
- [ ] 잘못된 ID 처리
- [ ] Concurrency 4 동작 확인
- [ ] Memory leak 없음

## 🔗 관련 문서

- [SUSPENDED_STATUS.md](./SUSPENDED_STATUS.md) - 판매 중단 감지 원리
- [../WORKFLOW_DAG.md](../WORKFLOW_DAG.md) - Workflow 시스템
- [../../README.md](../../README.md) - 전체 아키텍처

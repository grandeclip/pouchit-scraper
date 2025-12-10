# 올리브영 병렬 처리 Performance 테스트 가이드

## 개요

올리브영 Workflow에 병렬 처리 기능이 추가되었습니다. 이 문서는 병렬 처리 성능을 테스트하는 방법을 안내합니다.

## 테스트 전략

**목표**: concurrency 설정에 따른 성능 개선 확인

**테스트 케이스**:

- concurrency 1: limit 2 (순차 처리, 베이스라인)
- concurrency 4: limit 8 (4병렬 처리)
- concurrency 8: limit 16 (8병렬 처리)

## 사전 준비

### 1. 서버 실행

```bash
cd product_scanner
make up
```

### 2. Supabase 데이터 확인

최소 16개 이상의 올리브영 상품이 등록되어 있어야 합니다:

```sql
SELECT COUNT(*)
FROM product_sets
WHERE link_url LIKE '%oliveyoung.co.kr%';
-- 결과: 16 이상이어야 함
```

## 테스트 실행 방법

### Test 1: concurrency 1 (순차 처리)

**1. Workflow JSON 수정**

`workflows/oliveyoung-validation-v1.json`:

```json
{
  "2": {
    "config": {
      "concurrency": 1, // <- 1로 변경
      "strategy_id": "default"
    }
  }
}
```

**2. 서버 재시작**

```bash
make down
make up
```

**3. Workflow 실행**

```bash
curl -X POST http://localhost:3000/api/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "oliveyoung-validation-v1",
    "params": {
      "platform": "oliveyoung",
      "limit": 2,
      "link_url_pattern": "%oliveyoung.co.kr%"
    }
  }'
```

**4. 결과 확인**

```bash
# Job ID를 복사하여 상태 확인
curl http://localhost:3000/api/v1/jobs/{JOB_ID}

# 로그에서 배치 정보 확인
docker logs product_scanner-app-1 2>&1 | grep "배치"
```

**예상 로그**:

```json
{"batchCount":1,"itemsPerBatch":[2],"type":"oliveyoung_validation","msg":"배치 분할 완료"}
{"batchIndex":0,"count":2,"type":"oliveyoung_validation","msg":"배치 검증 시작"}
{"batchIndex":0,"count":2,"type":"oliveyoung_validation","msg":"배치 검증 완료"}
```

**예상 시간**: 2개 × 5초 = ~10초

---

### Test 2: concurrency 4 (4병렬 처리)

**1. Workflow JSON 수정**

```json
{
  "2": {
    "config": {
      "concurrency": 4, // <- 4로 변경
      "strategy_id": "default"
    }
  }
}
```

**2. 서버 재시작 + 실행**

```bash
make down
make up

curl -X POST http://localhost:3000/api/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "oliveyoung-validation-v1",
    "params": {
      "platform": "oliveyoung",
      "limit": 8,
      "link_url_pattern": "%oliveyoung.co.kr%"
    }
  }'
```

**예상 로그**:

```json
{"batchCount":4,"itemsPerBatch":[2,2,2,2],"type":"oliveyoung_validation","msg":"배치 분할 완료"}
{"batchIndex":0,"count":2,"msg":"배치 검증 시작"}
{"batchIndex":1,"count":2,"msg":"배치 검증 시작"}
{"batchIndex":2,"count":2,"msg":"배치 검증 시작"}
{"batchIndex":3,"count":2,"msg":"배치 검증 시작"}
// ... 병렬 실행 ...
{"batchIndex":0,"count":2,"msg":"배치 검증 완료"}
{"batchIndex":1,"count":2,"msg":"배치 검증 완료"}
// ...
```

**예상 시간**: 2개 × 5초 = ~10초 (4병렬이므로 순차와 유사)

---

### Test 3: concurrency 8 (8병렬 처리)

**1. Workflow JSON 수정**

```json
{
  "2": {
    "config": {
      "concurrency": 8, // <- 8로 변경
      "strategy_id": "default"
    }
  }
}
```

**2. 서버 재시작 + 실행**

```bash
make down
make up

curl -X POST http://localhost:3000/api/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "oliveyoung-validation-v1",
    "params": {
      "platform": "oliveyoung",
      "limit": 16,
      "link_url_pattern": "%oliveyoung.co.kr%"
    }
  }'
```

**예상 로그**:

```json
{"batchCount":8,"itemsPerBatch":[2,2,2,2,2,2,2,2],"type":"oliveyoung_validation","msg":"배치 분할 완료"}
{"batchIndex":0,"count":2,"msg":"배치 검증 시작"}
{"batchIndex":1,"count":2,"msg":"배치 검증 시작"}
// ... 8개 배치 동시 시작 ...
```

**예상 시간**: 2개 × 5초 = ~10초 (8병렬)

---

## 검증 항목

### 1. 배치 분할 확인

로그에서 `batchCount`와 `itemsPerBatch` 확인:

```bash
docker logs product_scanner-app-1 2>&1 | grep "배치 분할 완료"
```

**기대값**:

- concurrency 1: `batchCount: 1, itemsPerBatch: [2]`
- concurrency 4: `batchCount: 4, itemsPerBatch: [2,2,2,2]`
- concurrency 8: `batchCount: 8, itemsPerBatch: [2,2,2,2,2,2,2,2]`

### 2. 병렬 실행 확인

로그에서 `배치 검증 시작` 타임스탬프 비교:

```bash
docker logs product_scanner-app-1 2>&1 | grep "배치 검증 시작"
```

**기대값**:

- concurrency 1: 타임스탬프가 순차적 (5초 간격)
- concurrency 4: 4개 배치가 동시 시작 (타임스탬프 유사)
- concurrency 8: 8개 배치가 동시 시작 (타임스탬프 유사)

### 3. 결과 정합성 확인

Job 결과에서 `summary` 확인:

```bash
curl http://localhost:3000/api/v1/jobs/{JOB_ID}
```

**기대값**:

- `total`: limit와 동일 (2, 8, 16)
- `success + failed + not_found = total`
- 모든 상품이 검증 완료되어야 함

### 4. Scanner cleanup 확인

로그에서 cleanup 메시지 확인:

```bash
docker logs product_scanner-app-1 2>&1 | grep "cleanup"
```

**기대값**:

- 각 배치마다 Scanner cleanup 로그 존재
- concurrency N → cleanup 로그 N개

---

## 성능 지표 예상치

### 800개 아이템 기준 (실제 시나리오)

| Concurrency | 배치당 아이템 | 배치 내 시간 | 총 시간 | 개선율 |
| ----------- | ------------- | ------------ | ------- | ------ |
| 1 (순차)    | 800           | 67분         | 67분    | -      |
| 4           | 200           | 17분         | 17분    | 75%    |
| 8           | 100           | 8.3분        | 8.3분   | 88%    |

**계산 방식**:

- 배치당 아이템 = 총 아이템 / concurrency
- 배치 내 시간 = 배치당 아이템 × 5초 (2초 rate limit + 3초 처리)
- 총 시간 = 배치 내 시간 (병렬 실행)

### 테스트 케이스 (소규모)

| Concurrency | Limit | 배치당 아이템 | 예상 시간 |
| ----------- | ----- | ------------- | --------- |
| 1           | 2     | 2             | ~10초     |
| 4           | 8     | 2             | ~10초     |
| 8           | 16    | 2             | ~10초     |

**참고**: 소규모 테스트에서는 병렬 개수와 무관하게 배치당 아이템이 2개로 동일하므로 시간 차이가 크지 않습니다.

---

## 트러블슈팅

### 에러: "No products found from previous node"

**원인**: Supabase에 올리브영 상품이 없음

**해결**:

```sql
SELECT * FROM product_sets WHERE link_url LIKE '%oliveyoung.co.kr%';
```

### 에러: "batchCount must be positive"

**원인**: concurrency 설정이 0 이하

**해결**: `oliveyoung-validation-v1.json`에서 concurrency ≥ 1 확인

### Scanner cleanup 실패

**원인**: 브라우저 인스턴스 충돌 또는 리소스 부족

**해결**:

- Docker 메모리 제한 확인 (최소 2GB 권장)
- concurrency를 줄여서 재시도 (예: 8 → 4)

### Job 타임아웃

**원인**: 처리 시간이 너무 오래 걸림

**해결**:

- limit을 줄여서 재시도
- 로그에서 에러 확인: `docker logs product_scanner-app-1`

---

## 성공 기준

✅ **모든 테스트 통과 조건**:

1. 3가지 concurrency 모두 정상 실행
2. 배치 분할이 concurrency와 일치
3. 병렬 실행 확인 (타임스탬프 동시성)
4. total = success + failed + not_found
5. Scanner cleanup 정상 (메모리 누수 없음)

---

## 롤백 방법

문제 발생 시 즉시 롤백:

**1. Workflow JSON 복원**

```json
{
  "2": {
    "config": {
      "concurrency": 1, // <- 순차 처리로 복원
      "strategy_id": "default"
    }
  }
}
```

**2. Git 브랜치 변경**

```bash
git checkout main
make down
make up
```

---

## 다음 단계

테스트 성공 후:

1. ✅ 코드 리뷰 요청
2. ✅ Main 브랜치 병합
3. ✅ Production 배포 (concurrency 8 적용)
4. ✅ 모니터링 (메모리, CPU 사용량)

테스트 실패 시:

1. ❌ 로그 분석 및 에러 원인 파악
2. ❌ 코드 수정 또는 설정 조정
3. ❌ 재테스트

# Concurrency 튜닝 가이드

## 개요

병렬 배치 처리 시 concurrency 값에 따라 브라우저 컨텍스트 hang 또는 무한 대기 문제 발생 가능.

## 문제 사례

### 증상 (2025-11-06)

**환경**:

- Platform: 무신사
- 총 상품: 507개
- 배치 분할: 5개 (102, 102, 102, 102, 99)
- Concurrency: 5 (초기 설정)

**현상**:

- batch0-3: 정상 완료 (102개)
- **batch4: productIndex 10에서 멈춤** (99개 중 10개만 완료)

### 로그 패턴

**정상 배치 (0,1,2,3)**:

```log
14:32:51 [batch3] productIndex:10 Page 재생성 완료
14:32:53 [batch2] productIndex:10 Page 재생성 완료
...
14:46:47 [batch2] 배치 검증 완료 (102개)
14:46:53 [batch1] 배치 검증 완료 (102개)
```

**문제 배치 (4)**:

```log
14:32:56 [batch4] productIndex:10 Page 재생성 완료
14:32:56 [batch4] Rate limiting 대기 (510ms)
14:33:06 [batch4] Rate limiting 대기 (307ms)
14:33:14 [batch4] Rate limiting 대기 (565ms)
...
(무한 반복, 11번째 상품 네비게이션 시작 안됨)
```

### 타임라인

| 시간     | batch0   | batch1   | batch2   | batch3   | batch4      |
| -------- | -------- | -------- | -------- | -------- | ----------- |
| 14:31:22 | 시작     | 시작     | 시작     | 시작     | 시작 (99개) |
| 14:32:56 | idx:10✅ | idx:10✅ | idx:10✅ | idx:10✅ | idx:10✅    |
| 14:34:23 | idx:20✅ | idx:20✅ | idx:20✅ | idx:20✅ | ❌          |
| 14:47:18 | 완료✅   | 완료✅   | 완료✅   | 완료✅   | ❌          |

## 원인 분석

### 추정 원인

1. **브라우저 컨텍스트 리소스 경합**
   - 5개 브라우저 컨텍스트 동시 실행
   - Page 재생성 시 리소스 경합 발생
   - batch4의 Page 객체 hang (silent failure)

2. **메모리 압박**
   - Page rotation (10개마다 재생성)
   - 5개 배치 동시 진행 → 피크 메모리 사용
   - 컨텍스트 재생성 실패 but no error

3. **Promise 미처리**
   - Page 재생성 후 async 에러
   - Rate limiter만 동작, 다음 상품 처리 안됨

### 코드 흐름

```typescript
// 정상 흐름
Page 재생성 완료
  → Rate limiting 대기
  → 다음 상품 검증 시작 (productIndex++)

// batch4 문제 흐름
Page 재생성 완료
  → Rate limiting 대기
  → ❌ 다음 상품 검증 시작 안됨 (무한 대기)
```

## 해결 방법

### ✅ 해결: Concurrency 감소

```yaml
# Before (문제 발생)
concurrency: 5

# After (정상 동작)
concurrency: 4
```

**결과**: 모든 배치 정상 완료

### 권장 설정

| 환경         | Concurrency | 비고                  |
| ------------ | ----------- | --------------------- |
| 로컬 개발    | 2-3         | 안정성 우선           |
| 개발 서버    | 3-4         | 균형                  |
| **프로덕션** | **4**       | 검증된 값             |
| 고성능 서버  | 5-6         | 리소스 충분 시 테스트 |

### 튜닝 가이드

**단계별 접근**:

```bash
# 1. 안정성 확인 (concurrency: 3)
npm run validate -- --concurrency 3

# 2. 성능 개선 (concurrency: 4)
npm run validate -- --concurrency 4

# 3. 한계 테스트 (concurrency: 5+)
# 주의: 로그 모니터링 필수
npm run validate -- --concurrency 5
```

**모니터링 지표**:

- 배치별 진행 상황 (`productIndex`)
- Page/Context 재생성 로그
- Rate limiting 대기 패턴
- 메모리 사용량

## 재발 방지

### 1. 타임아웃 추가

```typescript
// Page 재생성 시 타임아웃
await Promise.race([
  this.recreatePage(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Page recreation timeout")), 30000),
  ),
]);
```

### 2. Health Check

```typescript
// 재생성 후 검증
if (!this.page || this.page.isClosed()) {
  throw new Error("Page recreation failed");
}
```

### 3. 로그 강화

```typescript
logger.info("Page 재생성 시작", { batchIndex, productIndex });
logger.info("Page 재생성 완료 (검증됨)", { batchIndex, pageId: page.id });
```

## 관련 문서

- [MEMORY_OPTIMIZATION.md](./MEMORY_OPTIMIZATION.md) - 메모리 최적화
- [PARALLEL_PROCESSING_TEST.md](./PARALLEL_PROCESSING_TEST.md) - 병렬 처리 테스트
- [musinsa-analysis.md](./musinsa-analysis.md) - 무신사 전략 분석

## 참고

**발생 환경**:

- 날짜: 2025-11-06
- 로그: `logs/gpu-server-20251106.log`
- 플랫폼: 무신사
- 총 처리: 507개 상품

**해결 후**:

- Concurrency: 5 → 4
- 결과: 모든 배치 정상 완료

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

## 추가 관찰 사항

### 고성능 서버 (CPU 24코어, 메모리 64GB)

**증상**:

- 무신사: concurrency 5 → 실패, 4 → 성공
- 올리브영: concurrency 5 → 실패, 4 → 성공
- 리소스는 충분하나 5에서 일관되게 실패

**가설 1: Mutex 경합 (가장 유력)**

```typescript
// BrowserPool.ts - 단일 Mutex로 Browser 획득 제어
private mutex = new Mutex();

// 5개 배치 동시 acquire 시:
// batch0: acquire (0ms)
// batch1: acquire (대기 X ms)
// batch2: acquire (대기 2X ms)
// batch3: acquire (대기 3X ms)
// batch4: acquire (대기 4X ms) ← 타임아웃 또는 deadlock?
```

**특징**:

- Page Rotation 시점에 5개 배치가 동시 재생성 시도
- Mutex 대기 큐가 길어지면서 마지막 배치 영향
- 4개 이하에서는 타임아웃 내 완료

**가설 2: Chromium CDP (Chrome DevTools Protocol) 제약**

- Chromium 내부적으로 동시 CDP 연결 수 제한 가능성
- WebSocket 연결 및 DevTools 동시 세션 수
- Playwright 문서에 명시되지 않은 내부 제약

**가설 3: async-mutex 라이브러리 제약**

- 버전: `^0.5.0`
- 5개 이상 동시 대기 시 내부 큐 제약 가능성
- FIFO 보장 중 성능 저하 또는 타임아웃

**가설 4: Event Loop 포화**

- Node.js Event Loop 동시 처리 한계
- 5개 배치 × N개 비동기 작업
- 특정 임계점 초과 시 처리 지연

**가설 5: Binary 친화성 (2^n)**

- 4 = 2^2 (CPU 스케줄러 최적화)
- 5 = 비-이진수 (스케줄링 비효율)
- OS/런타임 레벨 최적화 영향

## 원인 규명을 위한 가설 검증

### 검증 1: Mutex 대기 시간 측정

**목적**: Mutex 경합이 원인인지 확인

**수정 위치**: `src/scanners/base/BrowserPool.ts:133-174`

```typescript
public async acquireBrowser(): Promise<Browser> {
  if (!this.initialized) {
    throw new Error("BrowserPool이 초기화되지 않았습니다. initialize() 호출 필요");
  }

  // Mutex 대기 시간 측정
  const mutexWaitStart = Date.now();
  const release = await this.mutex.acquire();
  const mutexWaitTime = Date.now() - mutexWaitStart;

  // 대기 시간 로깅 (10ms 이상만)
  if (mutexWaitTime > 10) {
    logger.warn(
      { mutexWaitTime, poolStatus: this.getStatus() },
      "Mutex 대기 발생"
    );
  }

  try {
    const available = this.pool.find((p) => !p.inUse);

    if (!available) {
      throw new Error(
        `사용 가능한 Browser 없음 (pool size: ${this.pool.length})`
      );
    }

    // ... 나머지 코드
  } finally {
    release();
  }
}
```

**검증 방법**:

```bash
# concurrency 5로 실행
npm run validate -- --concurrency 5

# 로그 확인
grep "Mutex 대기" logs/*.log
```

**기대 결과**:

- concurrency 5: 높은 mutexWaitTime (100ms+)
- concurrency 4: 낮은 mutexWaitTime (<50ms)

---

### 검증 2: Page 재생성 시간차 도입

**목적**: 동시 재생성이 문제인지 확인

**수정 위치**: `src/strategies/base/BaseValidationNode.ts` (Page rotation 부분)

```typescript
// Page Rotation 시 시간차 추가
if (i > 0 && i % pageRotation === 0) {
  logger.debug(
    { batchIndex, productIndex: i },
    "Page Rotation: 10개 처리 완료 - Page 재생성",
  );

  // 배치별 시간차 (100ms씩)
  const delay = batchIndex * 100;
  if (delay > 0) {
    logger.debug({ batchIndex, delay }, "재생성 시간차 대기");
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  await this.recreatePage();

  logger.debug({ batchIndex, productIndex: i }, "Page 재생성 완료");
}
```

**검증 방법**:

```bash
# concurrency 5로 실행 (시간차 적용)
npm run validate -- --concurrency 5
```

**기대 결과**:

- 시간차 적용 시 concurrency 5도 성공 → 동시 재생성이 원인
- 시간차 적용해도 실패 → 다른 원인

---

### 검증 3: Concurrency 범위 테스트

**목적**: 5만 문제인지, 5 이상이 문제인지 확인

**테스트 시나리오**:

```bash
# 순차 테스트
npm run validate:musinsa -- --concurrency 3  # 기준선
npm run validate:musinsa -- --concurrency 4  # 알려진 안정값
npm run validate:musinsa -- --concurrency 5  # 알려진 실패값
npm run validate:musinsa -- --concurrency 6  # 추가 검증
npm run validate:musinsa -- --concurrency 7  # 추가 검증
npm run validate:musinsa -- --concurrency 8  # 추가 검증
```

**결과 분석**:

| Concurrency | 예상 결과 | 의미                        |
| ----------- | --------- | --------------------------- |
| 3           | ✅        | 안전 기준선                 |
| 4           | ✅        | 알려진 안정값               |
| 5           | ❌        | 임계점                      |
| 6           | ❌        | 5 이상 모두 실패 → 임계점 5 |
| 6           | ✅        | 5만 문제 → 특정 조건 버그   |
| 7-8         | ❌        | 5+ 모두 실패 → 구조적 제약  |
| 7-8         | ✅        | 랜덤 실패 → 타이밍 이슈     |

---

### 검증 4: Browser 획득/반환 추적

**목적**: Browser Pool 상태 변화 추적

**수정 위치**: `src/scanners/base/BrowserPool.ts`

```typescript
// acquireBrowser() 시작 시
logger.debug(
  {
    batchIndex, // 호출한 배치
    before: this.getStatus(),
    timestamp: Date.now(),
  },
  "Browser 획득 시도",
);

// acquireBrowser() 성공 시
logger.debug(
  {
    batchIndex,
    after: this.getStatus(),
    elapsedMs: Date.now() - startTime,
  },
  "Browser 획득 완료",
);

// releaseBrowser() 시
logger.debug(
  {
    batchIndex,
    poolStatus: this.getStatus(),
  },
  "Browser 반환 완료",
);
```

**검증 방법**:

```bash
# 실행
npm run validate -- --concurrency 5

# Pool 상태 변화 추적
grep "Browser 획득\|Browser 반환" logs/*.log
```

**분석 포인트**:

- 어느 시점에 Pool이 고갈되는가?
- batch4가 획득 실패하는 순간의 Pool 상태는?

---

### 검증 5: async-mutex 대체 테스트

**목적**: async-mutex 라이브러리 제약 확인

**수정**: Semaphore로 대체

```typescript
// BrowserPool.ts
import { Semaphore } from "async-mutex";

export class BrowserPool implements IBrowserPool {
  // private mutex = new Mutex();
  private semaphore: Semaphore;

  private constructor(options: BrowserPoolOptions) {
    this.options = options;
    this.semaphore = new Semaphore(1); // Mutex와 동일
  }

  public async acquireBrowser(): Promise<Browser> {
    const [value, release] = await this.semaphore.acquire();
    try {
      // ... 기존 로직
    } finally {
      release();
    }
  }
}
```

**검증 방법**:

```bash
# Semaphore로 변경 후
npm run validate -- --concurrency 5
```

---

### 검증 6: 최소 재현 케이스

**목적**: 최소한의 코드로 문제 재현

**테스트 스크립트**: `scripts/test-browser-pool.ts`

```typescript
import { BrowserPool } from "@/scanners/base/BrowserPool";
import { BROWSER_ARGS } from "@/config/BrowserArgs";

async function testConcurrency(poolSize: number) {
  const pool = BrowserPool.getInstance({
    poolSize,
    browserOptions: { headless: true, args: BROWSER_ARGS.DEFAULT },
  });

  await pool.initialize();

  // poolSize + 1개 동시 획득 시도
  const tasks = Array.from({ length: poolSize + 1 }, async (_, i) => {
    console.log(`[Task ${i}] Browser 획득 시도...`);
    const browser = await pool.acquireBrowser();
    console.log(`[Task ${i}] Browser 획득 완료`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await pool.releaseBrowser(browser);
    console.log(`[Task ${i}] Browser 반환 완료`);
  });

  await Promise.all(tasks);
  await pool.cleanup();
}

// Test
testConcurrency(5).catch(console.error);
```

**실행**:

```bash
tsx scripts/test-browser-pool.ts
```

**기대 결과**:

- 5개 task는 성공, 6번째 task에서 "사용 가능한 Browser 없음" 에러

---

## 검증 우선순위

1. **검증 1 (Mutex 대기 시간)** - 가장 간단하고 정보량 많음
2. **검증 3 (Concurrency 범위)** - 패턴 파악에 중요
3. **검증 2 (시간차 도입)** - 해결책 검증
4. **검증 4 (Pool 상태 추적)** - 상세 분석
5. **검증 6 (최소 재현)** - 근본 원인 확인
6. **검증 5 (라이브러리 대체)** - 마지막 수단

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

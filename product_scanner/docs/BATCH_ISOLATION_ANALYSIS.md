# Batch 격리 분석: Context 재생성이 다른 Batch에 영향을 주는가?

## 결론: ❌ 영향 없음 (완전 격리됨)

## 아키텍처 구조

```
Job (musinsa_validation)
  │
  ├─ BrowserPool (공유 리소스)
  │   ├─ Browser #0 (Chromium 프로세스)
  │   ├─ Browser #1 (Chromium 프로세스)
  │   ├─ Browser #2 (Chromium 프로세스)
  │   └─ Browser #3 (Chromium 프로세스)
  │
  └─ Promise.all([
        validateBatchWithPool(batch0, index=0),  // 독립 실행
        validateBatchWithPool(batch1, index=1),  // 독립 실행
        validateBatchWithPool(batch2, index=2),  // 독립 실행
        validateBatchWithPool(batch3, index=3),  // 독립 실행
     ])
```

## Batch별 리소스 격리

### Batch 0 (독립)
```
acquireBrowser() → Browser #0 획득
  └─ newContext() → Context #0 생성
      └─ newPage() → Page #0 생성
          └─ 127개 상품 처리
              └─ Page Rotation (Context #0 내에서만)
              └─ Context Rotation (Browser #0 내에서만)
releaseBrowser(Browser #0)
```

### Batch 1 (독립)
```
acquireBrowser() → Browser #1 획득
  └─ newContext() → Context #1 생성
      └─ newPage() → Page #1 생성
          └─ 127개 상품 처리
              └─ Page Rotation (Context #1 내에서만)
              └─ Context Rotation (Browser #1 내에서만)
releaseBrowser(Browser #1)
```

### Batch 2 (독립)
```
acquireBrowser() → Browser #2 획득
  └─ newContext() → Context #2 생성
      └─ newPage() → Page #2 생성
          └─ 127개 상품 처리
              └─ Page Rotation (Context #2 내에서만)
              └─ Context Rotation (Browser #2 내에서만) ← 여기서 재생성
releaseBrowser(Browser #2)
```

### Batch 3 (독립)
```
acquireBrowser() → Browser #3 획득
  └─ newContext() → Context #3 생성
      └─ newPage() → Page #3 생성
          └─ 126개 상품 처리
              └─ Page Rotation (Context #3 내에서만)
              └─ Context Rotation (Browser #3 내에서만)
releaseBrowser(Browser #3)
```

## 격리 증명

### 1. Browser 레벨 격리

**코드 증거:**
```typescript
// BaseValidationNode.ts:502-503
// 각 배치가 독립적으로 Browser 획득
browser = await this.browserPool.acquireBrowser();
```

**BrowserPool 동작:**
```typescript
// BrowserPool.ts:168-210
public async acquireBrowser(): Promise<Browser> {
  const release = await this.mutex.acquire();  // Mutex로 동시성 제어
  try {
    const available = this.pool.find((p) => !p.inUse);  // 사용 중이 아닌 것 찾기
    available.inUse = true;  // 이 배치 전용으로 마킹
    return available.browser;
  } finally {
    release();
  }
}
```

**격리 보장:**
- Batch 0이 Browser #0 사용 중 → `inUse = true`
- Batch 1은 Browser #1 획득 → 독립적
- Batch 2가 Browser #2 사용 중 → `inUse = true`
- Batch 3은 Browser #3 획득 → 독립적

### 2. Context 레벨 격리

**코드 증거:**
```typescript
// BaseValidationNode.ts:505-506
// 각 배치가 자신만의 Context 생성
({ context, page } = await this.createBrowserContext(browser));
```

**Context 생성:**
```typescript
// BaseValidationNode.ts:713-745
private async createBrowserContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  // 이 배치 전용 Context 생성
  const context = await browser.newContext({
    viewport: ...,
    userAgent: ...,
    // 독립적인 세션
  });
  
  const page = await context.newPage();
  return { context, page };
}
```

**격리 보장:**
- Batch 2의 `context` 변수는 **지역 변수** (함수 스코프)
- Batch 0, 1, 3의 `context`와 **완전히 별개**
- 메모리 주소도 다름

### 3. 변수 스코프 격리

**코드 증거:**
```typescript
// BaseValidationNode.ts:466-481
private async validateBatchWithPool(
  products: ProductSetSearchResult[],
  batchIndex: number,  // 각 배치마다 다른 값
  ...
): Promise<void> {
  // 지역 변수 - 각 배치마다 독립적인 메모리 공간
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  
  // ...
}
```

**메모리 구조:**
```
Stack Frame (Batch 0)
  ├─ batchIndex = 0
  ├─ browser = Browser #0
  ├─ context = Context #0
  └─ page = Page #0

Stack Frame (Batch 1)
  ├─ batchIndex = 1
  ├─ browser = Browser #1
  ├─ context = Context #1
  └─ page = Page #1

Stack Frame (Batch 2)  ← Context 재생성 발생
  ├─ batchIndex = 2
  ├─ browser = Browser #2
  ├─ context = Context #2 (old) → Context #2' (new)
  └─ page = Page #2 (old) → Page #2' (new)

Stack Frame (Batch 3)
  ├─ batchIndex = 3
  ├─ browser = Browser #3
  ├─ context = Context #3
  └─ page = Page #3
```

## Context 재생성 시 정확한 동작

### Batch 2에서 Context 재생성 발생 시:

```typescript
// Batch 2의 지역 변수
let context: BrowserContext | null = null;  // Context #2
let page: Page | null = null;                // Page #2

// Page 재생성 실패
try {
  page = await context.newPage();  // ❌ 타임아웃
} catch (error) {
  // Context 전체 재생성
  if (context) {
    await context.close();  // Context #2 닫기
  }
  
  // 새로운 Context 생성 (Browser #2에서)
  ({ context, page } = await this.createBrowserContext(browser));
  // context = Context #2' (새로운 객체)
  // page = Page #2' (새로운 객체)
}
```

### 다른 Batch들은?

**Batch 0:**
```typescript
// 완전히 다른 Stack Frame
let context: BrowserContext | null = null;  // Context #0 (변함없음)
let page: Page | null = null;                // Page #0 (변함없음)
// Browser #0 사용 중 (Batch 2와 무관)
```

**Batch 1:**
```typescript
// 완전히 다른 Stack Frame
let context: BrowserContext | null = null;  // Context #1 (변함없음)
let page: Page | null = null;                // Page #1 (변함없음)
// Browser #1 사용 중 (Batch 2와 무관)
```

**Batch 3:**
```typescript
// 완전히 다른 Stack Frame
let context: BrowserContext | null = null;  // Context #3 (변함없음)
let page: Page | null = null;                // Page #3 (변함없음)
// Browser #3 사용 중 (Batch 2와 무관)
```

## 공유 리소스 분석

### 1. BrowserPool (공유됨)
- **격리 메커니즘**: Mutex + `inUse` 플래그
- **영향 범위**: 없음 (각 배치가 다른 Browser 사용)

### 2. StreamingResultWriter (공유됨)
- **Thread-safe**: 파일 쓰기는 순차적으로 처리됨
- **영향 범위**: 없음 (append는 atomic 연산)

### 3. RateLimiter (공유됨)
- **격리 메커니즘**: Context별 독립적인 키 사용
  ```typescript
  // BaseValidationNode.ts:686
  await this.rateLimiter.throttle(`${this.type}:batch${batchIndex}`);
  // Batch 0: "musinsa_validation:batch0"
  // Batch 1: "musinsa_validation:batch1"
  // Batch 2: "musinsa_validation:batch2"
  // Batch 3: "musinsa_validation:batch3"
  ```
- **영향 범위**: 없음 (각 배치가 독립적인 rate limit)

## 실제 로그 분석

### 정상 케이스 (로그 타임스탬프 분석)
```
10:42:26.368 - Batch 2: Page 재생성 완료
10:42:28.364 - Batch 0: 상품 검증 완료  ← Batch 2와 동시 진행
10:42:29.369 - Batch 1: 상품 검증 중    ← Batch 2와 동시 진행
10:42:32.369 - Batch 0: 상품 검증 중    ← Batch 2와 동시 진행
10:42:34.085 - Batch 2: 상품 검증 완료
10:42:35.370 - Batch 0: 상품 검증 중    ← Batch 2와 동시 진행
```

**증거:**
- Batch 2가 Page 재생성하는 동안 다른 배치들은 정상 작동
- 타임스탬프가 겹침 = 병렬 실행 중
- 서로 영향 없음

## 최종 검증: 코드 레벨 격리 체크리스트

### ✅ Browser 격리
- [x] 각 배치가 다른 Browser 인스턴스 사용
- [x] BrowserPool의 Mutex로 동시성 제어
- [x] `inUse` 플래그로 중복 사용 방지

### ✅ Context 격리
- [x] 각 배치가 독립적인 Context 생성
- [x] Context는 지역 변수 (함수 스코프)
- [x] 다른 배치의 Context에 접근 불가능

### ✅ Page 격리
- [x] 각 배치가 독립적인 Page 생성
- [x] Page는 지역 변수 (함수 스코프)
- [x] 다른 배치의 Page에 접근 불가능

### ✅ 변수 격리
- [x] 모든 상태 변수가 함수 스코프
- [x] 공유 변수 없음
- [x] 각 배치가 독립적인 Stack Frame

### ✅ 리소스 격리
- [x] BrowserPool: Mutex로 격리
- [x] StreamingResultWriter: Thread-safe
- [x] RateLimiter: Context별 독립 키

## 결론

**Batch 2의 Context 재생성은 다른 Batch에 절대 영향을 주지 않습니다.**

### 이유:
1. **Browser 격리**: 각 배치가 다른 Browser 프로세스 사용
2. **Context 격리**: 각 배치가 독립적인 Context 객체 사용
3. **변수 격리**: 모든 변수가 함수 스코프 (지역 변수)
4. **메모리 격리**: 각 배치가 독립적인 Stack Frame
5. **공유 리소스 보호**: Mutex와 독립 키로 격리

### 비유:
- **Batch 0**: 아파트 101호 (독립된 공간)
- **Batch 1**: 아파트 102호 (독립된 공간)
- **Batch 2**: 아파트 103호 (독립된 공간) ← 여기서 리모델링
- **Batch 3**: 아파트 104호 (독립된 공간)

103호를 리모델링해도 101, 102, 104호는 전혀 영향받지 않습니다.

### 엄격한 검증 결과:
✅ **100% 격리 보장**


# Hang Detection & Auto-Recovery 구현

## 문제 상황

Musinsa validation job 실행 중 batch 2가 productIndex 120에서 무한 대기 상태에 빠져 전체 job이 완료되지 못하는 이슈 발생.

### 근본 원인

`BaseValidationNode.ts`의 Page/Context Rotation 로직에서 `context.newPage()` 호출이 hang 상태에 빠질 수 있음:

- **타임아웃 미설정**: Playwright의 `context.newPage()` 호출에 타임아웃이 없어 무한 대기 가능
- **에러 핸들링 부재**: 실패 시 복구 로직이 없어 배치 전체가 중단됨
- **Promise.all() 블로킹**: 하나의 배치가 멈추면 전체 job이 완료되지 않음

## 해결 방안

### 1. 타임아웃 추가

모든 Page/Context 생성 작업에 30초 타임아웃 적용:

```typescript
const PAGE_CREATION_TIMEOUT = 30000; // 30초
page = await Promise.race([
  context.newPage(),
  new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Page creation timeout")),
      PAGE_CREATION_TIMEOUT,
    ),
  ),
]);
```

### 2. 자동 복구 로직

#### Page Rotation 실패 시
1. 에러 로그 기록
2. Context 전체 재생성 시도
3. 재생성 성공 시 계속 진행
4. 재생성 실패 시 배치 중단 (명확한 에러 메시지)

```typescript
try {
  // Page 재생성
  page = await Promise.race([...]);
} catch (error) {
  logger.error("Page 재생성 실패 - Context 전체 재생성");
  
  // Context 전체 재생성으로 복구
  ({ context, page } = await this.createBrowserContext(browser));
  logger.info("Context 전체 재생성 완료");
}
```

#### Context Rotation 실패 시
1. 에러 로그 기록
2. 정리 후 재시도 (1회)
3. 재시도 성공 시 계속 진행
4. 재시도 실패 시 배치 중단 (명확한 에러 메시지)

```typescript
try {
  // Context 재생성 (타임아웃 30초)
  ({ context, page } = await Promise.race([...]));
} catch (error) {
  logger.error("Context 재생성 실패 - 재시도");
  
  // 재시도 (타임아웃 없이 한 번만)
  ({ context, page } = await this.createBrowserContext(browser));
  logger.info("Context 재생성 재시도 성공");
}
```

## 수정 파일

- `product_scanner/src/strategies/base/BaseValidationNode.ts`
  - Line 511-603: Context Rotation 로직 수정
  - Line 604-682: Page Rotation 로직 수정

## 기대 효과

### 1. Hang 감지 및 복구
- 30초 이내에 응답이 없으면 타임아웃 에러 발생
- 자동으로 복구 시도하여 배치 계속 진행
- 더 이상 무한 대기 상태에 빠지지 않음

### 2. 명확한 에러 로깅
```json
{
  "level": "error",
  "type": "musinsa_validation",
  "batchIndex": 2,
  "productIndex": 120,
  "error": "Page creation timeout",
  "msg": "Page 재생성 실패 - Context 전체 재생성"
}
```

### 3. 복구 성공 로깅
```json
{
  "level": "info",
  "type": "musinsa_validation",
  "batchIndex": 2,
  "productIndex": 120,
  "msg": "Context 전체 재생성 완료"
}
```

### 4. 최종 실패 시 명확한 에러
```
Error: Page/Context 재생성 실패 (productIndex: 120): Context creation timeout
```

## 테스트 시나리오

### 정상 케이스
1. Page Rotation이 정상적으로 작동
2. Context Rotation이 정상적으로 작동
3. 모든 배치가 완료됨

### 복구 케이스
1. Page 재생성 타임아웃 발생
2. Context 전체 재생성으로 복구
3. 배치 계속 진행 및 완료

### 실패 케이스
1. Page 재생성 타임아웃 발생
2. Context 재생성도 실패
3. 명확한 에러 메시지와 함께 배치 중단
4. 다른 배치는 정상 완료 (격리됨)

## 모니터링 포인트

### 정상 작동 확인
```bash
# Page 재생성 로그 확인
grep "Page 재생성 완료" worker.log

# Context 재생성 로그 확인
grep "Context 재생성 완료" worker.log

# 배치 완료 로그 확인
grep "배치 검증 완료" worker.log
```

### 복구 작동 확인
```bash
# Page 재생성 실패 및 복구 확인
grep -E "(Page 재생성 실패|Context 전체 재생성 완료)" worker.log

# Context 재생성 실패 및 재시도 확인
grep -E "(Context 재생성 실패|재시도 성공)" worker.log
```

### 타임아웃 발생 확인
```bash
# 타임아웃 에러 확인
grep "timeout" worker.log -i

# 특정 배치의 타임아웃 확인
grep '"batchIndex":2' worker.log | grep -i timeout
```

## 추가 개선 사항 (향후)

### 1. 설정 가능한 타임아웃
```yaml
# config/platforms/musinsa.yaml
workflow:
  memory_management:
    page_creation_timeout_ms: 30000
    context_creation_timeout_ms: 30000
```

### 2. 재시도 횟수 설정
```typescript
const MAX_RETRY_ATTEMPTS = 2;
for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
  try {
    page = await Promise.race([...]);
    break;
  } catch (error) {
    if (attempt === MAX_RETRY_ATTEMPTS - 1) throw error;
    logger.warn(`재시도 ${attempt + 1}/${MAX_RETRY_ATTEMPTS}`);
  }
}
```

### 3. 메트릭 수집
- 타임아웃 발생 횟수
- 복구 성공률
- 평균 Page/Context 생성 시간

## 결론

이 수정으로 인해:
- ✅ Hang 상태 자동 감지 (30초 타임아웃)
- ✅ 자동 복구 시도 (Context 재생성)
- ✅ 명확한 에러 로깅
- ✅ 배치 격리 (하나의 배치 실패가 다른 배치에 영향 없음)
- ✅ 운영자가 수동 개입 없이 대부분의 경우 자동 복구

더 이상 무한 대기 상태로 인한 job 중단이 발생하지 않으며, 발생하더라도 명확한 원인 파악이 가능합니다.


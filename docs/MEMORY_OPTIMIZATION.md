# 메모리 최적화 가이드

Playwright 기반 대량 스크래핑 시 메모리 누수 방지 및 안정성 개선 방법.

## 문제 인식

### 증상

- **300개 이후**: 접근 실패, 30초 timeout 반복
- **400개 시점**: Docker logs 완전 멈춤
- **메모리 증가**: 실행 중 지속적인 메모리 증가 경향

### 원인 분석

1. **Page 재사용 메모리 누적** (주요 원인)
   - 동일 Page로 수백 번 navigate → DOM, 리소스, 이벤트 리스너 누적
   - Playwright 알려진 이슈: Context 재사용 시 메모리 증가

2. **Docker `/dev/shm` 부족**
   - 기본 64MB → Chromium 렌더링에 부족
   - 누적된 페이지 → shared memory 고갈

3. **Rate Limiting 감지**
   - Ubuntu 서버의 빠른 속도 → 요청 간격 과도하게 짧음
   - 무신사 서버의 rate limit 임계값 초과

---

## 해결 방안

### 1. Page Rotation 패턴 (핵심)

#### 개념

- **Context 유지 + Page 재생성**: 10개마다 Page를 새로 생성하여 메모리 정리
- **성능 최적화**: Context는 유지하여 초기화 비용 최소화

#### 구현 위치

- **파일**: `src/strategies/base/BaseValidationNode.ts:455-660`
- **메서드**: `validateBatchWithPool()`

#### 코드 패턴

```typescript
// Page Rotation 설정
const PAGE_ROTATION_INTERVAL = 10; // 10개마다 Page 재생성

for (let i = 0; i < products.length; i++) {
  // Page Rotation: N개마다 Page 재생성
  if (i > 0 && i % PAGE_ROTATION_INTERVAL === 0) {
    // 기존 Page 정리
    if (page) {
      await page.close().catch(() => {});
    }

    // 새 Page 생성 (Context는 유지)
    page = await context.newPage();
  }

  // 상품 검증 로직...
}
```

#### 효과

- **메모리 누적 방지**: 10개마다 Page 히스토리, DOM, 리소스 정리
- **성능 유지**: Context 재사용으로 초기화 비용 최소화
- **안정성 향상**: 장시간 실행 시에도 메모리 안정적 유지

---

### 2. Docker `/dev/shm` 증가

#### 설정 위치

- `docker/docker-compose.yml:51-52`
- `docker/docker-compose.dev.yml:51-52`

#### 변경 내용

```yaml
workflow_worker:
  # Chromium 메모리 누수 방지 설정
  shm_size: "2gb" # /dev/shm 크기 증가 (기본 64MB → 2GB)
```

#### 효과

- **Chromium 안정성**: 대량 렌더링 시에도 shared memory 충분
- **크래시 방지**: 메모리 부족으로 인한 브라우저 크래시 방지

---

### 3. Browser Args 최적화

#### 설정 위치

- `src/scanners/base/BrowserPool.ts:102-114` (초기화)
- `src/scanners/base/BrowserPool.ts:266-278` (재생성)

#### 추가된 Args

```typescript
args: [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage", // /dev/shm 사용 최소화
  "--disable-blink-features=AutomationControlled",
  "--disable-gpu", // GPU 비활성화 (메모리 절약)
  "--disable-software-rasterizer",
  "--disable-extensions", // 확장 프로그램 비활성화
  "--disable-background-networking", // 백그라운드 네트워킹 비활성화
  "--disable-default-apps",
  "--no-first-run",
  "--no-zygote", // Zygote 프로세스 비활성화 (메모리 절약)
];
```

#### 효과

- **메모리 절약**: 불필요한 기능 비활성화로 메모리 사용량 감소
- **안정성 향상**: 백그라운드 작업 최소화로 예측 가능한 동작

---

### 4. Rate Limiting 조정

#### 설정 위치

- `src/config/platforms/musinsa.yaml:239-246`

#### 권장 설정 (Ubuntu 서버)

```yaml
workflow:
  rate_limit:
    enabled: true
    wait_time_ms: 3000-4000 # macOS 2초 → Ubuntu 3-4초

  concurrency:
    default: 4 # macOS 8 → Ubuntu 4
```

#### 효과

- **Rate Limit 회피**: 무신사 서버의 차단 방지
- **안정적 실행**: 느린 속도로 장시간 안정 실행

---

## 테스트 및 모니터링

### 1. 메모리 모니터링

```bash
# 실시간 메모리/CPU 모니터링
docker stats workflow_worker

# 예상 동작:
# - 초기 메모리: ~2GB
# - Page Rotation 시: 일시적 감소 → 다시 증가 (반복)
# - 최대 메모리: ~8GB (16GB limit 내)
```

### 2. 로그 모니터링

```bash
# Page Rotation 로그 확인
docker logs -f workflow_worker | grep "Page Rotation"

# 출력 예시:
# Page Rotation: 10개 처리 완료 - Page 재생성
# Page 재생성 완료
```

### 3. Timeout 감소 확인

```bash
# Timeout 발생 횟수 확인
docker logs workflow_worker | grep -c "timeout"

# 기대 결과:
# - Before: 수십 회 이상
# - After: 0-5회 이내
```

---

## 튜닝 파라미터

### PAGE_ROTATION_INTERVAL 조정

**위치**: `BaseValidationNode.ts:480`

```typescript
// 메모리가 충분한 경우
const PAGE_ROTATION_INTERVAL = 20; // 20개마다

// 메모리가 부족한 경우
const PAGE_ROTATION_INTERVAL = 5; // 5개마다
```

**기준**:

- 메모리 16GB: `10-15` (권장)
- 메모리 8GB: `5-10`
- 메모리 4GB: `3-5`

### shm_size 조정

**위치**: `docker-compose.yml:52`

```yaml
# 동시 처리 많은 경우
shm_size: '4gb'

# 기본
shm_size: '2gb'

# 메모리 제한 환경
shm_size: '1gb'
```

**기준**:

- Concurrency 8+: `4gb`
- Concurrency 4-8: `2gb`
- Concurrency 1-4: `1gb`

---

## 성능 벤치마크

### Before (메모리 누수 상태)

```
처리량:
- 0-100개: 정상
- 100-300개: 느려짐
- 300개+: timeout 반복, 접근 실패

메모리:
- 시작: 2GB
- 300개 시점: 10GB
- 400개 시점: 15GB+ (멈춤)
```

### After (최적화 적용)

```
처리량:
- 0-500개: 안정적

메모리:
- 시작: 2GB
- 100개: 4GB
- 300개: 6GB
- 500개: 8GB (안정적)
```

---

## 추가 최적화 옵션

### Context Rotation (고급)

현재는 **Page Rotation**만 적용.
더 공격적인 메모리 정리가 필요한 경우 **Context Rotation** 고려:

```typescript
// 50개마다 Context도 재생성
if (i > 0 && i % 50 === 0) {
  // Context + Page 모두 재생성
  await page.close();
  await context.close();
  ({ context, page } = await this.createBrowserContext(browser));
}
```

**트레이드오프**:

- 장점: 더 철저한 메모리 정리
- 단점: Context 초기화 비용 증가 (느려짐)

---

## 참고 자료

### Playwright 공식 이슈

- [Memory leak in Context reuse](https://github.com/microsoft/playwright/issues/6319)
- [Memory increases when same context is used](https://github.com/microsoft/playwright/issues/6319)
- [Docker zombie processes](https://github.com/mxschmitt/playwright-go/issues/209)

### Best Practices

- [Building Scalable Browser Pool](https://medium.com/@devcriston/building-a-robust-browser-pool-for-web-automation-with-playwright-2c750eb0a8e7)
- [Playwright Docker Configuration](https://playwright.dev/docs/docker)

---

## 문제 발생 시

### 여전히 메모리 증가하는 경우

1. `PAGE_ROTATION_INTERVAL` 감소 (10 → 5)
2. `shm_size` 증가 (2gb → 4gb)
3. Context Rotation 추가 적용

### 여전히 timeout 발생하는 경우

1. `wait_time_ms` 증가 (3000 → 5000)
2. `concurrency.default` 감소 (4 → 3)
3. Proxy 서버 적용 고려

### Docker 로그 멈춤 현상

1. Container 재시작: `docker restart workflow_worker`
2. 로그 확인: `docker logs workflow_worker --tail 100`
3. 메모리 확인: `docker stats workflow_worker`

---

## 2025-12-21 메모리 누수 예방 조치

### 적용된 수정사항

서버 먹통 현상 조사 후 발견된 메모리 누수 가능성에 대한 예방 조치:

| 파일 | 수정 내용 | 효과 |
|------|----------|------|
| `WorkflowExecutionService.ts` | `finally`에서 `sharedStateMap.delete()` 호출 | Job 완료 후 메모리 해제 |
| `AblyApiCaptureStrategy.ts` | response handler cleanup 함수 분리 | Page 리스너 누적 방지 |
| `alert-watcher.ts` | `heartbeatTimer` 모듈 레벨 + shutdown 정리 | 비정상 종료 시 타이머 정리 |
| `logger.ts` | `cleanupLoggerStreams()` + `beforeExit` 핸들러 | 파일 핸들 누수 방지 |
| `ScannerRegistry.ts` | TTL 기반 자동 정리 (1시간 미사용 시) | 장시간 운영 메모리 안정화 |

---

## 향후 개선 아이디어

### 1. SupabaseProductsRepository.findAll() 최적화

현재 `findAll()`은 모든 데이터를 메모리에 로드합니다. 데이터 양이 많아지면 메모리 부담이 커질 수 있습니다.

#### 문제점

```typescript
// 현재 구현 (src/repositories/SupabaseProductsRepository.ts)
async findAll(): Promise<ProductEntity[]> {
  const allResults: ProductEntity[] = [];

  while (hasMore) {
    const { data } = await this.client.from(...).select(...).range(...);
    allResults.push(...data);  // 메모리에 계속 누적
  }

  return allResults;  // 전체 데이터 반환
}
```

- 10만 상품 × 500bytes = ~50MB 메모리 사용
- GC 전까지 메모리 점유

#### 개선 방안 A: 배치 처리

호출부에서 limit/offset으로 나눠서 처리. **기존 인터페이스 유지**.

```typescript
// 호출부 예시
const BATCH_SIZE = 1000;
let offset = 0;

while (true) {
  const batch = await repository.findAll({ limit: BATCH_SIZE, offset });
  if (batch.length === 0) break;

  await processBatch(batch);  // 배치 단위 처리
  offset += BATCH_SIZE;

  // 배치 처리 후 GC 기회 제공
}
```

**장점**: 기존 코드 변경 최소화
**단점**: 호출부마다 배치 로직 구현 필요

#### 개선 방안 B: AsyncIterator 스트리밍

Generator 패턴으로 스트리밍 처리. **호출부 수정 필요**.

```typescript
// Repository 구현
async *findAllStream(pageSize = 1000): AsyncGenerator<ProductEntity[]> {
  let offset = 0;

  while (true) {
    const { data } = await this.client
      .from("products")
      .select("*")
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;

    yield data;  // 페이지 단위로 yield
    offset += pageSize;
  }
}

// 호출부
for await (const batch of repository.findAllStream()) {
  await processBatch(batch);
  // 각 배치 처리 후 이전 배치 메모리 해제 가능
}
```

**장점**: 메모리 효율적, 대용량 데이터 처리 가능
**단점**: 호출부 코드 변경 필요 (`for await...of`)

#### 적용 시점

- **현재**: 데이터 양이 많지 않아 보류
- **향후**: 상품 수가 10만 개 이상으로 증가 시 적용 검토

---

### 2. 메모리 모니터링 추가 (선택사항)

장시간 운영 시 메모리 사용량 추적을 위한 모니터링:

```typescript
// 주기적 메모리 로깅 (60초마다)
setInterval(() => {
  const mem = process.memoryUsage();
  logger.info({
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
    external: `${Math.round(mem.external / 1024 / 1024)}MB`,
  }, "메모리 사용량");
}, 60000);
```

#### 적용 위치

- `src/worker.ts`: Worker 프로세스
- `src/search-worker.ts`: Search Worker
- `src/scheduler.ts`: Scheduler

#### Grafana/Prometheus 연동

```typescript
// prometheus-client 사용 시
import { collectDefaultMetrics, Gauge } from "prom-client";

const heapUsedGauge = new Gauge({
  name: "nodejs_heap_used_bytes",
  help: "Node.js heap used in bytes",
});

setInterval(() => {
  heapUsedGauge.set(process.memoryUsage().heapUsed);
}, 10000);
```

---

### 3. Container Restarter 개선 (현재 적용됨)

서버 먹통 시 자동 복구를 위해 `restarter` 컨테이너가 추가되었습니다:

- **스케줄**: 매일 04:10 자동 재시작
- **Heartbeat 모니터링**: 60초 timeout 시 개별 컨테이너 재시작
- **API 트리거**: `POST /api/v2/system/restart-all`

자세한 내용은 `docker/docker-compose.yml`의 `restarter` 서비스 참조.

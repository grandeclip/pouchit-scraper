# 스케일링 아이디어 실현 가능성 평가

## 현재 상황 분석

### 문제점

| 항목      | 현황                   | 문제                            |
| --------- | ---------------------- | ------------------------------- |
| Resume    | `current_node` 기반만  | 상품 1000/1400 실패 시 처음부터 |
| 배치 처리 | 1개씩 Queue 재등록     | 중간 checkpoint 없음            |
| 스케일링  | 플랫폼별 1 worker 고정 | 상품 300~1400개 불균형          |

### 현재 아키텍처 특징

```
Worker → PlatformLock → executeJob() → DAG 실행 → JSONL 로그
                                              ↓
                              1개씩 처리 후 Queue 재등록
```

### 현재 Worker 구성

| Worker 타입          | 개수 | 메모리      | 특징                    |
| -------------------- | ---- | ----------- | ----------------------- |
| Browser (Playwright) | 3개  | 4GB+2GB shm | oliveyoung, ably, kurly |
| API (HTTP/GraphQL)   | 3개  | 2GB         | hwahae, musinsa, zigzag |
| Default              | 1개  | 2GB         | 기타 플랫폼             |
| Alert                | 1개  | 2GB         | 알림 처리               |
| Search               | 1개  | 4GB+2GB shm | 검색 큐 처리            |

### Redis 키 패턴

```
workflow:queue:platform:{platform}   # Job Queue (Sorted Set)
workflow:job:{jobId}                 # Job 데이터 (Hash)
workflow:lock:platform:{platform}    # Platform Lock (SET NX EX)
workflow:running:platform:{platform} # 실행 중 Job 정보
```

### 현재 Resume 한계

- `current_node` 기반 resume만 지원
- 노드 내부 상품 처리 진행률 저장 없음
- `DailySyncBatchNode`: 1개씩 처리 후 Queue 재등록 방식

---

## 아이디어 1: 동적 컨테이너 스케일링

### 개념

- 100개씩 배치 Job 생성
- 컨테이너 동적 확장으로 병렬 처리

### Docker Compose 방식

**실현 가능성: ⭐⭐⭐ (중간)**

| 장점                                 | 단점                 |
| ------------------------------------ | -------------------- |
| `docker compose up --scale worker=N` | 수동 스케일링만 가능 |
| 인프라 변경 최소                     | 자동 스케일링 불가   |
| 현재 구조 유지                       | replicas 고정 설정   |

**구현 방식:**

```yaml
# docker-compose.yml
worker_generic:
  deploy:
    replicas: 1 # 초기값
    resources:
      limits:
        memory: 2G
```

```bash
# 수동 스케일링
docker compose up -d --scale worker_generic=5
```

**제약사항:**

- `PlatformLock` 으로 같은 플랫폼은 1개만 실행
- 스케일 증가해도 동일 플랫폼 병렬 처리 불가
- 외부 오케스트레이터 필요 (스크립트 작성 필요)

### Kubernetes 방식

**실현 가능성: ⭐⭐⭐⭐ (높음)**

| 장점                 | 단점                      |
| -------------------- | ------------------------- |
| HPA (자동 스케일링)  | 러닝커브, 인프라 복잡도   |
| Pod 단위 리소스 관리 | Ubuntu 서버 K8s 설치 필요 |
| Job/CronJob 리소스   | 현재 구조 마이그레이션    |

**필요 작업:**

1. K8s 설치 (k3s 권장 - 가벼움)
2. Deployment/Job 리소스 정의
3. Redis 외부화 또는 StatefulSet
4. HPA 설정 (큐 길이 기반)

**아키텍처:**

```
                    ┌─→ Worker Pod 1 ─→ Redis Queue
K8s HPA ─→ Deployment ├─→ Worker Pod 2 ─→ (Platform별 분리)
                    └─→ Worker Pod N
```

### 핵심 문제: PlatformLock

**현재 Lock 구조:**

```
workflow:lock:platform:hwahae    → 1개만 실행
workflow:lock:platform:oliveyoung → 1개만 실행
```

→ 컨테이너 늘려도 **같은 플랫폼 병렬 처리 불가**

**해결 필요:**

1. PlatformLock 제거/수정
2. 또는 배치 단위 Lock으로 변경

---

## 아이디어 2: 고정 컨테이너 + 작은 배치

### 개념

- 1~2개 고정 컨테이너 유지
- 100개씩 배치로 잘게 쪼개서 실행
- 배치 단위 checkpoint/resume

**실현 가능성: ⭐⭐⭐⭐⭐ (매우 높음)**

### 장점

| 항목             | 설명                           |
| ---------------- | ------------------------------ |
| 인프라 변경 없음 | 현재 Docker Compose 유지       |
| Resume 용이      | 배치 단위로 실패 지점 특정     |
| 구현 단순        | 워크플로우/코드 수정만         |
| 리소스 효율      | 메모리 누수 방지 (배치별 정리) |

### 단점

| 항목        | 설명                            |
| ----------- | ------------------------------- |
| 처리 시간   | 순차 처리로 전체 시간 증가 가능 |
| 관리 복잡도 | 배치 상태 추적 필요             |

### 구현 방식

**Option A: 워크플로우 단위 분할**

```json
{
  "workflow_id": "hwahae-batch-001",
  "params": {
    "batch_index": 0,
    "batch_size": 100,
    "total_products": 1400
  }
}
```

**Option B: Job 내부 배치 처리**

```typescript
// 기존: 전체 상품 처리
products.forEach((p) => process(p));

// 개선: 배치 단위 처리 + checkpoint
for (let i = resumeIndex; i < products.length; i += batchSize) {
  const batch = products.slice(i, i + batchSize);
  await processBatch(batch);
  await saveCheckpoint(i + batchSize); // Redis에 진행 상황 저장
}
```

**Option C: 스케줄러에서 배치 Job 생성**

```typescript
// scheduler.ts
const products = await fetchAllProducts(platform);
const BATCH_SIZE = 50;
const batches = chunk(products, BATCH_SIZE);

for (const batch of batches) {
  await enqueueJob({
    workflow_id: "platform-update",
    params: { product_ids: batch.map((p) => p.id) },
  });
}
```

---

## 권장 접근법

### 단기: 아이디어 2 구현

**1단계: 배치 Job 분할**

```
기존: 1 Job = 1400개 상품
개선: 28 Jobs = 50개 × 28 배치
```

**2단계: Checkpoint 메커니즘**

```typescript
// Redis 키
workflow:checkpoint:{job_id}:{node_id}
value: { processed_index: 500, total: 1400 }
```

**3단계: Resume 로직**

```typescript
// ScanProductNode 또는 신규 BatchScanNode
const checkpoint = await getCheckpoint(job_id, node_id);
const startIndex = checkpoint?.processed_index || 0;
```

### 중장기: K8s 도입 검토

**조건:**

- 상품 수 2000개 이상 안정화
- 플랫폼 10개 이상 확장
- 병렬 처리 필요성 증가

**순서:**

1. k3s 설치 (단일 노드)
2. 기존 Docker 이미지 재사용
3. HPA 적용 (큐 길이 기반)

---

## 실현 가능성 요약

| 방식                          | 실현성     | 복잡도   | 권장       |
| ----------------------------- | ---------- | -------- | ---------- |
| Docker Compose 스케일링       | ⭐⭐⭐     | 낮음     | △          |
| K8s 동적 스케일링             | ⭐⭐⭐⭐   | 높음     | 중장기     |
| **고정 컨테이너 + 배치 분할** | ⭐⭐⭐⭐⭐ | **낮음** | **✓ 즉시** |

---

## 최종 결정 사항

| 항목      | 선택                                        |
| --------- | ------------------------------------------- |
| 배치 크기 | **50개** (안전 우선)                        |
| 실패 정책 | **Skip + 로그** (실패 상품 스킵, 목록 기록) |
| 구현 방식 | **Option C: 스케줄러 배치 분할**            |

---

## 구현 계획

### 1단계: 스케줄러 배치 분할 로직

**파일**: `src/scheduler.ts` 또는 신규 `src/services/BatchJobCreatorService.ts`

```typescript
// BatchJobCreatorService.ts
async createBatchJobs(platform: PlatformId): Promise<string[]> {
  const products = await fetchAllProducts(platform);
  const BATCH_SIZE = 50;
  const batches = chunk(products, BATCH_SIZE);
  const jobIds: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const job = await this.workflowService.createJob({
      workflow_id: `${platform}-update-v2`,
      platform,
      params: {
        batch_index: i,
        batch_total: batches.length,
        product_ids: batches[i].map(p => p.id)
      }
    });
    jobIds.push(job.job_id);
  }
  return jobIds;
}
```

### 2단계: 실패 로깅 메커니즘

**파일**: `src/strategies/validation/ScanProductNode.ts` 수정

```typescript
// 실패 상품 스킵 + 로그
const results: ScanResult[] = [];
const failures: FailedProduct[] = [];

for (const productId of productIds) {
  try {
    const result = await scanner.scan(productId);
    results.push({ productId, data: result, success: true });
  } catch (error) {
    failures.push({ productId, error: error.message, timestamp: new Date() });
    logger.warn({ productId, error }, "상품 스캔 실패 - 스킵");
  }
}

// 실패 목록 저장
if (failures.length > 0) {
  await saveFailedProducts(job_id, failures);
}
```

### 3단계: 실패 목록 저장

**파일**: 신규 `src/repositories/FailedProductRepository.ts`

```typescript
// Redis 또는 JSONL 파일에 실패 목록 저장
export class FailedProductRepository {
  async saveFailures(jobId: string, failures: FailedProduct[]): Promise<void> {
    const key = `workflow:failures:${jobId}`;
    await this.redis.rpush(key, ...failures.map((f) => JSON.stringify(f)));
    await this.redis.expire(key, 7 * 24 * 60 * 60); // 7일 보관
  }

  async getFailures(jobId: string): Promise<FailedProduct[]> {
    const key = `workflow:failures:${jobId}`;
    const items = await this.redis.lrange(key, 0, -1);
    return items.map((item) => JSON.parse(item));
  }
}
```

### 4단계: 배치 진행 상황 추적

**파일**: `src/repositories/RedisWorkflowRepository.ts` 확장

```typescript
// 배치 그룹 진행 상황
async updateBatchProgress(batchGroupId: string, completed: number, total: number): Promise<void> {
  await this.redis.hset(`workflow:batch-group:${batchGroupId}`, {
    completed,
    total,
    progress: (completed / total * 100).toFixed(2),
    updated_at: new Date().toISOString()
  });
}
```

---

## 수정 파일 목록

| 파일                                                 | 변경 내용               |
| ---------------------------------------------------- | ----------------------- |
| `src/scheduler.ts`                                   | 배치 Job 생성 로직 호출 |
| `src/services/BatchJobCreatorService.ts` (신규)      | 50개씩 배치 분할        |
| `src/strategies/validation/ScanProductNode.ts`       | Skip + 로그 로직        |
| `src/repositories/FailedProductRepository.ts` (신규) | 실패 목록 저장          |
| `src/repositories/RedisWorkflowRepository.ts`        | 배치 진행 상황          |

---

## 예상 결과

| 항목        | 기존     | 개선              |
| ----------- | -------- | ----------------- |
| 1400개 처리 | 1 Job    | 28 Jobs (50개×28) |
| 에러 복구   | 처음부터 | 해당 배치만 스킵  |
| 실패 추적   | 불가     | Redis/JSONL 기록  |
| Resume      | 불가     | 다음 배치부터     |

---

## 향후 확장 (K8s)

아이디어 1 (동적 스케일링)은 상품 수 2000개 이상, 플랫폼 10개 이상 시 재검토:

1. k3s 설치 (단일 노드 가능)
2. `PlatformLock` → `BatchLock`으로 변경 (병렬 처리 지원)
3. HPA 적용 (Redis 큐 길이 기반)

---

## 관련 문서

- [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) - 시스템 아키텍처
- [03-DATA-FLOW.md](./03-DATA-FLOW.md) - 데이터 흐름
- [06-TECH-DEBT.md](./06-TECH-DEBT.md) - 기술 부채

---

## 최종 수정일

2026-01-02

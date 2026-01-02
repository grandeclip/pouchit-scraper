# 데이터 흐름

## 주요 플로우

1. **API 요청 → Job 생성**
2. **Worker → Job 실행**
3. **스캔 플로우**
4. **검색 플로우**

---

## 1. API 요청 → Job 생성

### 시퀀스

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Router
    participant Ctrl as Controller
    participant Svc as WorkflowExecutionService
    participant Repo as RedisWorkflowRepository
    participant Redis as Redis Queue

    C->>R: POST /api/v2/workflows/execute
    R->>Ctrl: executeWorkflow()
    Ctrl->>Svc: createJob()
    Svc->>Svc: WorkflowLoaderService.load()
    Svc->>Svc: Job 객체 생성 (UUID)
    Svc->>Repo: enqueueJob(platform, job)
    Repo->>Redis: ZADD + HSET
    Redis-->>C: { job_id }
```

### 데이터 변환

```typescript
// Request
{
  workflow_id: "hwahae-update-v2",
  platform: "hwahae",
  params: { product_set_id: "xxx" }
}

// → Job (내부)
{
  job_id: "uuid-xxx",
  workflow_id: "hwahae-update-v2",
  platform: "hwahae",
  status: "PENDING",
  params: { product_set_id: "xxx" },
  created_at: "2024-01-01T00:00:00+09:00"
}

// → Redis 저장
ZADD workflow:queue:platform:hwahae {priority} {job_id}
HSET workflow:job:{job_id} {...job}
```

---

## 2. Worker → Job 실행

### 시퀀스

```mermaid
sequenceDiagram
    participant W as Worker
    participant Repo as RedisRepository
    participant Lock as PlatformLock
    participant Svc as WorkflowExecutionService
    participant Loader as WorkflowLoader
    participant Exec as ParallelExecutor
    participant NS as NodeStrategy

    loop Polling (5초 간격)
        W->>Repo: getQueueLength(platform)
        alt Queue 비어있음
            W->>W: sleep(POLL_INTERVAL)
        else Job 있음
            W->>Lock: acquire()
            alt Lock 실패
                W->>W: sleep(POLL_INTERVAL)
            else Lock 성공
                W->>Repo: dequeueJobByPlatform()
                Repo-->>W: Job
            end
        end
    end

    W->>Lock: setRunningJob(job_id)
    W->>Svc: executeJob(job)
    Svc->>Loader: load(workflow_id)
    Loader-->>Svc: Workflow JSON

    Svc->>Exec: execute(workflow, job)

    loop Each Node (DAG)
        Exec->>NS: execute(context)
        NS-->>Exec: NodeResult
        Exec->>Exec: sharedState 업데이트
    end

    Exec-->>Svc: Complete
    W->>Lock: clearRunningJob()
    W->>Lock: release()
```

### 노드 간 데이터 전달

```mermaid
flowchart LR
    subgraph Node1["Node 1: fetch"]
        A1[input: {}]
        A2["output: { product }"]
    end

    subgraph Node2["Node 2: scan"]
        B1["input: { product }"]
        B2["output: { scanned }"]
    end

    subgraph Node3["Node 3: save"]
        C1["input: { scanned }"]
        C2["output: { saved: true }"]
    end

    A2 --> B1
    B2 --> C1
```

---

## 3. 스캔 플로우

### 시퀀스

```mermaid
sequenceDiagram
    participant Node as ScanProductNode
    participant Reg as ScannerRegistry
    participant Fact as ScannerFactory
    participant Scan as BaseScanner
    participant Ext as Extractor

    Node->>Reg: getScanner(platform)
    alt Cache Hit
        Reg-->>Node: IScanner
    else Cache Miss
        Reg->>Fact: createScanner(platform, strategyId)
        Fact->>Fact: ConfigLoader.loadConfig()
        Fact->>Fact: 전략 선택 (priority)
        Fact-->>Reg: IScanner
        Reg->>Reg: Cache에 저장
        Reg-->>Node: IScanner
    end

    Node->>Scan: scan(productId)
    Scan->>Scan: initialize()
    Scan->>Scan: extractData(productId)
    Note over Scan: HTTP fetch 또는<br/>Playwright DOM 추출
    Scan->>Ext: extract(rawData)
    Ext-->>Scan: ProductData
    Scan->>Scan: parseData(productData)
    Scan->>Scan: cleanup()
    Scan-->>Node: IProduct
```

### 데이터 변환

```mermaid
flowchart TB
    subgraph Raw["Raw API Response"]
        R1["id: 12345"]
        R2["goodsName: 상품명"]
        R3["salePrice: 30000"]
        R4["saleStatus: SELNG"]
    end

    subgraph Product["HwahaeProduct"]
        P1["id: '12345'"]
        P2["productName: '상품명'"]
        P3["price: 30000"]
        P4["saleStatus: 'on_sale'"]
        P5["getDiscountRate(): 14.28"]
    end

    Raw -->|Extractor + fromProductData| Product
```

### 전략별 추출 방식

| 플랫폼   | 1차 전략      | 2차 전략   | 특징                   |
| -------- | ------------- | ---------- | ---------------------- |
| 화해     | REST API      | Playwright | API 우선, DOM fallback |
| 올리브영 | Playwright    | -          | DOM 셀렉터             |
| 무신사   | HTTP API      | -          | 가장 빠름 (~1초)       |
| 지그재그 | GraphQL       | Playwright | 첫구매 쿠폰 처리       |
| 에이블리 | Network API   | Meta Tag   | API 캡처               |
| 마켓컬리 | **NEXT_DATA** | -          | Next.js SSR            |

---

## 4. 검색 플로우

### 동기 검색

```mermaid
sequenceDiagram
    participant C as Client
    participant Ctrl as SearchController
    participant US as UnifiedSearchService
    participant SR as SearcherRegistry
    participant S1 as HwahaeSearcher
    participant S2 as OliveyoungSearcher
    participant SN as ...Searcher

    C->>Ctrl: POST /api/v2/search
    Ctrl->>US: search(query, platforms)

    par 병렬 실행
        US->>SR: getSearcher(hwahae)
        SR-->>US: HwahaeSearcher
        US->>S1: search(query)
    and
        US->>SR: getSearcher(oliveyoung)
        SR-->>US: OliveyoungSearcher
        US->>S2: search(query)
    and
        US->>SN: search(query)
    end

    S1-->>US: SearchProduct[]
    S2-->>US: SearchProduct[]
    SN-->>US: SearchProduct[]

    US->>US: 결과 병합 및 정렬
    US-->>C: SearchProduct[]
```

### 비동기 검색 (Queue 기반)

```mermaid
sequenceDiagram
    participant C as Client
    participant Ctrl as SearchController
    participant QS as SearchQueueService
    participant Redis as Redis Queue
    participant SW as SearchWorker
    participant US as UnifiedSearchService

    C->>Ctrl: POST /api/v2/search/async
    Ctrl->>QS: enqueue(query)
    QS->>Redis: ZADD search:queue
    Redis-->>C: { search_id }

    Note over SW: Worker Polling

    SW->>Redis: dequeue()
    Redis-->>SW: SearchRequest
    SW->>US: search(query)
    US-->>SW: SearchProduct[]
    SW->>Redis: saveResult(search_id, result)

    C->>Ctrl: GET /api/v2/search/{searchId}
    Ctrl->>Redis: getResult(search_id)
    Redis-->>C: SearchProduct[]
```

---

## 5. 워크플로우 JSON 구조

### 예시: hwahae-update-v2.json

```json
{
  "workflow_id": "hwahae-update-v2",
  "name": "Hwahae Update",
  "version": "2.0.0",
  "start_node": "fetch",
  "nodes": {
    "fetch": { "type": "fetch_product", "next_nodes": ["scan"] },
    "scan": { "type": "scan_product", "next_nodes": ["validate"] },
    "validate": { "type": "validate_product", "next_nodes": ["compare"] },
    "compare": { "type": "compare_product", "next_nodes": ["save"] },
    "save": { "type": "save_result", "next_nodes": ["update"] },
    "update": { "type": "update_product_set", "next_nodes": ["notify"] },
    "notify": { "type": "notify_result", "next_nodes": [] }
  }
}
```

### DAG 실행 순서

```mermaid
flowchart LR
    fetch --> scan --> validate --> compare --> save --> update --> notify
```

### 병렬 분기 예시

```mermaid
flowchart TB
    fetch --> scan_hwahae
    fetch --> scan_oliveyoung

    scan_hwahae --> merge
    scan_oliveyoung --> merge

    merge --> end_node
```

---

## 6. 타입 변환 맵

### 상품 데이터

```mermaid
flowchart TB
    A["Raw API/DOM Data"] -->|Extractor| B["ProductData (중간)"]
    B -->|fromProductData| C["IProduct 구현체"]
    C -->|Mapper| D["ProductSetEntity"]
    D -->|Supabase| E[(Database)]
```

### 워크플로우 데이터

```mermaid
flowchart TB
    A["Workflow JSON"] -->|WorkflowLoaderService| B["Workflow (도메인)"]
    B -->|createJob| C["Job (실행 단위)"]
    C -->|execute| D["NodeContext"]
    D -->|NodeStrategy| E["NodeResult"]
    E -->|누적| F["Job.result"]
```

---

## 7. Redis 데이터 구조

### Job Queue (Sorted Set)

```mermaid
flowchart LR
    subgraph Queue["workflow:queue:platform:{platform}"]
        direction TB
        J1["job_id_1 (score: 20)"]
        J2["job_id_2 (score: 10)"]
        J3["job_id_3 (score: 5)"]
    end

    ZADD -->|추가| Queue
    ZPOPMIN -->|우선순위 높은 것| J3
```

### Job 데이터 (Hash)

```
workflow:job:{jobId}
  ├─ job_id
  ├─ workflow_id
  ├─ platform
  ├─ status (PENDING|RUNNING|COMPLETED|FAILED)
  ├─ params (JSON)
  ├─ result (JSON)
  ├─ created_at
  ├─ started_at
  └─ completed_at
```

### Platform Lock

```mermaid
stateDiagram-v2
    [*] --> Available

    Available --> Locked: SET NX EX 300
    Locked --> Available: DEL 또는 TTL 만료

    note right of Locked
        workflow:lock:platform:{platform}
        값: timestamp
        TTL: 5분
    end note
```

---

## 관련 문서

- [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) - 시스템 아키텍처
- [02-DESIGN-PATTERNS.md](./02-DESIGN-PATTERNS.md) - 디자인 패턴
- [04-MODULES.md](./04-MODULES.md) - 모듈 상세

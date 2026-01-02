# 시스템 아키텍처

## 개요

| 항목            | 수치  |
| --------------- | ----- |
| TypeScript 파일 | 283개 |
| Docker 서비스   | 12개  |
| 워크플로우      | 23개  |
| 플랫폼          | 6개   |

## 레이어 구조

```mermaid
flowchart TB
    subgraph L1["1. API Layer"]
        A["routes/v2/* → controllers/* → middleware/*"]
    end

    subgraph L2["2. Service Layer - Facade"]
        B["WorkflowExecutionService, ProductSearchService, ScannerRegistry"]
    end

    subgraph L3["3. Workflow Engine - DAG"]
        C["strategies/ - 30+ Node, ParallelExecutor"]
    end

    subgraph L4["4. Scanner / Searcher / Extractor"]
        D["Platform-specific implementations - Strategy Pattern"]
    end

    subgraph L5["5. Repository Layer"]
        E["Redis - Queue/State, Supabase - Data"]
    end

    subgraph L6["6. Infrastructure"]
        F["Docker, Multi-Worker Queue, Scheduler, Restarter"]
    end

    L1 --> L2 --> L3 --> L4 --> L5 --> L6
```

## 컨테이너 아키텍처

### 서비스 구성 (12개)

| 카테고리       | 서비스               | 메모리      | 역할                    |
| -------------- | -------------------- | ----------- | ----------------------- |
| API            | product_scanner      | 4GB         | Express API (Port 3989) |
| Browser Worker | worker_oliveyoung    | 4GB+2GB shm | Playwright 기반         |
| Browser Worker | worker_ably          | 4GB+2GB shm | Playwright 기반         |
| Browser Worker | worker_kurly         | 4GB+2GB shm | Playwright 기반         |
| Browser Worker | worker_search        | 4GB+2GB shm | 검색 큐 처리            |
| API Worker     | worker_hwahae        | 2GB         | HTTP API 기반           |
| API Worker     | worker_musinsa       | 2GB         | HTTP API 기반           |
| API Worker     | worker_zigzag        | 2GB         | GraphQL 기반            |
| API Worker     | worker_default       | 2GB         | 기타 플랫폼             |
| API Worker     | worker_alert         | 2GB         | 알림 처리               |
| Scheduler      | scheduler            | 256MB       | 자동 Job 생성           |
| Scheduler      | alert_watcher        | 256MB       | 테이블 모니터링         |
| Scheduler      | daily_sync_scheduler | 32MB        | 일일 동기화             |
| Infra          | redis                | 1GB         | Job Queue               |
| Infra          | restarter            | 64MB        | 컨테이너 관리           |

### 컨테이너 관계

```mermaid
flowchart TB
    subgraph Infra
        Redis[(Redis<br/>Queue)]
    end

    subgraph Containers
        API[product_scanner<br/>API Server]

        subgraph Workers["Workers (9개)"]
            W1[worker_oliveyoung]
            W2[worker_ably]
            W3[worker_kurly]
            W4[worker_hwahae]
            W5[worker_musinsa]
            W6[worker_zigzag]
        end

        subgraph Schedulers["Schedulers (3개)"]
            S1[scheduler]
            S2[alert_watcher]
            S3[daily_sync]
        end
    end

    subgraph External
        Supabase[(Supabase<br/>외부 DB)]
    end

    Redis <--> API
    Redis <--> Workers
    Redis <--> Schedulers

    API --> Supabase
    Workers --> Supabase
```

## 엔트리 포인트

| 파일                          | 역할            | 실행                    |
| ----------------------------- | --------------- | ----------------------- |
| `src/server.ts`               | API 서버        | `npm run dev`           |
| `src/worker.ts`               | 워크플로우 실행 | `npm run worker`        |
| `src/scheduler.ts`            | 자동 스케줄링   | `npm run scheduler`     |
| `src/search-worker.ts`        | 검색 큐 처리    | `npm run search-worker` |
| `src/alert-watcher.ts`        | 알림 감시       | `npm run alert-watcher` |
| `src/daily-sync-scheduler.ts` | 일일 동기화     | cron 기반               |

## 핵심 데이터 흐름

### 1. API 요청 → Job 생성

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
    Svc->>Repo: enqueueJob(platform, job)
    Repo->>Redis: ZADD workflow:queue:platform:{platform}
    Redis-->>C: { job_id }
```

### 2. Worker → Job 실행

```mermaid
sequenceDiagram
    participant W as Worker
    participant Repo as RedisRepository
    participant Lock as PlatformLock
    participant Svc as WorkflowExecutionService
    participant Loader as WorkflowLoader
    participant Exec as ParallelExecutor
    participant Strategy as NodeStrategy

    loop Polling
        W->>Repo: dequeueJobByPlatform()
        Repo-->>W: Job
    end

    W->>Lock: acquire()
    Lock-->>W: locked

    W->>Svc: executeJob(job)
    Svc->>Loader: load(workflow_id)
    Loader-->>Svc: Workflow JSON

    Svc->>Exec: execute(workflow, job)

    loop Each Node
        Exec->>Strategy: execute(context)
        Strategy-->>Exec: NodeResult
    end

    Exec-->>Svc: Complete
    W->>Lock: release()
```

### 3. 스캔 플로우

```mermaid
flowchart LR
    A[ScannerNode] --> B[ScannerRegistry]
    B --> C[ScannerFactory]
    C --> D{Strategy}
    D -->|HTTP| E[HttpScanner]
    D -->|Browser| F[PlaywrightScanner]
    E --> G[Extractor]
    F --> G
    G --> H[IProduct]
```

## Multi-Queue 아키텍처

### Redis 키 패턴

```
workflow:queue:platform:hwahae      # Platform별 Job Queue (Sorted Set)
workflow:queue:platform:oliveyoung
workflow:queue:platform:zigzag
workflow:queue:platform:musinsa
workflow:queue:platform:ably
workflow:queue:platform:kurly
workflow:queue:platform:default
workflow:queue:platform:alert

workflow:job:{jobId}                # Job 데이터 (Hash)
workflow:lock:platform:{platform}   # Platform Lock (SET NX EX)
workflow:running:platform:{platform}# 실행 중 Job 정보

heartbeat:{service}                 # Heartbeat (60초 TTL)
worker:kill:{platform}              # Kill Flag (원격 재시작)
```

### Platform Lock 메커니즘

```mermaid
stateDiagram-v2
    [*] --> CheckQueue: Worker 시작
    CheckQueue --> WaitPoll: Queue 비어있음
    CheckQueue --> TryLock: Job 있음

    WaitPoll --> CheckQueue: Poll Interval

    TryLock --> WaitPoll: Lock 실패
    TryLock --> Dequeue: Lock 성공

    Dequeue --> Execute: Job 획득
    Execute --> Release: 완료
    Release --> CheckQueue: Lock 해제
```

## Graceful Shutdown

```mermaid
flowchart TB
    A[SIGTERM 수신] --> B[새 요청 거부]
    B --> C[진행 중 작업 완료 대기]
    C --> D[리소스 정리]
    D --> E[Browser 종료]
    D --> F[Redis 연결 해제]
    E --> G[프로세스 종료]
    F --> G
```

## 환경 설정

### 핵심 환경변수

| 변수               | 용도               | 기본값     |
| ------------------ | ------------------ | ---------- |
| `WORKER_PLATFORMS` | Worker 담당 플랫폼 | 전체       |
| `POLL_INTERVAL_MS` | 큐 폴링 간격       | 5000       |
| `REDIS_HOST`       | Redis 호스트       | redis      |
| `LOG_LEVEL`        | 로그 레벨          | info       |
| `TZ`               | 타임존             | Asia/Seoul |

## 관련 문서

- [02-DESIGN-PATTERNS.md](./02-DESIGN-PATTERNS.md) - 디자인 패턴
- [03-DATA-FLOW.md](./03-DATA-FLOW.md) - 데이터 흐름 상세
- [04-MODULES.md](./04-MODULES.md) - 모듈 상세

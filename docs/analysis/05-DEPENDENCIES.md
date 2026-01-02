# 의존성 분석

## 레이어별 의존관계

```mermaid
flowchart TB
    subgraph L1["routes/v2/*"]
        R[Express 라우터]
    end

    subgraph L2["controllers/*"]
        C[HTTP 요청/응답 변환]
    end

    subgraph L3["services/*"]
        S[비즈니스 로직 - Facade]
    end

    subgraph L4["Domain Layer"]
        SC[scanners/]
        SR[searchers/]
        ST[strategies/]
        EX[extractors/]
        RP[repositories/]
    end

    subgraph L5["core/*"]
        I[interfaces/]
        D[domain/]
    end

    subgraph L6["Infrastructure"]
        CF[config/]
        UT[utils/]
    end

    L1 --> L2 --> L3 --> L4 --> L5 --> L6
```

---

## 모듈별 의존 관계

### services/

```mermaid
flowchart LR
    WES[WorkflowExecutionService] --> RWR[RedisWorkflowRepository]
    WES --> WLS[WorkflowLoaderService]
    WES --> NSF[NodeStrategyFactory]
    WES --> PL[PlatformLock]

    PSS[ProductSearchService] --> SPR[SupabaseProductRepository]
    PSS --> M[Mapper]

    SR[ScannerRegistry] --> SF[ScannerFactory]
    SR --> IS[IScanner]

    USS[UnifiedSearchService] --> SReg[SearcherRegistry]
```

### scanners/

```mermaid
flowchart TB
    SF[ScannerFactory] --> CL[ConfigLoader]
    SF --> HF[HwahaeScannerFactory]
    SF --> OF[OliveyoungScannerFactory]
    SF --> MF[MusinsaScannerFactory]
    SF --> ZF[ZigzagScannerFactory]
    SF --> AF[AblyScannerFactory]
    SF --> KF[KurlyScannerFactory]

    BS[BaseScanner] --> IE[IExtractor]
    BS --> BP[BrowserPool]

    HS[HttpScanner] --> fetch
    HS --> IE

    PS[PlaywrightScanner] --> playwright
    PS --> BP
    PS --> IE
```

### repositories/

| 모듈                        | 의존 대상             |
| --------------------------- | --------------------- |
| `RedisWorkflowRepository`   | ioredis               |
| `SupabaseProductRepository` | @supabase/supabase-js |
| `PlatformLock`              | ioredis               |

### strategies/

| 모듈                   | 의존 대상                       |
| ---------------------- | ------------------------------- |
| `FetchProductNode`     | SupabaseProductRepository       |
| `ScanProductNode`      | ScannerRegistry                 |
| `ValidateProductNode`  | Validator                       |
| `UpdateProductSetNode` | SupabaseProductUpdateRepository |

---

## 외부 라이브러리

### 핵심 의존성

| 라이브러리                       | 버전  | 용도             |
| -------------------------------- | ----- | ---------------- |
| `express`                        | ^4.x  | HTTP 서버        |
| `playwright-extra`               | ^4.x  | 브라우저 자동화  |
| `puppeteer-extra-plugin-stealth` | ^2.x  | 봇 감지 우회     |
| `@supabase/supabase-js`          | ^2.x  | 데이터베이스     |
| `ioredis`                        | ^5.x  | Redis 클라이언트 |
| `js-yaml`                        | ^4.x  | YAML 파싱        |
| `zod`                            | ^3.x  | 스키마 검증      |
| `pino`                           | ^8.x  | 로깅             |
| `uuid`                           | ^9.x  | UUID 생성        |
| `@google/genai`                  | ^0.x  | LLM (Gemini)     |
| `node-cron`                      | ^3.x  | 스케줄링         |
| `dotenv`                         | ^16.x | 환경변수         |

### 개발 의존성

| 라이브러리   | 용도      |
| ------------ | --------- |
| `typescript` | 타입 체크 |
| `tsx`        | TS 실행   |
| `@types/*`   | 타입 정의 |

---

## 의존성 그래프 (핵심)

```mermaid
flowchart TB
    subgraph Entry["Entry Points"]
        server[server.ts]
        worker[worker.ts]
        scheduler[scheduler.ts]
    end

    subgraph Facade["Facade Layer"]
        WES[WorkflowExecutionService]
    end

    subgraph Core["Core Services"]
        WLS[WorkflowLoaderService]
        RWR[RedisWorkflowRepository]
        NSF[NodeStrategyFactory]
    end

    subgraph Strategies["Node Strategies"]
        FPN[FetchProductNode]
        SPN[ScanProductNode]
        VPN[ValidateProductNode]
    end

    subgraph Scanners["Scanner System"]
        SReg[ScannerRegistry]
        SF[ScannerFactory]
        HS[HttpScanner]
        PS[PlaywrightScanner]
    end

    subgraph External["External Dependencies"]
        Redis[(ioredis)]
        Supabase[(supabase-js)]
        PW[playwright]
    end

    Entry --> Facade
    Facade --> Core
    Core --> Strategies
    Strategies --> Scanners

    RWR --> Redis
    SPN --> Supabase
    PS --> PW
```

---

## 순환 의존성 분석

### 현재 상태

- **순환 의존성 없음** (단방향 의존 구조)

### 의존 방향 규칙

```mermaid
flowchart TB
    A[상위 레이어] -->|허용| B[하위 레이어]
    B -.->|금지| A

    C[같은 레이어 A] -.->|최소화| D[같은 레이어 B]

    E[구현체] -->|허용| F[인터페이스]
```

---

## 결합도 분석

### 높은 결합도 (주의)

| 모듈                       | 결합 대상          | 비고                     |
| -------------------------- | ------------------ | ------------------------ |
| `WorkflowExecutionService` | 5개 모듈           | Facade 특성상 불가피     |
| `ScannerFactory`           | 6개 플랫폼 Factory | 플랫폼 추가 시 수정 필요 |

### 낮은 결합도 (양호)

| 모듈                   | 비고            |
| ---------------------- | --------------- |
| `IScanner` 구현체      | 인터페이스 의존 |
| `INodeStrategy` 구현체 | 인터페이스 의존 |
| `Repository` 구현체    | 인터페이스 의존 |

---

## 개선 포인트

### 1. ScannerFactory 동적 로딩

```mermaid
flowchart LR
    subgraph Current["현재"]
        SF1[ScannerFactory] -->|import| HF[HwahaeScannerFactory]
        SF1 -->|import| OF[OliveyoungScannerFactory]
    end

    subgraph Improved["개선"]
        SF2[ScannerFactory] -->|동적 import| Config[platforms/*.yaml]
        Config -->|자동 로드| Factories[플랫폼 Factories]
    end
```

### 2. ConfigLoader 의존성 주입

현재: Singleton 직접 호출
개선: 생성자 주입

### 3. Repository 인터페이스 통일

현재: 일부 Repository는 인터페이스 없음
개선: 모든 Repository에 인터페이스 정의

---

## 관련 문서

- [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) - 시스템 아키텍처
- [04-MODULES.md](./04-MODULES.md) - 모듈 상세
- [06-TECH-DEBT.md](./06-TECH-DEBT.md) - 기술 부채

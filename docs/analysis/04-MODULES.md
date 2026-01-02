# 모듈 상세

## 디렉토리 구조

```
src/
├── config/           # 설정 로더 및 YAML
├── controllers/      # HTTP 컨트롤러
├── core/             # 도메인 모델 & 인터페이스
├── extractors/       # 데이터 추출기
├── llm/              # LLM 통합 (Gemini)
├── mappers/          # 데이터 변환
├── middleware/       # Express 미들웨어
├── repositories/     # 데이터 접근 계층
├── routes/           # API 라우터
├── scanners/         # 상품 스캐너
├── scrapers/         # 레거시 스크래퍼
├── searchers/        # 상품 검색
├── services/         # 비즈니스 로직
├── strategies/       # 워크플로우 노드 전략
├── types/            # 타입 정의
├── utils/            # 유틸리티
├── validators/       # 검증
└── workflow/         # 워크플로우 엔진
```

---

## config/

### 책임

YAML 기반 플랫폼 설정 로드 및 캐싱

### 핵심 파일

| 파일               | 역할                      |
| ------------------ | ------------------------- |
| `ConfigLoader.ts`  | Singleton, YAML 로드/캐싱 |
| `logger.ts`        | Pino 로거 설정            |
| `constants.ts`     | 앱 상수                   |
| `platforms/*.yaml` | 플랫폼별 설정 (6개)       |

### 패턴

- **Singleton**: `ConfigLoader.getInstance()`
- **Cache**: YAML 메모리 캐싱

---

## core/

### 책임

도메인 모델 및 인터페이스 정의

### domain/

| 파일                   | 역할                  |
| ---------------------- | --------------------- |
| `PlatformId.ts`        | 플랫폼 타입 정의      |
| `HwahaeProduct.ts`     | 화해 상품 모델        |
| `OliveyoungProduct.ts` | 올리브영 상품 모델    |
| `MusinsaProduct.ts`    | 무신사 상품 모델      |
| `ZigzagProduct.ts`     | 지그재그 상품 모델    |
| `AblyProduct.ts`       | 에이블리 상품 모델    |
| `KurlyProduct.ts`      | 마켓컬리 상품 모델    |
| `Workflow.ts`          | Job, Node, Task 모델  |
| `ProductSet.ts`        | 멀티 플랫폼 상품 세트 |
| `StrategyConfig.ts`    | 스캔 전략 설정        |

### interfaces/

| 파일                    | 역할                         |
| ----------------------- | ---------------------------- |
| `IProduct.ts`           | 상품 인터페이스 (SaleStatus) |
| `IScanner.ts`           | 스캐너 인터페이스            |
| `IScanner.generic.ts`   | 제네릭 스캐너                |
| `IExtractor.ts`         | 추출기 인터페이스            |
| `INodeStrategy.ts`      | 워크플로우 노드 전략         |
| `IProductRepository.ts` | 상품 저장소                  |

---

## services/

### 책임

비즈니스 로직 조율 (Facade)

### 핵심 파일

| 파일                          | 줄수 | 역할                   |
| ----------------------------- | ---- | ---------------------- |
| `WorkflowExecutionService.ts` | 867  | 워크플로우 실행 Facade |
| `WorkflowLoaderService.ts`    | 241  | JSON 워크플로우 로드   |
| `ScannerRegistry.ts`          | 202  | 스캐너 인스턴스 관리   |
| `ProductSearchService.ts`     | 146  | 상품 검색 Facade       |
| `UnifiedSearchService.ts`     | 310  | 6개 플랫폼 통합 검색   |
| `NodeStrategyFactory.ts`      | 84   | 노드 전략 생성         |
| `SearcherRegistry.ts`         | 124  | 검색기 인스턴스 관리   |

### 패턴

- **Facade**: `WorkflowExecutionService`, `ProductSearchService`
- **Registry/Singleton**: `ScannerRegistry`, `SearcherRegistry`
- **Factory**: `NodeStrategyFactory`

---

## repositories/

### 책임

데이터 접근 로직 캡슐화

### Redis 저장소

| 파일                             | 역할                  |
| -------------------------------- | --------------------- |
| `RedisWorkflowRepository.ts`     | Job Queue 관리        |
| `RedisSearchRepository.ts`       | 검색 결과 캐시        |
| `PlatformLock.ts`                | 분산 Lock (SET NX EX) |
| `SchedulerStateRepository.ts`    | 스케줄러 상태         |
| `AlertWatcherStateRepository.ts` | 알림 감시 상태        |
| `DailySyncStateRepository.ts`    | 일일 동기화 상태      |

### Supabase 저장소

| 파일                                  | 역할           |
| ------------------------------------- | -------------- |
| `SupabaseProductRepository.ts`        | 상품 세트 CRUD |
| `SupabaseProductUpdateRepository.ts`  | 상품 업데이트  |
| `SupabaseProductHistoryRepository.ts` | 가격 이력      |
| `SupabaseProductNameRepository.ts`    | 상품명 관리    |
| `SupabasePlatformRepository.ts`       | 플랫폼 정보    |
| `SupabaseBrandRepository.ts`          | 브랜드 정보    |
| `SupabaseProductsRepository.ts`       | 개별 상품      |

### 패턴

- **Repository**: 데이터 접근 추상화
- **Singleton**: 클라이언트 인스턴스 공유

---

## scanners/

### 책임

플랫폼별 상품 정보 스캔

### 구조

```
scanners/
├── base/
│   ├── BaseScanner.ts          # Template Method
│   ├── BaseScanner.generic.ts  # 제네릭 버전
│   ├── ScannerFactory.ts       # 전역 Factory
│   ├── BrowserPool.ts          # Object Pool
│   └── IBrowserPool.ts
├── platform/
│   └── PlatformScanner.ts      # 플랫폼 추상 스캐너
├── platforms/
│   ├── hwahae/                 # 화해 Factory
│   ├── oliveyoung/             # 올리브영 Factory
│   ├── musinsa/                # 무신사 Factory
│   ├── zigzag/                 # 지그재그 Factory
│   ├── ably/                   # 에이블리 Factory
│   └── kurly/                  # 마켓컬리 Factory
└── strategies/
    ├── HttpScanner.ts          # HTTP API 스캐너
    └── PlaywrightScanner.ts    # Playwright 스캐너
```

### 패턴

- **Strategy**: `HttpScanner`, `PlaywrightScanner`
- **Factory**: `ScannerFactory`, 플랫폼별 Factory
- **Template Method**: `BaseScanner.scan()`
- **Object Pool**: `BrowserPool`

---

## extractors/

### 책임

Raw 데이터 → 도메인 모델 변환

### 구조

```
extractors/
├── base/
│   └── IProductExtractor.ts
├── common/
│   └── ExtractorUtils.ts
├── hwahae/
│   ├── HwahaeApiExtractor.ts
│   └── HwahaeDomExtractor.ts
├── oliveyoung/
│   ├── OliveyoungDomExtractor.ts
│   ├── OliveyoungApiExtractor.ts
│   └── OliveyoungGiftExtractor.ts
├── musinsa/
│   ├── MusinsaApiExtractor.ts
│   └── MusinsaDomExtractor.ts
├── zigzag/
│   ├── ZigzagGraphQLExtractor.ts
│   ├── ZigzagDomExtractor.ts
│   └── ZigzagNetworkExtractor.ts
├── ably/
│   ├── AblyNetworkExtractor.ts
│   └── AblyMetaExtractor.ts
└── kurly/
    ├── KurlyNextDataExtractor.ts
    └── KurlyApiExtractor.ts
```

### 패턴

- **Strategy**: 플랫폼/방식별 Extractor
- **Factory**: `ExtractorFactory`

---

## strategies/

### 책임

워크플로우 노드 실행 전략

### 구조

```
strategies/
├── validation/               # 상품 검증
│   ├── FetchProductNode.ts
│   ├── ScanProductNode.ts
│   ├── ValidateProductNode.ts
│   ├── CompareProductNode.ts
│   ├── SaveResultNode.ts
│   ├── UpdateProductSetNode.ts
│   ├── NotifyResultNode.ts
│   └── platform/            # 플랫폼별 (6개)
├── extract/                 # 상품 추출
│   ├── ExtractProductNode.ts
│   ├── ExtractUrlNode.ts
│   └── ScanProductIdNode.ts
├── update/                  # 상품 업데이트
│   └── UpdateProductNode.ts
├── daily-sync/              # 일일 동기화
│   ├── FetchPlanningProductsNode.ts
│   └── EnqueueValidationJobsNode.ts
├── monitor/                 # 모니터링
│   ├── CollaboBannerMonitorNode.ts
│   ├── PickSectionsMonitorNode.ts
│   └── VotesMonitorNode.ts
└── api-capture/             # API 캡처
    └── ApiCaptureNode.ts
```

### 패턴

- **Command**: `INodeStrategy.execute()`
- **Strategy**: 노드 타입별 구현

---

## searchers/

### 책임

플랫폼별 상품 검색

### 구조

```
searchers/
├── base/
│   └── BaseSearcher.ts
├── impl/
│   └── SearcherImpl.ts
└── platforms/
    ├── HwahaeSearcher.ts
    ├── OliveyoungSearcher.ts
    ├── MusinsaSearcher.ts
    ├── ZigzagSearcher.ts
    ├── AblySearcher.ts
    └── KurlySearcher.ts
```

### 패턴

- **Strategy**: 플랫폼별 Searcher
- **Template Method**: `BaseSearcher`

---

## llm/

### 책임

LLM 기반 상품 라벨링/분류

### 구조

```
llm/
├── GeminiApiClient.ts           # REST API 클라이언트
├── GoogleGenAIClient.ts         # SDK 클라이언트
├── ProductLabelingService.ts    # 라벨링 파이프라인
├── ProductSetParsingService.ts  # 세트 파싱
├── ProductDescriptionService.ts # 설명 생성
├── ProductFilteringService.ts   # 필터링
├── schemas/                     # Zod 스키마
├── prompts/                     # 프롬프트 템플릿
├── postprocessors/              # 후처리
└── data/
    └── cosmeticCategories.ts    # 카테고리 분류
```

---

## routes/v2/

### 책임

API 엔드포인트 정의

### 파일

| 파일                  | 엔드포인트                 |
| --------------------- | -------------------------- |
| `workflows.router.ts` | POST /workflows/execute    |
| `jobs.router.ts`      | GET /workflows/jobs/:jobId |
| `products.router.ts`  | POST /products/extract-\*  |
| `search.router.ts`    | POST /search               |
| `scheduler.router.ts` | GET/POST /scheduler/\*     |
| `system.router.ts`    | GET/POST /system/\*        |
| `llm.router.ts`       | POST /llm/\*               |
| `workers.router.ts`   | GET /workers/status        |

---

## workflow/

### 책임

DAG 기반 워크플로우 실행 엔진

### 파일

| 파일                         | 역할          |
| ---------------------------- | ------------- |
| `engine/ParallelExecutor.ts` | DAG 병렬 실행 |

### 특징

- `next_nodes: string[]` 배열로 DAG 구조
- 병렬/순차 실행 모두 지원

---

## 파일 수 통계

| 디렉토리     | 파일 수 |
| ------------ | ------- |
| config       | 15      |
| controllers  | 8       |
| core         | 37      |
| extractors   | 20      |
| llm          | 18      |
| mappers      | 8       |
| middleware   | 4       |
| repositories | 16      |
| routes       | 12      |
| scanners     | 35      |
| scrapers     | 12      |
| searchers    | 15      |
| services     | 20      |
| strategies   | 45      |
| types        | 5       |
| utils        | 18      |
| validators   | 6       |
| workflow     | 4       |
| **총계**     | **283** |

---

## 관련 문서

- [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) - 시스템 아키텍처
- [02-DESIGN-PATTERNS.md](./02-DESIGN-PATTERNS.md) - 디자인 패턴
- [05-DEPENDENCIES.md](./05-DEPENDENCIES.md) - 의존성 그래프

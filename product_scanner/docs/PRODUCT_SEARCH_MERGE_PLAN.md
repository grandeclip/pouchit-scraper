# Product Search → Product Scanner 통합 리팩터링 계획

## 개요

`product_search` 모듈을 `product_scanner`에 통합하여 단일 모듈로 관리하는 리팩터링 계획.

### 목적

- 코드 중복 제거 (Playwright, YAML 설정 등)
- 인프라 통합 (BrowserPool, Docker 등)
- 유지보수성 향상

### 브랜치

```text
refactor/merge-product-search-into-scanner
```

---

## ⚠️ 핵심 설계 변경: API-First 전략

### 결정 사항

**DOM 파싱 대신 API 응답 인터셉트 방식 채택** (기존 Scanner 패턴 활용)

| 항목            | 기존 계획 (DOM 파싱) | 신규 전략 (API-First) |
| --------------- | -------------------- | --------------------- |
| **데이터 추출** | CSS 셀렉터 기반      | API 응답 인터셉트     |
| **안정성**      | 셀렉터 변경 취약     | JSON 구조 안정        |
| **속도**        | DOM 렌더링 대기      | API 직접 호출         |
| **설정**        | YAML 네비게이션      | YAML API 설정         |

### 플랫폼별 전략

| 플랫폼     | API 타입 | Playwright 필요 | 전략                                        |
| ---------- | -------- | --------------- | ------------------------------------------- |
| **Zigzag** | GraphQL  | ❌              | fetch 직접 호출 (ZigzagGraphQLScanner 패턴) |
| OliveYoung | REST     | ✅              | BrowserPool + API Intercept                 |
| Musinsa    | REST     | ✅              | BrowserPool + API Intercept                 |
| Ably       | REST     | ✅              | BrowserPool + API Intercept                 |
| Kurly      | REST     | ✅              | BrowserPool + API Intercept                 |
| **Hwahae** | N/A      | ✅              | BrowserPool + DOM 파싱 (API 없음)           |

### 기존 Scanner 패턴 재사용

| 참조 클래스              | 용도                      |
| ------------------------ | ------------------------- |
| `ZigzagGraphQLScanner`   | GraphQL 직접 호출 패턴    |
| `BaseScanner.generic.ts` | Template Method 패턴      |
| `ScannerRegistry`        | Singleton + Registry 패턴 |
| `ScannerFactory`         | Factory 패턴              |
| `BrowserPool`            | 브라우저 인스턴스 관리    |

---

## 1. 아키텍처 설계

### 1.1 디렉토리 구조

```text
product_scanner/
├── src/
│   ├── config/
│   │   └── search/                      # 신규: Search YAML 설정
│   │       ├── zigzag.yaml
│   │       ├── oliveyoung.yaml
│   │       ├── musinsa.yaml
│   │       ├── ably.yaml
│   │       ├── kurly.yaml
│   │       └── hwahae.yaml
│   │
│   ├── core/
│   │   ├── domain/
│   │   │   └── search/                  # 신규: Search 도메인
│   │   │       ├── SearchProduct.ts     # 검색 결과 Product
│   │   │       └── SearchConfig.ts      # Search YAML 스키마
│   │   └── interfaces/
│   │       └── search/                  # 신규: Search 인터페이스
│   │           └── ISearcher.ts
│   │
│   ├── searchers/                       # 신규: Searcher 모듈
│   │   ├── base/
│   │   │   ├── BaseSearcher.ts          # Template Method
│   │   │   └── SearcherFactory.ts       # Factory
│   │   ├── impl/
│   │   │   ├── ZigzagGraphQLSearcher.ts # GraphQL 직접 (fetch)
│   │   │   ├── OliveyoungApiSearcher.ts # Playwright + API Intercept
│   │   │   ├── MusinsaApiSearcher.ts
│   │   │   ├── AblyApiSearcher.ts
│   │   │   ├── KurlyApiSearcher.ts
│   │   │   └── HwahaeDomSearcher.ts     # DOM 파싱 (API 없음)
│   │   └── SearcherRegistry.ts          # Singleton Registry
│   │
│   ├── services/
│   │   └── search/                      # 신규: Search 서비스
│   │       └── ProductSearchService.ts  # Facade
│   │
│   ├── routes/
│   │   └── v2/
│   │       └── search.ts                # 신규: Search API 라우트
│   │
│   └── workers/
│       └── searchWorker.ts              # 신규: Search Worker
│
└── docker/
    └── docker-compose.dev.yml           # worker_search 추가
```

### 1.2 클래스 다이어그램

```text
┌─────────────────────────────────────────────────────────────┐
│                      ISearcher<T>                           │
│  + search(request: SearchRequest): Promise<SearchProduct[]>│
│  + cleanup(): Promise<void>                                 │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ implements
┌─────────────────────────────────────────────────────────────┐
│                    BaseSearcher<TRaw, TConfig>              │
│  - config: TConfig                                          │
│  - strategy: SearchStrategyConfig                           │
│  + search(request): Promise<SearchProduct[]>  [Template]    │
│  # doSearch(request): Promise<TRaw>           [Abstract]    │
│  # parseResults(raw: TRaw): SearchProduct[]   [Abstract]    │
│  # cleanup(): Promise<void>                   [Abstract]    │
└─────────────────────────────────────────────────────────────┘
           ▲                    ▲                    ▲
           │                    │                    │
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ZigzagGraphQL     │ │PlaywrightApi     │ │HwahaeDom         │
│Searcher          │ │Searcher          │ │Searcher          │
│                  │ │                  │ │                  │
│fetch() 직접 호출  │ │BrowserPool +     │ │BrowserPool +     │
│GraphQL Query     │ │API Intercept     │ │DOM 파싱          │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 1.3 YAML 설정 구조

```yaml
# config/search/zigzag.yaml
platform: zigzag
name: "지그재그"
baseUrl: "https://zigzag.kr"

# Search 전략 (Strategy Pattern)
strategies:
  - id: "graphql"
    type: "graphql"
    priority: 1
    description: "GraphQL 검색 API (fetch 직접 호출)"
    graphql:
      endpoint: "https://api.zigzag.kr/api/2/graphql/GetSearchResult"
      method: POST
      headers:
        Content-Type: "application/json"
        Origin: "https://zigzag.kr"
        Referer: "https://zigzag.kr/"
      query: |
        query GetSearchResult($input: SearchResultInput!) {
          search_result(input: $input) {
            total_count
            has_next
            ui_item_list {
              __typename
              ... on UxGoodsCardItem {
                catalog_product_id
                title
                shop_name
                final_price
                discount_rate
                webp_image_url
                product_url
              }
            }
          }
        }
      variables:
        input:
          q: "${keyword}"
          page_id: "srp_item"
          filter_id_list: ["205"]
          initial: true
      timeout: 10000
      retryCount: 3
      retryDelay: 1000

# 필드 매핑
fieldMapping:
  productId:
    source: "catalog_product_id"
    type: "string"
  productName:
    source: "title"
    type: "string"
  brand:
    source: "shop_name"
    type: "string"
  thumbnail:
    source: "webp_image_url"
    type: "string"
  productUrl:
    source: "product_url"
    type: "string"
    transform: "https://zigzag.kr${value}"
  price:
    source: "final_price"
    type: "number"

# 에러 처리
errorHandling:
  rateLimitDelay: 2000
  serverErrorRetry: true
```

```yaml
# config/search/oliveyoung.yaml
platform: oliveyoung
name: "올리브영"
baseUrl: "https://m.oliveyoung.co.kr"

strategies:
  - id: "api"
    type: "playwright_api"
    priority: 1
    description: "Playwright + API 응답 인터셉트"
    playwright:
      headless: true
      viewport:
        width: 390
        height: 844
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)..."
      isMobile: true
    api:
      interceptPattern: "/search/api/v3/common/unified-search/goods"
      excludePattern: "filters"
      navigation:
        - action: "goto"
          url: "https://m.oliveyoung.co.kr"
          waitUntil: "domcontentloaded"
        - action: "goto"
          url: "https://m.oliveyoung.co.kr/m/mtn/search/result?query=${encodedKeyword}"
          waitUntil: "networkidle"
      timeout: 60000
      responseTimeout: 10000

fieldMapping:
  productId:
    source: "goodsNumber"
    type: "string"
  productName:
    source: "goodsName"
    type: "string"
  brand:
    source: "onlineBrandName"
    type: "string"
  thumbnail:
    source: "imagePath"
    type: "string"
    transform: "https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/${value}"
  productUrl:
    source: "goodsNumber"
    type: "string"
    transform: "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${value}"
  price:
    source: "priceToPay"
    type: "number"

errorHandling:
  rateLimitDelay: 2000
  serverErrorRetry: true
```

---

## 2. 구현 단계

### Phase 1: 기반 구조 ✅

- [x] 디렉토리 구조 생성
- [x] SearchProduct 도메인 타입 정의
- [x] SearchConfig 스키마 정의 (Zod)
- [x] ISearcher 인터페이스 정의

### Phase 2: 핵심 클래스

- [ ] BaseSearcher 구현 (Template Method)
- [ ] SearcherFactory 구현 (Factory)
- [ ] SearcherRegistry 구현 (Singleton + Registry)
- [ ] SearchConfigLoader 구현

### Phase 3: YAML 설정

- [ ] config/search/zigzag.yaml
- [ ] config/search/oliveyoung.yaml
- [ ] config/search/musinsa.yaml
- [ ] config/search/ably.yaml
- [ ] config/search/kurly.yaml
- [ ] config/search/hwahae.yaml

### Phase 4: Searcher 구현

- [ ] ZigzagGraphQLSearcher (fetch 직접)
- [ ] PlaywrightApiSearcher (공통 베이스)
  - [ ] OliveyoungApiSearcher
  - [ ] MusinsaApiSearcher
  - [ ] AblyApiSearcher
  - [ ] KurlyApiSearcher
- [ ] HwahaeDomSearcher (DOM 파싱)

### Phase 5: 서비스 레이어

- [ ] ProductSearchService (Facade)
- [ ] Search API 라우트 (/api/v2/search/:platform)

### Phase 6: Docker 통합

- [ ] worker_search 컨테이너 추가
- [ ] searchWorker.ts 구현
- [ ] npm script 추가 (npm run search-worker)

### Phase 7: 테스트 및 검증

- [ ] 플랫폼별 검색 테스트
- [ ] 기존 scripts/\*.ts 결과와 비교
- [ ] Docker 환경 테스트

---

## 3. API 설계

### 3.1 Search 엔드포인트

```text
POST /api/v2/search/:platform
```

**Request:**

```json
{
  "keyword": "토리든 세럼",
  "limit": 10
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "keyword": "토리든 세럼",
    "totalCount": 87,
    "products": [
      {
        "productId": "116775759",
        "productName": "다이브인 저분자 히알루론산 세럼",
        "brand": "토리든",
        "thumbnail": "https://...",
        "productUrl": "https://zigzag.kr/catalog/products/116775759",
        "price": 15000,
        "platform": "zigzag"
      }
    ]
  }
}
```

### 3.2 Batch Search (향후 확장)

```text
POST /api/v2/search/batch
```

---

## 4. Docker Compose 설계

```yaml
# docker/docker-compose.dev.yml 추가

x-search-worker: &search-worker
  <<: *browser-worker
  shm_size: "2gb"
  deploy:
    resources:
      limits:
        memory: 4G

services:
  # ============================================
  # Search Worker (키워드 검색 전용)
  # ============================================
  worker_search:
    <<: *search-worker
    container_name: worker_search
    environment:
      <<: *worker-env-common
      SERVICE_NAME: worker-search
      WORKER_MODE: search
      WORKER_PLATFORMS: oliveyoung,zigzag,musinsa,ably,kurly,hwahae
    command: npm run search-worker
```

---

## 5. 디자인 패턴 적용

| 패턴                     | 클래스                            | 용도                   |
| ------------------------ | --------------------------------- | ---------------------- |
| **Template Method**      | BaseSearcher                      | 공통 검색 흐름 정의    |
| **Strategy**             | ZigzagGraphQL, PlaywrightApi, Dom | 플랫폼별 전략          |
| **Factory**              | SearcherFactory                   | Searcher 인스턴스 생성 |
| **Singleton + Registry** | SearcherRegistry                  | Searcher 캐싱/관리     |
| **Facade**               | ProductSearchService              | 서비스 레이어 단순화   |
| **Repository**           | (기존) SupabaseProductRepository  | 데이터 접근            |

---

## 6. 공통 인프라 활용

### 6.1 BrowserPool 통합

```typescript
// searchers/impl/PlaywrightApiSearcher.ts
import { BrowserPool } from "@/scanners/base/BrowserPool";

export abstract class PlaywrightApiSearcher extends BaseSearcher {
  protected browserPool: BrowserPool;

  constructor(config: SearchConfig, strategy: PlaywrightApiStrategy) {
    super(config, strategy);
    this.browserPool = BrowserPool.getInstance();
  }

  protected async doSearch(request: SearchRequest): Promise<ApiResponse> {
    const page = await this.browserPool.acquirePage();
    try {
      // API Intercept 로직
    } finally {
      await this.browserPool.releasePage(page);
    }
  }
}
```

### 6.2 ConfigLoader 패턴

```typescript
// config/SearchConfigLoader.ts
export class SearchConfigLoader {
  private static instance: SearchConfigLoader;
  private configs: Map<string, SearchConfig> = new Map();

  static getInstance(): SearchConfigLoader {
    if (!this.instance) {
      this.instance = new SearchConfigLoader();
    }
    return this.instance;
  }

  getConfig(platform: string): SearchConfig {
    if (!this.configs.has(platform)) {
      const config = this.loadYaml(`config/search/${platform}.yaml`);
      this.configs.set(platform, config);
    }
    return this.configs.get(platform)!;
  }
}
```

---

## 7. 리스크 및 대응

| 리스크             | 영향             | 대응                            |
| ------------------ | ---------------- | ------------------------------- |
| BrowserPool 동시성 | Search/Scan 충돌 | WORKER_MODE로 분리              |
| API 변경           | 파싱 실패        | fieldMapping 기반 유연한 변환   |
| Rate Limiting      | 차단             | retryDelay, rateLimitDelay 설정 |
| Cloudflare 우회    | 401/403          | Stealth 플러그인, 쿠키 관리     |

---

## 8. 성공 기준

- [ ] 6개 플랫폼 검색 기능 동작
- [ ] 기존 scripts/\*.ts와 동일한 결과
- [ ] Docker 환경 안정 실행
- [ ] 타입 체크 통과 (`npx tsc --noEmit`)
- [ ] API 응답 시간 < 30초

---

## 참고 자료

- [API Discovery 문서](./api-discovery/README.md)
- [기존 Scanner 구조](../src/scanners/)
- [ZigzagGraphQLScanner](../src/scanners/ZigzagGraphQLScanner.ts)
- [BrowserPool](../src/scanners/base/BrowserPool.ts)

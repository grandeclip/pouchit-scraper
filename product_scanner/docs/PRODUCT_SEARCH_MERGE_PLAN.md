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

## ⚠️ 핵심 설계 변경: Mobile-First 전략

### 결정 사항

**모든 쇼핑몰을 모바일 뷰포트로 통일** (기존: Ably만 모바일)

| 항목           | 기존                          | 변경                       |
| -------------- | ----------------------------- | -------------------------- |
| **Viewport**   | Desktop 1920x1080 (Ably 제외) | **Mobile 430x932 (전체)**  |
| **User-Agent** | Chrome Desktop (Ably 제외)    | **Safari iOS 17 (전체)**   |
| **URL 전략**   | Desktop URL 사용              | Mobile URL 또는 Responsive |

### 플랫폼별 URL 전략

| 플랫폼     | URL 타입        | 모바일 URL           | 비고                    |
| ---------- | --------------- | -------------------- | ----------------------- |
| oliveyoung | **전용 모바일** | `m.oliveyoung.co.kr` | 전용 모바일 사이트      |
| ably       | **전용 모바일** | `m.a-bly.com`        | 기존 모바일 유지        |
| zigzag     | Responsive      | `zigzag.kr`          | 동일 URL, 모바일 렌더링 |
| musinsa    | Responsive      | `www.musinsa.com`    | 동일 URL, 모바일 렌더링 |
| kurly      | Responsive      | `www.kurly.com`      | 동일 URL, 모바일 렌더링 |
| hwahae     | Responsive      | `www.hwahae.co.kr`   | 동일 URL, 모바일 렌더링 |

### 이점

1. **일관성**: 모든 플랫폼에 동일한 설정 적용
2. **단순화**: 데스크톱/모바일 분기 로직 제거
3. **안정성**: 모바일 UI가 더 단순하여 셀렉터 변경 빈도 낮음
4. **봇 탐지 우회**: 모바일 User-Agent가 봇 탐지에 덜 민감

### 선행 작업 필요

각 플랫폼의 모바일 UI에서 사용할 셀렉터 조사 필요 (Phase 0)

---

## 1. 현재 구조 분석

### 1.1 product_search (병합 대상)

**용도**: 쇼핑몰 키워드 검색 ("기획 세트 등록" 페이지용)

```text
product_search/
├── server.ts                          # Express 서버 (포트 3000)
├── config/
│   ├── ConfigLoader.ts                # YAML 설정 로더
│   ├── UserAgentManager.ts            # User-Agent 관리
│   └── malls/                         # 쇼핑몰별 설정
│       ├── oliveyoung.yaml
│       ├── zigzag.yaml
│       ├── musinsa.yaml
│       ├── ably.yaml
│       ├── kurly.yaml
│       └── hwahae.yaml
├── core/
│   ├── domain/
│   │   ├── Product.ts                 # 상품 도메인 모델
│   │   ├── ProductSearchConfig.ts     # 검색 설정 타입
│   │   └── NavigationStep.ts          # 네비게이션 단계
│   └── interfaces/
│       ├── IProductSearcher.ts        # 검색기 인터페이스
│       ├── IPageNavigator.ts          # 네비게이터 인터페이스
│       └── IDataExtractor.ts          # 추출기 인터페이스
├── searchers/
│   ├── base/
│   │   ├── BaseProductSearcher.ts     # 기본 검색기 (Template Method)
│   │   └── ProductSearcherFactory.ts  # 팩토리
│   └── ConfigDrivenProductSearcher.ts # 설정 기반 검색기
├── navigators/
│   ├── PageNavigator.ts               # 페이지 네비게이션
│   └── ActionExecutor.ts              # 액션 실행기
├── extractors/
│   ├── EvaluateExtractor.ts           # JS evaluate 추출
│   └── SelectorExtractor.ts           # CSS selector 추출
├── services/
│   ├── ProductSearchService.ts        # Facade 서비스
│   └── ProductSearchRegistry.ts       # 검색기 레지스트리
└── controllers/
    └── ProductSearchController.ts     # HTTP 컨트롤러
```

**핵심 특징**:

- `search(brand, productName)` → 키워드 검색 → `Product[]` 반환
- 매 요청마다 Browser 인스턴스 생성/정리
- YAML 기반 네비게이션 (goto, wait, waitForEither 등)
- evaluate/selector 기반 데이터 추출

### 1.2 product_scanner (통합 대상)

**용도**: 상품 상세 정보 스캔 (productId 기반 유효성 검증)

```text
product_scanner/src/
├── server.ts                          # Express 서버 (포트 3000)
├── config/
│   ├── ConfigLoader.ts                # YAML 설정 로더 (플랫폼별)
│   ├── BrowserArgs.ts                 # 브라우저 설정
│   └── logger.ts                      # Pino 로거
├── core/
│   ├── domain/                        # 플랫폼별 Product 타입
│   │   ├── HwahaeProduct.ts
│   │   ├── OliveyoungProduct.ts
│   │   └── ...
│   └── interfaces/
│       ├── IScanner.ts                # 스캐너 인터페이스
│       ├── IExtractor.ts              # 추출기 인터페이스
│       └── IProduct.ts                # 상품 인터페이스
├── scanners/
│   ├── base/
│   │   ├── BaseScanner.ts             # 기본 스캐너 (Template Method)
│   │   ├── BrowserPool.ts             # 브라우저 풀
│   │   └── ScannerFactory.ts          # 팩토리
│   ├── PlaywrightScanner.ts           # Browser 기반 스캐너
│   └── strategies/
│       └── ApiScanner.ts              # API 기반 스캐너
├── extractors/                        # 플랫폼별 추출기
│   ├── ExtractorRegistry.ts
│   ├── hwahae/
│   ├── oliveyoung/
│   └── ...
├── services/
│   ├── ScannerRegistry.ts             # 스캐너 레지스트리
│   └── WorkflowLoaderService.ts       # 워크플로우 로더
├── strategies/                        # 워크플로우 노드
│   ├── SupabaseSearchNode.ts
│   └── ResultWriterNode.ts
└── routes/
    └── v2/                            # API v2 라우터
```

**핵심 특징**:

- `scan(productId)` → 상품 URL 접속 → `Product` 반환
- BrowserPool로 브라우저 인스턴스 관리
- DAG 기반 워크플로우 시스템
- 플랫폼별 전용 Extractor (메타데이터, 가격, 판매상태)

---

## 2. 차이점 분석

| 구분           | product_search                 | product_scanner           |
| -------------- | ------------------------------ | ------------------------- |
| **입력**       | `brand + productName` (키워드) | `productId` (상품 ID)     |
| **출력**       | `Product[]` (복수)             | `Product` (단일)          |
| **브라우저**   | 요청마다 생성/정리             | BrowserPool 관리          |
| **설정 경로**  | `config/malls/*.yaml`          | `config/platforms/*.yaml` |
| **추출 방식**  | YAML 내장 스크립트             | 전용 Extractor 클래스     |
| **네비게이션** | ActionExecutor                 | PlaywrightScanner 내부    |
| **User-Agent** | UserAgentManager               | BrowserPool 옵션          |

### 공통점

- Playwright 사용
- YAML 기반 설정
- Template Method Pattern
- 동일 쇼핑몰 지원 (oliveyoung, zigzag, musinsa, ably, kurly, hwahae)

---

## 3. 통합 아키텍처 설계

### 3.1 디렉토리 구조 (통합 후)

```text
product_scanner/src/
├── config/
│   ├── platforms/                     # 기존: 스캔 설정
│   │   └── *.yaml
│   └── search/                        # 신규: 검색 설정
│       └── *.yaml                     # product_search/config/malls/ 이전
│
├── core/
│   ├── domain/
│   │   ├── search/                    # 신규: 검색 도메인
│   │   │   ├── SearchProduct.ts       # 검색 결과 Product
│   │   │   ├── SearchConfig.ts        # 검색 설정 타입
│   │   │   └── NavigationStep.ts      # 네비게이션 단계
│   │   └── scan/                      # 기존: 스캔 도메인
│   │       └── ...
│   └── interfaces/
│       ├── search/                    # 신규: 검색 인터페이스
│       │   ├── IProductSearcher.ts
│       │   ├── ISearchNavigator.ts
│       │   └── ISearchExtractor.ts
│       └── scan/                      # 기존: 스캔 인터페이스
│           └── ...
│
├── searchers/                         # 신규: 검색기 모듈
│   ├── base/
│   │   ├── BaseProductSearcher.ts     # Template Method
│   │   └── ProductSearcherFactory.ts
│   ├── ConfigDrivenProductSearcher.ts
│   ├── navigators/
│   │   ├── SearchNavigator.ts
│   │   └── ActionExecutor.ts
│   └── extractors/
│       ├── EvaluateExtractor.ts
│       └── SelectorExtractor.ts
│
├── scanners/                          # 기존: 스캐너 모듈
│   └── ...
│
├── services/
│   ├── search/                        # 신규: 검색 서비스
│   │   ├── ProductSearchService.ts
│   │   └── ProductSearchRegistry.ts
│   └── scan/                          # 기존: 스캔 서비스
│       └── ...
│
├── controllers/
│   ├── SearchController.ts            # 신규: 검색 API
│   └── ScanController.ts              # 기존: 스캔 API
│
└── routes/
    └── v2/
        ├── search.ts                  # 신규: 검색 라우트
        └── ...
```

### 3.2 API 설계

**검색 엔드포인트 (신규)**:

```text
POST /api/v2/search/:platform
Body: { brand: string, productName: string }
Response: { success: boolean, products: Product[], message: string }
```

**기존 스캔 엔드포인트 (유지)**:

```text
POST /api/v2/products/extract-by-url
POST /api/v2/products/extract-by-product-set
```

### 3.3 공통 인프라 활용

#### BrowserPool 통합

```typescript
// 기존 BrowserPool을 검색에서도 활용
// searchers/base/BaseProductSearcher.ts
export abstract class BaseProductSearcher {
  protected browserPool: IBrowserPool;

  constructor(platform: PlatformId) {
    this.browserPool = BrowserPool.getInstance();
  }

  async search(request: SearchRequest): Promise<SearchProduct[]> {
    const page = await this.browserPool.acquirePage();
    try {
      // 검색 로직
    } finally {
      await this.browserPool.releasePage(page);
    }
  }
}
```

#### UserAgent 통합

```typescript
// config/UserAgentManager.ts를 공통 모듈로 이동
// BrowserPool 생성 시 UserAgent 적용
```

---

## 4. Docker Compose 설계

### 4.1 Search Worker 추가

```yaml
# docker/docker-compose.dev.yml

# 신규: Search Workers (Browser 기반)
x-search-worker: &search-worker
  <<: *worker-common
  shm_size: "2gb"
  deploy:
    resources:
      limits:
        memory: 4G

services:
  # ... 기존 서비스 ...

  # ============================================
  # Search Workers (키워드 검색 전용)
  # ============================================
  worker_search_oliveyoung:
    <<: *search-worker
    container_name: worker_search_oliveyoung
    environment:
      <<: *worker-env-common
      SERVICE_NAME: worker-search-oliveyoung
      WORKER_MODE: search
      WORKER_PLATFORMS: oliveyoung

  worker_search_zigzag:
    <<: *search-worker
    container_name: worker_search_zigzag
    environment:
      <<: *worker-env-common
      SERVICE_NAME: worker-search-zigzag
      WORKER_MODE: search
      WORKER_PLATFORMS: zigzag

  # ... 다른 플랫폼 ...
```

### 4.2 Worker 모드 구분

```typescript
// src/worker.ts
const WORKER_MODE = process.env.WORKER_MODE || "scan"; // 'scan' | 'search'

if (WORKER_MODE === "search") {
  // 검색 작업 처리
  processSearchJobs();
} else {
  // 스캔 작업 처리
  processScanJobs();
}
```

---

## 5. 구현 단계 (Mobile-First 재설계)

### Phase 0: 모바일 UI 조사 ⚠️ 선행 작업

- [ ] Playwright MCP로 각 플랫폼 모바일 뷰 탐색
- [ ] `m.oliveyoung.co.kr` 검색 UI 셀렉터 확인
- [ ] Responsive 사이트 (zigzag, musinsa, kurly, hwahae) 모바일 뷰 셀렉터 확인
- [ ] 각 플랫폼별 모바일 네비게이션 플로우 정의
- [ ] 모바일용 데이터 추출 스크립트 설계

### Phase 1: 기반 구조

- [ ] `src/core/domain/search/` 생성
- [ ] `src/core/interfaces/search/` 생성
- [ ] `src/config/search/` 생성 (모바일 YAML 템플릿)
- [ ] SearchProduct, SearchConfig 타입 정의
- [ ] **Mobile User-Agent 설정 파일 생성**

### Phase 2: 검색기 구현

- [ ] `src/searchers/` 디렉토리 생성
- [ ] BaseProductSearcher 이식 (BrowserPool 활용)
- [ ] **MOBILE_VIEWPORT (430x932) 기본 적용**
- [ ] ActionExecutor, PageNavigator 이식
- [ ] EvaluateExtractor, SelectorExtractor 이식
- [ ] ConfigDrivenProductSearcher 이식

### Phase 3: 모바일 YAML 설정 작성

- [ ] `config/search/oliveyoung.yaml` - 전용 모바일 URL
- [ ] `config/search/ably.yaml` - 뷰포트 조정
- [ ] `config/search/zigzag.yaml` - 모바일 셀렉터
- [ ] `config/search/musinsa.yaml` - 모바일 셀렉터
- [ ] `config/search/kurly.yaml` - 모바일 셀렉터
- [ ] `config/search/hwahae.yaml` - 모바일 셀렉터

### Phase 4: 서비스 레이어

- [ ] `src/services/search/` 생성
- [ ] ProductSearchService 이식
- [ ] ProductSearchRegistry 이식

### Phase 5: API 통합

- [ ] SearchController 생성
- [ ] `src/routes/v2/search.ts` 생성
- [ ] 라우터 통합

### Phase 6: Docker 통합

- [ ] docker-compose.dev.yml에 search worker 추가
- [ ] 환경변수 및 설정 정리

### Phase 7: 플랫폼별 테스트 및 검증

- [ ] oliveyoung 모바일 검색 테스트
- [ ] ably 모바일 검색 테스트 (뷰포트 변경 확인)
- [ ] zigzag 모바일 검색 테스트
- [ ] musinsa 모바일 검색 테스트
- [ ] kurly 모바일 검색 테스트
- [ ] hwahae 모바일 검색 테스트
- [ ] 기존 product_search와 결과 비교

### Phase 8: 정리

- [ ] product_search 모듈 deprecated 처리
- [ ] 문서 업데이트
- [ ] PR 생성

---

## 6. 마이그레이션 체크리스트

### 6.1 파일 이동

| 원본 (product_search)                    | 대상 (product_scanner/src)             |
| ---------------------------------------- | -------------------------------------- |
| `config/malls/*.yaml`                    | `config/search/*.yaml`                 |
| `config/ConfigLoader.ts`                 | `config/SearchConfigLoader.ts`         |
| `config/UserAgentManager.ts`             | `config/UserAgentManager.ts`           |
| `core/domain/Product.ts`                 | `core/domain/search/SearchProduct.ts`  |
| `core/domain/ProductSearchConfig.ts`     | `core/domain/search/SearchConfig.ts`   |
| `core/domain/NavigationStep.ts`          | `core/domain/search/NavigationStep.ts` |
| `core/interfaces/*.ts`                   | `core/interfaces/search/*.ts`          |
| `searchers/*.ts`                         | `searchers/*.ts`                       |
| `navigators/*.ts`                        | `searchers/navigators/*.ts`            |
| `extractors/*.ts`                        | `searchers/extractors/*.ts`            |
| `services/*.ts`                          | `services/search/*.ts`                 |
| `controllers/ProductSearchController.ts` | `controllers/SearchController.ts`      |

### 6.2 의존성 업데이트

**product_search의 dependencies** (확인 필요):

- `playwright-extra`
- `puppeteer-extra-plugin-stealth`
- `js-yaml`
- `express`
- `zod`

대부분 product_scanner에 이미 존재 → package.json 비교 후 추가

### 6.3 타입 충돌 해결

| 충돌 항목         | 해결 방안                                       |
| ----------------- | ----------------------------------------------- |
| `Product` 클래스  | `SearchProduct` vs `ScanProduct` 분리           |
| `ConfigLoader`    | `SearchConfigLoader` vs `ScanConfigLoader` 분리 |
| `PlatformId` 타입 | 기존 타입 재사용                                |

---

## 7. 리스크 및 대응

### 7.1 기술적 리스크

| 리스크                  | 영향           | 대응              |
| ----------------------- | -------------- | ----------------- |
| BrowserPool 동시성 이슈 | 검색/스캔 충돌 | 모드별 풀 분리    |
| YAML 설정 충돌          | 설정 로딩 실패 | 네임스페이스 분리 |
| 메모리 증가             | Worker OOM     | 리소스 모니터링   |

### 7.2 롤백 계획

1. 새 브랜치에서 작업 → main 영향 없음
2. product_search 모듈은 즉시 삭제하지 않음
3. 문제 발생 시 기존 모듈로 fallback

---

## 8. 성공 기준

- [ ] 기존 product_search API와 동일한 응답 형식
- [ ] 모든 쇼핑몰(6개) 검색 기능 동작
- [ ] Docker 환경에서 안정적 실행
- [ ] 타입 체크 통과 (`npx tsc --noEmit`)
- [ ] 메모리 누수 없음

---

## 9. Playwright 설정 상세 (Critical)

리팩터링 시 반드시 보존해야 할 Playwright 관련 설정들.

### 9.1 Stealth Mode 적용

**필수 설정**: 봇 탐지 우회를 위한 stealth 플러그인

```typescript
// 현재 product_search 방식 (유지 필요)
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

// 추가 anti-detection (product_scanner에서 사용 중)
await context.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", {
    get: () => false,
  });
});
```

**주의사항**:

- `playwright` 아닌 `playwright-extra` import 필수
- StealthPlugin은 한 번만 적용 (중복 적용 X)

### 9.2 모바일 통일 전략 (Mobile-First) ⚠️ 리팩터링 핵심

**설계 원칙**: 모든 플랫폼을 모바일 뷰포트로 통일하여 일관성 확보

#### 통일 Viewport 설정

```typescript
// product_scanner/src/config/constants.ts 에서 가져옴
export const MOBILE_VIEWPORT = {
  DEFAULT: {
    width: 430,
    height: 932, // iPhone Pro Max
  },
} as const;
```

| 플랫폼     | Viewport  | URL 타입        | 모바일 URL           |
| ---------- | --------- | --------------- | -------------------- |
| oliveyoung | 430 x 932 | **전용 모바일** | `m.oliveyoung.co.kr` |
| zigzag     | 430 x 932 | Responsive      | `zigzag.kr`          |
| musinsa    | 430 x 932 | Responsive      | `www.musinsa.com`    |
| ably       | 430 x 932 | **전용 모바일** | `m.a-bly.com`        |
| kurly      | 430 x 932 | Responsive      | `www.kurly.com`      |
| hwahae     | 430 x 932 | Responsive      | `www.hwahae.co.kr`   |

#### URL 전략 상세

**전용 모바일 URL (Dedicated Mobile)**:

- `oliveyoung`: `m.oliveyoung.co.kr` - 완전히 다른 UI 구조
- `ably`: `m.a-bly.com` - 모바일 전용 SPA

**반응형 사이트 (Responsive)**:

- `zigzag`, `musinsa`, `kurly`, `hwahae` - 동일 URL에서 viewport 크기에 따라 UI 자동 조정

#### 모바일 전환 이점

1. **일관된 코드**: 모든 플랫폼에 동일한 viewport/User-Agent 적용
2. **유지보수 용이**: 데스크톱/모바일 분기 로직 제거
3. **안정성**: 모바일 UI가 더 단순하여 셀렉터 변경 빈도 낮음
4. **봇 탐지 우회**: 모바일 User-Agent가 봇 탐지에 덜 민감

### 9.3 통일 User-Agent 전략 (Mobile Safari)

**설계 원칙**: 모든 플랫폼에 동일한 모바일 Safari User-Agent 적용

```yaml
# config/search/userAgents.yaml (신규)
userAgents:
  # Mobile Safari iOS 17 (Primary)
  safari_iphone_ios17:
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    platform: "mobile"
    browser: "safari"

  # Mobile Safari iOS 16 (Fallback)
  safari_iphone_ios16:
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    platform: "mobile"
    browser: "safari"

# 모든 플랫폼에 동일하게 적용
mallUserAgents:
  oliveyoung:
    - safari_iphone_ios17
    - safari_iphone_ios16
  zigzag:
    - safari_iphone_ios17
    - safari_iphone_ios16
  musinsa:
    - safari_iphone_ios17
    - safari_iphone_ios16
  ably:
    - safari_iphone_ios17
    - safari_iphone_ios16
  kurly:
    - safari_iphone_ios17
    - safari_iphone_ios16
  hwahae:
    - safari_iphone_ios17
    - safari_iphone_ios16
```

**기존 Desktop User-Agent 제거**: `chrome_mac_*`, `chrome_win_*` 등은 더 이상 사용하지 않음

### 9.4 네비게이션 액션 종류

| 액션                 | 용도                               | 플랫폼 예시 |
| -------------------- | ---------------------------------- | ----------- |
| `goto`               | URL 이동                           | 전체        |
| `wait`               | 고정 시간 대기                     | 전체        |
| `waitForSelector`    | 셀렉터 대기                        | 전체        |
| `waitForLoadState`   | 페이지 로드 상태 대기              | zigzag      |
| `waitForEither`      | 성공/실패 시그널 Race              | oliveyoung  |
| `fill`               | 입력 필드 채우기                   | ably        |
| `press`              | 키보드 입력 (Enter 등)             | ably        |
| `scroll`             | 스크롤 (이미지 로딩 트리거)        | zigzag      |
| `click`              | 요소 클릭                          | -           |
| `clickAndExtractUrl` | SPA용 URL 추출 (클릭→URL→뒤로가기) | **ably**    |
| `checkNoResults`     | 검색 결과 없음 체크                | -           |

### 9.5 모바일 네비게이션 플로우 (리팩터링 대상)

모든 플랫폼에 430x932 viewport + Safari iOS User-Agent 적용.
기존 Desktop 플로우를 모바일로 재설계 필요.

#### OliveYoung (전용 모바일 URL) ⚠️ 리팩터링 필요

```yaml
# 기존: www.oliveyoung.co.kr (Desktop)
# 신규: m.oliveyoung.co.kr (Mobile)
mall: oliveyoung
baseUrl: "https://m.oliveyoung.co.kr"
searchUrl: "${baseUrl}/search?query=${encodedQuery}"

browser:
  headless: true
  viewport:
    width: 430
    height: 932

navigation:
  steps:
    - action: goto
      url: "${searchUrl}"
      waitUntil: domcontentloaded
      timeout: 30000

    # 모바일 UI 셀렉터로 변경 필요
    - action: waitForEither
      success:
        - "[data-testid='product-card']" # 예상 셀렉터 (확인 필요)
        - ".product-item"
      failure:
        - "text=/검색.*결과.*없/"
        - ".no-result"
      timeout: 5000
      onFailure: returnEmpty
```

#### Ably (기존 모바일 - 뷰포트만 조정)

```yaml
# URL 유지: m.a-bly.com
# viewport만 430x932로 조정
mall: ably
baseUrl: "https://m.a-bly.com"
searchUrl: "${baseUrl}/search"

browser:
  headless: true
  viewport:
    width: 430 # 기존 375 → 430
    height: 932 # 기존 812 → 932

navigation:
  steps:
    - action: goto
      url: "${searchUrl}"
      waitUntil: domcontentloaded

    - action: fill
      selector: 'input[type="text"]'
      value: "${brand} ${productName}"

    - action: press
      selector: 'input[type="text"]'
      key: "Enter"

    - action: waitForLoadState
      state: domcontentloaded
      optional: true

    # SPA 특화: 클릭하여 URL 추출
    - action: clickAndExtractUrl
      containerSelector: 'main picture img[src*="cloudfront"]'
      maxProducts: 5
      storeIn: "productUrls"
```

#### Responsive 사이트들 (Zigzag, Musinsa, Kurly, Hwahae)

```yaml
# URL 유지, viewport + User-Agent만 모바일로 변경
# 모바일 UI 렌더링을 위해 셀렉터 확인 필요

browser:
  headless: true
  viewport:
    width: 430
    height: 932

# 각 플랫폼별 모바일 셀렉터 조사 필요:
# - zigzag: zigzag.kr (반응형)
# - musinsa: www.musinsa.com (반응형)
# - kurly: www.kurly.com (반응형)
# - hwahae: www.hwahae.co.kr (반응형)
```

#### 🔍 모바일 UI 셀렉터 조사 작업 (TODO)

각 플랫폼의 모바일 UI에서 사용할 셀렉터 확인 필요:

| 플랫폼     | 상태         | 조사 항목                      |
| ---------- | ------------ | ------------------------------ |
| oliveyoung | ⚠️ 조사 필요 | m.oliveyoung.co.kr 셀렉터      |
| zigzag     | ⚠️ 조사 필요 | 모바일 뷰 상품 카드 셀렉터     |
| musinsa    | ⚠️ 조사 필요 | 모바일 뷰 상품 리스트 셀렉터   |
| kurly      | ⚠️ 조사 필요 | 모바일 뷰 상품 카드 셀렉터     |
| hwahae     | ⚠️ 조사 필요 | 모바일 뷰 상품 리스트 셀렉터   |
| ably       | ✅ 기존 유지 | 기존 모바일 셀렉터 그대로 사용 |

### 9.6 Context 공유 메커니즘

```typescript
// navigate()와 extract() 간 데이터 공유
// ably의 clickAndExtractUrl에서 productUrls를 저장하고,
// extraction에서 ${context.productUrls}로 참조

extraction:
  scriptArgs:
    - "${brand}"
    - "${productName}"
    - "${context.productUrls}"  # 🎯 액션에서 저장한 URL 배열
```

---

## 10. Playwright MCP 활용 검증

개발 중 전략 검증을 위한 Playwright MCP 활용 방안.

### 10.1 검증이 필요한 상황

| 상황             | 설명                      |
| ---------------- | ------------------------- |
| 셀렉터 변경      | 쇼핑몰 UI 업데이트 시     |
| 봇 탐지 강화     | 기존 전략이 차단될 때     |
| 새 쇼핑몰 추가   | 네비게이션 플로우 탐색    |
| 페이지 구조 변경 | 데이터 추출 스크립트 수정 |

### 10.2 로컬 개발 환경 구성

```bash
# Docker 컨테이너가 아닌 로컬에서 개발 시
# headless: false로 설정하여 브라우저 동작 확인

# 1. 로컬 실행 (headless 비활성화)
HEADLESS=false npm run dev

# 2. Playwright MCP로 직접 탐색
# - 셀렉터 확인
# - 네비게이션 단계 테스트
# - 데이터 추출 스크립트 검증
```

### 10.3 MCP 활용 시나리오

```typescript
// 1. 페이지 스냅샷으로 현재 상태 확인
mcp__playwright__browser_snapshot();

// 2. 셀렉터 유효성 검증
mcp__playwright__browser_evaluate({
  function: "document.querySelectorAll('.prd_info').length",
});

// 3. 네비게이션 테스트
mcp__playwright__browser_navigate({
  url: "https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=설화수",
});

// 4. 클릭 동작 검증
mcp__playwright__browser_click({
  element: "검색 결과 첫 번째 상품",
  ref: "a.prd_thumb",
});
```

### 10.4 YAML 설정 업데이트 워크플로우

```text
1. Playwright MCP로 페이지 탐색
2. 유효한 셀렉터 확인
3. config/search/{mall}.yaml 수정
4. Docker 환경에서 테스트
5. 커밋
```

---

## 11. 개발 환경 고려사항

### 11.1 로컬 vs Docker 환경

| 항목          | 로컬                     | Docker            |
| ------------- | ------------------------ | ----------------- |
| Playwright UI | ✅ 가능 (headless=false) | ❌ 불가능         |
| MCP 연동      | ✅ 직접 연동 가능        | ❌ 제한적         |
| 디버깅        | ✅ 용이                  | ⚠️ 로그 기반      |
| 성능 테스트   | ⚠️ 환경 차이             | ✅ 실제 환경 동일 |

### 11.2 개발 시 권장 플로우

```text
1. 로컬 개발 (새 전략 개발/디버깅)
   - headless: false
   - Playwright MCP 활용
   - YAML 설정 조정

2. Docker 테스트 (검증)
   - make dev
   - 실제 환경과 동일한 조건
   - 메모리/리소스 확인

3. 통합 테스트 (최종)
   - 전체 워크플로우 실행
   - 다중 플랫폼 동시 테스트
```

### 11.3 headless 설정 동적 적용

```yaml
# config/search/*.yaml
browser:
  headless: ${HEADLESS:-true} # 환경변수로 오버라이드 가능
```

```typescript
// config/SearchConfigLoader.ts
const headless = process.env.HEADLESS === "false" ? false : true;
```

---

## 참고 자료

- [product_search 원본](/product_search)
- [product_scanner README](/product_scanner/README.md)
- [WORKFLOW_DAG.md](/product_scanner/docs/WORKFLOW_DAG.md)
- [MULTI_WORKER_QUEUE_DESIGN.md](/product_scanner/docs/MULTI_WORKER_QUEUE_DESIGN.md)

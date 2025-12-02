# Product Scanner

**제네릭 기반 멀티 플랫폼 상품 스캐너** - 화해, 올리브영 등 쇼핑몰 상품 정보 스캔 및 Supabase 검색 서비스

## 📌 용도

### 1. 멀티 플랫폼 상품 스캔

- **화해**: API + Playwright 이중 전략
- **올리브영**: Playwright 브라우저 기반 스크래핑
- **무신사**: HTTP API 직접 호출 (빠름, 정확)
- **지그재그**: GraphQL API (첫구매 쿠폰 처리) + Playwright 대체
- **에이블리**: Playwright (Network API 캡처 + Meta Tag fallback)
- **마켓컬리**: Playwright (`__NEXT_DATA__` 파싱 + 상품 상태 감지)
- **제네릭 아키텍처**: 새 플랫폼 추가 시 YAML 설정만으로 확장
- CSV 데이터와 실시간 데이터 검증

### 2. Supabase 상품 검색

- Supabase `product_sets` 테이블 검색
- URL 패턴 기반 상품 조회
- 상품 ID(UUID) 기반 상세 조회

## 🔄 작동 방식

### 멀티 플랫폼 스캔 전략

각 플랫폼은 최적화된 데이터 추출 전략을 사용합니다:

#### 1. 화해 (이중 전략)

```mermaid
graph LR
    A[Scan Request] --> B{전략 선택}
    B -->|Priority 1| C[화해 REST API]
    B -->|Priority 2| D[Playwright DOM]
    C --> E[상품 정보 추출]
    D --> E
    E --> F[결과 반환]
```

- **1차**: REST API (빠름, 안정적)
- **2차**: Playwright DOM (API 실패 시)

#### 2. 올리브영 (브라우저 전용)

```mermaid
graph LR
    A[Scan Request] --> B[Playwright 브라우저]
    B --> C[DOM Selector]
    C --> D[상품 정보 추출]
    D --> E[결과 반환]
```

- **단일 전략**: Playwright DOM Selector

#### 3. 무신사 (HTTP API)

```mermaid
graph LR
    A[Scan Request] --> B[HTTP API]
    B --> C[Musinsa API Response]
    C --> D[상품 정보 추출]
    D --> E[결과 반환]
```

- **단일 전략**: HTTP API (`https://goods-detail.musinsa.com/api2/goods/{goodsId}`)
- **성능**: 기존 Playwright 대비 8배 빠름 (~8초 → ~1초)
- **정확도**: API 직접 조회로 100% 정확한 정가/할인가 추출

#### 4. 지그재그 (이중 전략 + 첫구매 쿠폰 처리)

```mermaid
graph LR
    A[Scan Request] --> B{전략 선택}
    B -->|Priority 1| C[GraphQL API]
    B -->|Priority 2| D[Playwright __NEXT_DATA__]
    C --> E[배지 감지]
    E -->|첫구매 쿠폰| F[첫구매 제외 가격]
    E -->|일반 할인| G[할인가]
    F --> H[결과 반환]
    G --> H
    D --> H
```

- **1차**: GraphQL API (빠름, 정확)
  - `display_final_price` 구조로 배지 정보 추출
  - 첫구매 쿠폰 감지 시 첫구매 제외 가격 반환
  - 일반 할인 시 `final_discount_info.discount_price` 사용
- **2차**: Playwright `__NEXT_DATA__` (API 실패 시)

#### 5. 에이블리 (Network API 캡처)

```mermaid
graph LR
    A[Scan Request] --> B[Playwright 브라우저]
    B --> C{Network API 캡처}
    C -->|성공| D[API 응답 데이터]
    C -->|실패| E[Meta Tag Fallback]
    D --> F[상품 정보 추출]
    E --> F
    F --> G[결과 반환]
```

- **1차**: Network API 캡처 (`/api/v3/goods/{id}/basic/`)
- **2차**: Meta Tag Fallback (API 타임아웃 시)

#### 6. 마켓컬리 (`__NEXT_DATA__` 파싱)

```mermaid
graph LR
    A[Scan Request] --> B[Playwright 브라우저]
    B --> C[__NEXT_DATA__ 추출]
    C --> D{상품 상태 감지}
    D -->|판매중| E[정가/할인가 추출]
    D -->|품절| F[재고없음 상태]
    D -->|정보변경| G[off_sale 상태]
    E --> H[결과 반환]
    F --> H
    G --> H
```

- **전략**: Next.js `__NEXT_DATA__` SSR 데이터 파싱
- **상품 상태 감지**:
  - `isSoldOut: true` → 품절/재고없음
  - `isSoldOut: null/undefined` → 상품정보변경
  - `isSoldOut: false` → 판매중
- **가격 추출**: `discountedPrice` → `basePrice` fallback

### Supabase 상품 검색

```mermaid
graph LR
    A[Search Request] --> B[SupabaseProductRepository]
    B --> C[Supabase Query]
    C --> D[ProductSetEntity]
    D --> E[ProductSearchService]
    E --> F[JSON Response]
```

### 공통 아키텍처 패턴

- **Strategy Pattern**: 플랫폼별 최적 전략 자동 선택
- **Fallback Chain**: 1차 전략 실패 시 2차 전략으로 자동 전환
- **YAML 설정**: 코드 수정 없이 전략 추가/변경 가능

## 🏗️ 아키텍처

### 제네릭 기반 설계

**핵심 컨셉**: 플랫폼 독립적 타입 시스템 + 병렬 처리 최적화

```typescript
// 플랫폼 독립 인터페이스
interface IProduct {
  id: string;
  productName: string;
  getDiscountRate(): number;
}

// 제네릭 스캐너 인터페이스
interface IScanner<TProduct extends IProduct> {
  scan(id: string): Promise<TProduct>;
}

// 플랫폼별 구현
class HwahaeProduct implements IProduct {}
class OliveyoungProduct implements IProduct {}
```

**장점**:

- ✅ 타입 안전성: 컴파일 타임 타입 검증
- ✅ 코드 재사용: 공통 로직은 BaseScanner에 집중
- ✅ 확장성: 새 플랫폼 추가 시 IProduct 구현만 필요

### 디자인 패턴

- **Strategy Pattern**: 플랫폼별 스크래핑 전략 (API/Playwright)
- **Template Method Pattern**: BaseScanner<TRawData, TProduct, TConfig>
- **Factory Pattern**: 플랫폼별 스캐너 팩토리 (OliveyoungScannerFactory)
- **Repository Pattern**: 데이터 접근 로직 캡슐화 (Supabase)
- **Facade Pattern**: 서비스 계층 단순화
- **Singleton Pattern**: ConfigLoader, Supabase 클라이언트
- **Object Pool Pattern**: BrowserPool (브라우저 인스턴스 재사용)
- **Command Pattern**: PlaywrightScriptExecutor (YAML 기반 액션 실행)

### SOLID 원칙

- **SRP**: 각 클래스는 단일 책임
- **OCP**: 새 플랫폼 추가 시 기존 코드 수정 없이 확장
- **LSP**: 모든 Product는 IProduct로 대체 가능
- **ISP**: 클라이언트별 인터페이스 분리 (IScanner, IProduct)
- **DIP**: 추상화(IProduct, IScanner)에 의존

## 📁 디렉토리 구조

```text
product_scanner/
├── src/                           # 소스 코드
│   ├── server.ts                  # 엔트리포인트
│   ├── worker.ts                  # Workflow Worker
│   ├── config/                    # 설정 & 로더
│   │   ├── constants.ts           # 애플리케이션 상수
│   │   ├── logger.ts              # Pino 로거 설정 (서비스별 분리)
│   │   ├── ConfigLoader.ts        # YAML 설정 로더 (Singleton)
│   │   └── platforms/             # 플랫폼별 YAML 설정
│   │       ├── hwahae.yaml        # 화해 설정
│   │       ├── oliveyoung.yaml    # 올리브영 설정
│   │       ├── musinsa.yaml       # 무신사 설정
│   │       ├── zigzag.yaml        # 지그재그 설정
│   │       ├── ably.yaml          # 에이블리 설정
│   │       └── kurly.yaml         # 마켓컬리 설정
│   ├── core/                      # 도메인 & 인터페이스
│   │   ├── domain/                # 도메인 모델
│   │   │   ├── PlatformId.ts     # 플랫폼 ID 타입 (hwahae | oliveyoung)
│   │   │   ├── HwahaeProduct.ts   # 화해 상품 (IProduct 구현)
│   │   │   ├── HwahaeConfig.ts    # 화해 설정
│   │   │   ├── OliveyoungProduct.ts  # 올리브영 상품 (IProduct 구현)
│   │   │   ├── OliveyoungConfig.ts   # 올리브영 설정
│   │   │   ├── ProductSet.ts      # Supabase 상품 세트
│   │   │   ├── StrategyConfig.ts  # 전략 설정
│   │   │   └── StrategyConfig.guards.ts  # 타입 가드
│   │   └── interfaces/            # 인터페이스 정의
│   │       ├── IProduct.ts        # 플랫폼 독립 상품 인터페이스
│   │       ├── IScanner.generic.ts  # 제네릭 스캐너 인터페이스
│   │       ├── IProductRepository.ts
│   │       └── IProductSearchService.ts
│   ├── services/                  # 비즈니스 로직
│   │   ├── ScanService.ts
│   │   └── ProductSearchService.ts
│   ├── repositories/              # 데이터 접근 계층
│   │   └── SupabaseProductRepository.ts
│   ├── scanners/                  # 스캐너 구현
│   │   ├── base/
│   │   │   ├── BaseScanner.generic.ts  # 제네릭 Base 클래스
│   │   │   ├── BrowserPool.ts      # 브라우저 인스턴스 풀 (Object Pool)
│   │   │   └── IBrowserPool.ts     # 브라우저 풀 인터페이스
│   │   ├── strategies/            # 전략 구현
│   │   │   ├── ApiScanner.ts      # API 기반 스캐너
│   │   │   └── BrowserScanner.ts  # Playwright 기반 스캐너 (풀 통합)
│   │   ├── platforms/             # 플랫폼별 팩토리
│   │   │   ├── hwahae/            # 화해 팩토리
│   │   │   ├── oliveyoung/        # 올리브영 팩토리
│   │   │   ├── musinsa/           # 무신사 팩토리
│   │   │   │   ├── MusinsaHttpScanner.ts    # HTTP API 스캐너
│   │   │   │   └── MusinsaScannerFactory.ts # 팩토리
│   │   │   ├── zigzag/            # 지그재그 팩토리
│   │   │   └── ably/              # 에이블리 팩토리
│   │   ├── HttpScanner.ts         # 레거시 (화해 전용)
│   │   └── PlaywrightScraper.ts   # 레거시 (화해 전용)
│   ├── strategies/                # Workflow 노드 전략
│   │   ├── HwahaeValidationNode.ts
│   │   ├── MusinsaValidationNode.ts   # 무신사 검증 노드 (HTTP API)
│   │   └── SupabaseSearchNode.ts
│   ├── llm/                       # LLM 모듈 (Product Labeling)
│   │   ├── index.ts               # Barrel export
│   │   ├── GeminiApiClient.ts     # Gemini REST API 클라이언트
│   │   ├── ProductLabelingService.ts  # 라벨링 파이프라인
│   │   ├── prompts/               # LLM 프롬프트
│   │   │   ├── normalizeProductPrompt.ts  # 정규화 프롬프트
│   │   │   └── classificationPrompt.ts    # 분류 프롬프트
│   │   └── postprocessors/        # 전처리/후처리 로직
│   │       ├── normalizePostprocessor.ts  # 정규화 후처리
│   │       └── labelPostprocessor.ts      # 라벨 전/후처리
│   ├── extractors/                # 데이터 추출기
│   │   ├── PriceExtractor.ts
│   │   └── StockExtractor.ts
│   ├── fetchers/                  # API Fetcher
│   │   └── HwahaeApiFetcher.ts
│   ├── validators/                # 검증기
│   │   └── HwahaeValidator.ts
│   ├── controllers/               # HTTP 컨트롤러
│   │   ├── ScanController.ts
│   │   └── ProductSearchController.ts
│   ├── middleware/                # 미들웨어
│   │   ├── errorHandler.ts
│   │   ├── requestLogger.ts
│   │   └── validation.ts
│   └── utils/                     # 유틸리티
│       ├── logger-context.ts       # 로거 컨텍스트 헬퍼
│       ├── timestamp.ts            # 타임스탬프 유틸
│       └── PlaywrightScriptExecutor.ts  # YAML 기반 액션 실행기
├── tests/                         # Jest 테스트
│   ├── hwahae-validation-node.test.ts
│   └── supabase.test.ts
├── scripts/                       # 독립 실행 스크립트
│   ├── test-hwahae-workflow.sh    # 화해 워크플로우 테스트
│   ├── test-oliveyoung-workflow.sh  # 올영 워크플로우 테스트
│   ├── test-oliveyoung-strategy.ts  # 올영 전략 단위 테스트
│   └── test-product-labeling.ts   # LLM 라벨링 테스트
├── workflows/                     # Workflow 정의 (JSON)
│   ├── hwahae-validation-v1.json    # 화해 검증 워크플로우
│   ├── oliveyoung-validation-v1.json  # 올영 검증 워크플로우
│   ├── musinsa-validation-v1.json   # 무신사 검증 워크플로우
│   ├── zigzag-validation-v1.json    # 지그재그 검증 워크플로우
│   ├── ably-validation-v1.json      # 에이블리 검증 워크플로우
│   └── dag-example-v1.json          # DAG 구조 예제
├── docs/                          # 문서
│   ├── hwahae-validator.md
│   ├── WORKFLOW.md                # Workflow 시스템 가이드
│   └── WORKFLOW_DAG.md            # DAG 구조 가이드
├── docker/                        # Docker 설정
│   ├── README.md
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
├── jest.config.js                 # Jest 설정
├── tsconfig.json                  # TypeScript 설정
├── tsconfig.test.json             # 테스트용 tsconfig
└── tsconfig.scripts.json          # 스크립트용 tsconfig
```

## 🔧 개발 환경 설정

### TypeScript 설정

프로젝트는 3개의 TypeScript 설정 파일로 구성됩니다:

#### 1. `tsconfig.json` (메인)

- **대상**: `src/` 디렉토리
- **용도**: 프로덕션 코드
- **타입 체크**: `npx tsc --noEmit`

#### 2. `tsconfig.scripts.json` (스크립트)

- **대상**: `scripts/` 디렉토리
- **용도**: 브라우저 DOM API 사용 스크립트
- **라이브러리**: ES2020 + DOM
- **타입 체크**: `npx tsc --project tsconfig.scripts.json --noEmit`

#### 3. `tsconfig.test.json` (테스트)

- **대상**: `tests/` 디렉토리
- **용도**: Jest 테스트 코드
- **타입**: node, jest
- **타입 체크**: `npx tsc --project tsconfig.test.json --noEmit`

### 의존성 설치

Docker compose dev 환경에서 실행 시 자동으로 설치됩니다:

```bash
# 개발 환경 시작 (Volume mount + Hot reload)
make dev

# 또는
docker compose -f docker/docker-compose.dev.yml up
```

로컬 개발 시:

```bash
npm install
```

### 타입 체크 실행

```bash
# 전체 타입 체크 (src만)
npm run type-check

# 스크립트 타입 체크
npx tsc --project tsconfig.scripts.json --noEmit

# 테스트 타입 체크
npx tsc --project tsconfig.test.json --noEmit
```

### Jest 테스트

```bash
# 테스트 실행
npm test

# Watch 모드
npm run test:watch

# 특정 테스트
npm run test:validation-node
```

### 문제 해결

#### `@types/jest` not found

Docker 환경에서는 자동으로 설치됩니다. 로컬 개발 시:

```bash
npm install
```

#### DOM API 타입 에러 (scripts/)

`tsconfig.scripts.json` 사용:

```bash
npx tsc --project tsconfig.scripts.json --noEmit
```

## 🚀 사용법

### 지원 플랫폼

| 플랫폼   | Platform ID  | 전략                              | 추출 방식                                        | 성능            |
| -------- | ------------ | --------------------------------- | ------------------------------------------------ | --------------- |
| 화해     | `hwahae`     | API (우선), Playwright (대체)     | REST API / DOM                                   | ~1초            |
| 올리브영 | `oliveyoung` | Playwright                        | DOM Selector                                     | ~5초            |
| 무신사   | `musinsa`    | HTTP API                          | Musinsa API                                      | ~1초 (8배 개선) |
| 지그재그 | `zigzag`     | GraphQL (우선), Playwright (대체) | GraphQL API (첫구매 쿠폰 처리) / `__NEXT_DATA__` | ~2초            |
| 에이블리 | `ably`       | Playwright                        | Network API 캡처 + Meta Tag Fallback             | ~4초            |
| 마켓컬리 | `kurly`      | Playwright                        | `__NEXT_DATA__` 파싱 + 상품 상태 감지            | ~3초            |

### API 문서

**📄 OpenAPI 3.0 스펙**: [`api.yaml`](./api.yaml)

전체 API 엔드포인트, 요청/응답 스키마, Shell 스크립트 사용법이 문서화되어 있습니다.

### API 버전 구조

| Version | 용도                        | 엔드포인트                                   |
| ------- | --------------------------- | -------------------------------------------- |
| **v1**  | 플랫폼 스캔 + Workflow 실행 | `/api/v1/platforms/*`, `/api/v1/workflows/*` |
| **v2**  | 상품 추출 전용 (Phase 2)    | `/api/v2/products/extract-*`                 |

- **v1**: 플랫폼별 스캔, 상품 검색, Phase 4 Workflow 실행
- **v2**: URL/ProductSet 기반 상품 추출 (Phase 2)
- **Health Check**: `/health` (루트 레벨)

### API 엔드포인트 (v2.1.0)

⚠️ **API v1 적용**: 모든 엔드포인트에 `/api/v1` 접두사 추가 및 플랫폼별 라우팅 도입

#### 1. 헬스체크

```bash
GET /health
```

#### 2. 플랫폼 목록 조회

```bash
GET /api/v1/platforms

# Response
{
  "platforms": ["hwahae", "oliveyoung"],
  "count": 2
}
```

#### 3. 플랫폼별 상품 스캔

##### 화해

```bash
# 기본 스캔 (API 우선, Playwright 대체)
POST /api/v1/platforms/hwahae/scan/:goodsId

# 전략 지정 (옵션)
POST /api/v1/platforms/hwahae/scan/:goodsId?strategyId=http-api

# 사용 가능한 전략 목록
GET /api/v1/platforms/hwahae/scan/strategies
```

##### 올리브영

```bash
# 브라우저 스캔
POST /api/v1/platforms/oliveyoung/scan/:goodsId

# 전략 목록
GET /api/v1/platforms/oliveyoung/scan/strategies
```

##### 무신사

```bash
# HTTP API 스캔 (8배 빠름)
POST /api/v1/platforms/musinsa/scan/:goodsNo

# 전략 목록
GET /api/v1/platforms/musinsa/scan/strategies

# Response 예시
{
  "success": true,
  "data": {
    "id": "4350236",
    "productNo": "4350236",
    "productName": "쿠션 파운데이션",
    "thumbnail": "https://image.msscdn.net/images/...",
    "originalPrice": 33000,
    "discountedPrice": 33000,
    "saleStatus": "on_sale"
  }
}
```

##### 지그재그

```bash
# GraphQL API 스캔 (우선)
POST /api/v1/platforms/zigzag/scan/:productId

# 전략 목록
GET /api/v1/platforms/zigzag/scan/strategies
```

##### 에이블리

```bash
# 브라우저 스캔 (Network API 캡처)
POST /api/v1/platforms/ably/scan/:goodsId

# 전략 목록
GET /api/v1/platforms/ably/scan/strategies
```

##### 마켓컬리

```bash
# 브라우저 스캔 (__NEXT_DATA__ 파싱)
POST /api/v1/platforms/kurly/scan/:productId

# 전략 목록
GET /api/v1/platforms/kurly/scan/strategies
```

##### 검증 (CSV vs API) - 화해 전용

```bash
POST /api/v1/platforms/hwahae/scan/validate
Content-Type: application/json

{
  "goodsId": "61560",
  "csvData": {
    "goods_no": "61560",
    "product_name": "블랙 쿠션 파운데이션",
    "price": "59900"
  }
}
```

#### 4. Supabase 상품 검색

**상품 검색 (쿼리 파라미터)**

```bash
GET /api/v1/products/search?query=hwahae&limit=10
```

**상품 ID 조회 (UUID)**

```bash
GET /api/v1/products/:productSetId
```

**Supabase 연결 상태**

```bash
GET /api/v1/products/health
```

### 환경 변수

```bash
# 서버 설정
PORT=3000
NODE_ENV=production

# Supabase 설정
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 데이터베이스 설정 (선택)
PRODUCT_TABLE_NAME=product_sets  # 기본값

# API 설정 (선택)
MAX_SEARCH_LIMIT=100      # 최대 검색 결과 개수
DEFAULT_SEARCH_LIMIT=3    # 기본 검색 결과 개수

# Workflow 설정 (선택)
WORKFLOW_PLATFORMS=default,hwahae,oliveyoung,coupang,zigzag,musinsa,ably,kurly,naver  # 지원 Platform 목록
WORKER_POLL_INTERVAL=5000 # Worker 폴링 간격 (ms)

# LLM 설정 (Product Labeling)
GEMINI_API_KEY=your-gemini-api-key  # Gemini API 키 (필수)
GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta  # API URL (선택)

# 로깅 설정 (선택)
LOG_LEVEL=info            # 로그 레벨: debug, info, warn, error
LOG_DIR=./logs            # 로그 파일 저장 디렉토리
LOG_PRETTY=true           # 개발 환경에서 예쁜 출력 (true/false)
TZ=Asia/Seoul             # 타임존 설정
```

## 🤖 LLM 모듈 (Product Labeling)

Gemini API를 사용하여 `product_name`에서 `normalized_product_name`과 `label`을 자동 생성하는 모듈입니다.

### 목적

- **normalized_product_name**: 증정품/프로모션 정보 추출 (본품 제거)
- **label**: 제품 카테고리 분류 (단품, 1+1, 리필, 거울, 크림 등)

### 처리 흐름

```mermaid
graph LR
    A[product_name] --> B[normalizeProductName]
    B --> C[normalized_product_name]
    C --> D[extractLabel]
    D --> E[label]
```

```
product_name: "[어워즈특가] 메디힐 에센셜 마스크 10+2매"
    ↓ Gemini API + 후처리 (본품 제거, 증정품 추출)
normalized_product_name: ""
    ↓ Gemini API + 전/후처리 (카테고리 분류)
label: "단품"
```

### 주요 기능

| 파일                        | 설명                                   |
| --------------------------- | -------------------------------------- |
| `GeminiApiClient.ts`        | Gemini REST API 클라이언트             |
| `ProductLabelingService.ts` | 메인 서비스 (파이프라인 통합)          |
| `postprocessors/`           | 전처리/후처리 로직 (리필, 1+1 패턴 등) |
| `prompts/`                  | 정규화/분류 프롬프트                   |

### 결과 예시

| product_name                     | normalized_product_name | label  |
| -------------------------------- | ----------------------- | ------ |
| `클리오 킬커버 쿠션 + 하트거울`  | `하트거울`              | `거울` |
| `에스쁘아 리퀴드 파운데이션 1+1` | `1+1`                   | `1+1`  |
| `아이오페 레티놀 세럼 + 리필`    | `리필`                  | `리필` |
| `롬앤 틴트 단품`                 | ``                      | `단품` |

### 테스트 실행

```bash
# Docker 개발 환경에서 실행
make dev

# 테스트 스크립트 (product_set_id 필요)
docker compose -f docker/docker-compose.dev.yml exec product_scanner_dev \
  npx tsx scripts/test-product-labeling.ts <product_set_id>
```

**환경변수**: `GEMINI_API_KEY` 필요 (`.env.local`에 설정)

## 📊 로깅 시스템

### Pino 기반 구조화 로깅

**주요 특징**:

- 구조화된 JSON 로깅 (파싱 및 분석 용이)
- 서비스별 로그 파일 분리 (server, worker)
- 일일 자동 로테이션 (YYYYMMDD 형식)
- Health check 요청 파일 로그 제외 (콘솔만)
- 타임존 지원 (Asia/Seoul)

### 로그 출력 전략

**콘솔 출력**:

- WARNING/ERROR: 항상 출력
- INFO: `important: true` 플래그 있는 로그만 출력
- Health check: 콘솔에만 출력

**파일 출력**:

- `server-YYYYMMDD.log`: API 서버 로그
- `worker-YYYYMMDD.log`: Worker 및 Repository 로그
- `error-YYYYMMDD.log`: 전체 에러 통합 로그
- 일일 로테이션, 30일 보관, 100MB 초과 시 자동 분할
- 1일 후 자동 gzip 압축

### 컨텍스트 추적

**Request 컨텍스트**:

```typescript
import { createRequestLogger } from "@/utils/logger-context";
const logger = createRequestLogger(requestId, method, path);
logger.info({ query, body }, "요청 수신");
```

**Job 컨텍스트** (Workflow):

```typescript
import { createJobLogger } from "@/utils/logger-context";
const logger = createJobLogger(jobId, workflowId);
logger.info({ status }, "Job 시작");
```

**중요 정보 로깅** (콘솔 출력):

```typescript
import { logImportant } from "@/utils/logger-context";
logImportant(logger, "워크플로우 완료", { workflowId, duration });
```

## 💾 Supabase 통합

### Repository Pattern 구현

**계층 구조**:

```text
ProductSearchController (HTTP)
    ↓
ProductSearchService (Facade)
    ↓
SupabaseProductRepository (Repository)
    ↓
Supabase Client (Singleton)
```

### 주요 기능

1. **상품 검색 (`search`)**
   - URL 패턴 기반 검색 (ILIKE)
   - 판매 상태 필터링
   - 결과 개수 제한

2. **상품 조회 (`findById`)**
   - UUID 기반 단일 상품 조회
   - 404 처리

3. **헬스체크 (`healthCheck`)**
   - Supabase 연결 상태 확인

### 데이터 모델

**ProductSet 도메인 엔티티**:

```typescript
{
  product_set_id: string,    // UUID
  product_id: string,         // UUID
  product_name: string | null,
  link_url: string | null,
  thumbnail?: string | null,
  sale_status?: string | null,
  original_price?: number | null,
  discounted_price?: number | null
}
```

### 검증

- **Zod 스키마 검증**: 모든 DB 레코드는 `ProductSetSchema`로 검증
- **도메인 엔티티**: `ProductSetEntity`로 변환하여 비즈니스 로직 처리
- **타입 안전성**: TypeScript strict mode로 완전한 타입 안전성 보장

## 📝 YAML 설정 예시

화해 플랫폼 설정은 [config/platforms/hwahae.yaml](src/config/platforms/hwahae.yaml)을 참고하세요.

## 🐳 Docker 개발/배포 환경

### 🚀 개발 환경 (Volume Mount + Hot Reload)

로컬에서 파일을 수정하면 자동으로 컨테이너에 반영되고 재시작됩니다.

```bash
# 1. 개발 환경 시작
make dev
# 또는: docker compose -f docker-compose.dev.yml up

# 2. 로컬에서 파일 수정
#    → 자동으로 tsx watch가 감지하여 재시작

# 3. 타입 체크 (컨테이너 내)
make type-check

# 4. 테스트 실행
make test

# 5. 작업 완료 후 종료
make down
```

**개발 환경 특징:**

- ✅ 로컬 파일 수정 → 즉시 Docker 컨테이너에 반영
- ✅ tsx watch로 hot reload (재빌드 불필요)
- ✅ node_modules 격리 (로컬/컨테이너 충돌 방지)
- ✅ 타입 체크 컨테이너 내 실행 (환경 100% 일치)

### 📦 배포 환경 (Multi-stage Build)

최적화된 production 이미지를 빌드하고 실행합니다.

```bash
# 배포용 이미지 빌드 & 실행
make prod

# 상태 확인
make status

# 로그 확인
make logs

# 종료
make down
```

### 🔍 주요 차이점

| 항목         | 개발 환경              | 배포 환경                   |
| ------------ | ---------------------- | --------------------------- |
| Dockerfile   | Dockerfile.dev         | Dockerfile (Multi-stage)    |
| Compose      | docker-compose.dev.yml | docker-compose.yml          |
| Volume Mount | ✅ Yes (./:/app)       | ❌ No                       |
| Hot Reload   | ✅ tsx watch           | ❌ tsx (일반)               |
| Image Size   | ~800MB                 | ~600MB (최적화)             |
| node_modules | 컨테이너 격리          | 이미지 내장                 |
| 빌드 시간    | 최초 1회               | 매번 빌드 (production only) |
| 용도         | 로컬 개발, 디버깅      | 배포, 운영 환경             |

### 📖 상세 가이드

자세한 Docker 설정 및 사용법은 [docker/README.md](./docker/README.md)를 참고하세요.

### ⚡ Makefile 명령어

```bash
make dev          # 개발 환경 시작
make down         # 개발 환경 종료
make prod         # 배포 환경 시작
make down         # 배포 환경 종료
make type-check   # 타입 체크 (컨테이너 내)
make test         # 테스트 실행
make logs         # 로그 확인
make clean        # 전체 정리 (컨테이너 & 이미지 삭제)
make help         # 도움말
```

## 🔍 모니터링 도구

### 실행 중인 Job 확인

현재 각 플랫폼에서 실행 중인 Job과 대기 중인 Queue 현황을 확인합니다.

#### CLI 스크립트

```bash
# 로컬 서버 조회 (기본)
./scripts/check-running-jobs.sh

# 원격 서버 조회
API_URL=http://production-server:3989 ./scripts/check-running-jobs.sh
```

**출력 예시**:

```
═══════════════════════════════════════════════════════════════
                    실행 중인 Job 현황
═══════════════════════════════════════════════════════════════

▶ oliveyoung [실행 중]
  Job ID:      019ac45d-9265-70ff-b335-2d85a3eb58af
  Workflow:    oliveyoung-validation-v2
  Started:     2025-11-27T08:11:01.578Z
  Elapsed:     15m 30s

───────────────────────────────────────────────────────────────
                      Queue 현황
───────────────────────────────────────────────────────────────

  hwahae: 3 jobs 대기 중
  musinsa: 1 jobs 대기 중

═══════════════════════════════════════════════════════════════
  실행 중: 1 jobs | 대기 중: 4 jobs
═══════════════════════════════════════════════════════════════
```

#### REST API

외부 시스템에서 Job 현황을 조회할 수 있습니다.

```bash
# 전체 현황 조회
GET /api/v2/jobs/running

# Response
{
  "success": true,
  "data": {
    "running": [
      {
        "platform": "oliveyoung",
        "job_id": "019ac45d-9265-70ff-b335-2d85a3eb58af",
        "workflow_id": "oliveyoung-validation-v2",
        "started_at": "2025-11-27T08:11:01.578Z",
        "elapsed_seconds": 930
      }
    ],
    "queued": {
      "hwahae": 3,
      "musinsa": 1
    },
    "summary": {
      "running_count": 1,
      "queued_count": 4
    }
  }
}
```

### Redis 키 구조

| 키 패턴                                | 용도                            |
| -------------------------------------- | ------------------------------- |
| `workflow:running:platform:{platform}` | 실행 중인 Job 정보 (JSON)       |
| `workflow:lock:platform:{platform}`    | 플랫폼별 분산 Lock              |
| `workflow:queue:platform:{platform}`   | 플랫폼별 Job Queue (Sorted Set) |

### Stale Job 정리

비정상 종료로 남은 stale 데이터 정리:

```bash
# 특정 플랫폼 running job 정리
docker exec product_scanner_redis_dev redis-cli DEL workflow:running:platform:oliveyoung

# 모든 running job 정리
docker exec product_scanner_redis_dev redis-cli KEYS "workflow:running:platform:*" | xargs -I {} docker exec product_scanner_redis_dev redis-cli DEL {}
```

### Worker 관리 (원격 재시작)

Stuck Job 발생 시 SSH 접속 없이 API를 통해 Worker를 재시작할 수 있습니다.

#### 동작 방식

1. API 호출 → Redis에 Kill Flag 설정 (TTL 60초)
2. 실행 중인 Job → FAILED 상태로 변경
3. Platform Lock 해제
4. Worker가 5초 내에 Kill Flag 감지 → `process.exit(1)`
5. Docker가 컨테이너 자동 재시작 (`restart: unless-stopped`)

#### CLI 스크립트

```bash
# Worker 상태 확인
./scripts/worker-control.sh status

# 특정 Worker 재시작
./scripts/worker-control.sh restart oliveyoung
./scripts/worker-control.sh restart hwahae

# 모든 Worker 재시작
./scripts/worker-control.sh restart all

# 원격 서버
API_URL=http://remote-server:3989 ./scripts/worker-control.sh status
```

**출력 예시**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Worker 상태 조회
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary:
  Total Workers: 7
  Running Jobs:  2
  Kill Flags:    0

Workers:
  PLATFORM     STATUS   KILL_FLAG  RUNNING_JOB
  ────────────────────────────────────────────────────
  oliveyoung   RUNNING  -          job_abc123 (372s)
  hwahae       IDLE     -          -
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### REST API

```bash
# Worker 상태 조회
GET /api/v2/workers/status

# Worker 재시작 요청
POST /api/v2/workers/{platform}/restart

# Platform Lock 강제 해제 (Worker 재시작 없이 Lock만 해제)
POST /api/v2/jobs/platform/{platform}/force-release
```

**재시작 응답 예시**:

```json
{
  "success": true,
  "message": "Worker restart requested for platform: oliveyoung",
  "data": {
    "platform": "oliveyoung",
    "kill_flag_set": true,
    "kill_flag_ttl_seconds": 60,
    "lock_released": true,
    "running_job": {
      "job_id": "019ac45d-9265-70ff-b335-2d85a3eb58af",
      "workflow_id": "oliveyoung-update-v2",
      "started_at": "2025-11-28T11:25:11.000Z",
      "marked_failed": true
    },
    "expected_restart_within_seconds": 10
  }
}
```

#### 사용 시나리오

| 상황                           | 권장 조치                                      |
| ------------------------------ | ---------------------------------------------- |
| Job이 예상보다 오래 실행됨     | `POST /workers/{platform}/restart`             |
| Worker 프로세스 응답 없음      | `POST /workers/{platform}/restart`             |
| Lock만 해제 필요 (Worker 정상) | `POST /jobs/platform/{platform}/force-release` |
| 전체 시스템 재시작 필요        | `./scripts/worker-control.sh restart all`      |

## 🔄 Multi-Worker Queue System

플랫폼별 독립 Worker 컨테이너 기반의 분산 처리 시스템입니다.

### 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                         Redis                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │ Queue:      │ │ Queue:      │ │ Queue:      │  ...           │
│  │ hwahae      │ │ oliveyoung  │ │ musinsa     │                │
│  └─────────────┘ └─────────────┘ └─────────────┘                │
└─────────────────────────────────────────────────────────────────┘
         │                 │                │
         ▼                 ▼                ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Worker:     │   │ Worker:     │   │ Worker:     │
│ hwahae      │   │ oliveyoung  │   │ musinsa     │
│ (API 2GB)   │   │ (Browser 4G)│   │ (API 2GB)   │
└─────────────┘   └─────────────┘   └─────────────┘
```

### Worker 컨테이너 구성

| Worker            | 플랫폼                                         | 타입    | 메모리 |
| ----------------- | ---------------------------------------------- | ------- | ------ |
| worker_hwahae     | hwahae                                         | API     | 2GB    |
| worker_oliveyoung | oliveyoung                                     | Browser | 4GB    |
| worker_musinsa    | musinsa                                        | API     | 2GB    |
| worker_zigzag     | zigzag                                         | API     | 2GB    |
| worker_ably       | ably                                           | Browser | 4GB    |
| worker_kurly      | kurly                                          | Browser | 4GB    |
| worker_extract    | url_extraction, single_product, multi_platform | Browser | 4GB    |
| worker_default    | default (기타)                                 | API     | 2GB    |

### 주요 특징

- **플랫폼별 독립 큐**: 각 플랫폼은 독립된 Redis Sorted Set 큐 사용
- **우선순위 기반 처리**: Job priority에 따른 처리 순서 결정
- **분산 Lock**: 플랫폼별 PlatformLock으로 동시 실행 방지
- **실행 상태 추적**: RUNNING_JOB 키로 현재 실행 중인 Job 모니터링
- **Graceful Shutdown**: SIGTERM/SIGINT 시 Lock 해제 및 상태 정리

## ⏰ Scheduler Service

자동으로 플랫폼별 Job을 스케줄링하는 서비스입니다.

### 스케줄링 규칙

| 설정               | 기본값 | 설명                                |
| ------------------ | ------ | ----------------------------------- |
| 플랫폼 간 간격     | 30초   | 서로 다른 플랫폼 Job 추가 간격      |
| 동일 플랫폼 쿨다운 | 5분    | 같은 플랫폼 Job 완료 후 대기 시간   |
| on_sale 비율       | 4:1    | on_sale 4회 → off_sale 1회 로테이션 |
| 기본 LIMIT         | 1000   | Job당 처리할 상품 수                |

### 작동 방식

```
┌──────────────────────────────────────────────────────────────────┐
│                        Scheduler Loop                             │
│                                                                   │
│  1. 활성화 상태 확인 (Redis: scheduler:enabled)                   │
│  2. 글로벌 쿨다운 확인 (30초 간격)                                │
│  3. 각 플랫폼 순회:                                               │
│     - Queue 비어있는지 확인                                       │
│     - 실행 중인 Job 없는지 확인                                   │
│     - 플랫폼 쿨다운 완료 확인 (5분)                               │
│  4. 조건 충족 시 새 Job 추가                                      │
│  5. on_sale/off_sale 로테이션 (4:1)                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### API 제어

스케줄러는 기본적으로 비활성화 상태로 시작됩니다. API를 통해 제어합니다.

```bash
# 상태 확인
GET /api/v2/scheduler/status

# 스케줄러 시작
POST /api/v2/scheduler/start

# 스케줄러 중지
POST /api/v2/scheduler/stop

# 스케줄러 중지 + 대기 큐 비우기
POST /api/v2/scheduler/stop?clear_queue=true
```

### CLI 스크립트

```bash
# 상태 확인
./scripts/scheduler-control.sh status

# 스케줄러 시작
./scripts/scheduler-control.sh start

# 스케줄러 중지
./scripts/scheduler-control.sh stop

# 스케줄러 중지 + 큐 비우기
./scripts/scheduler-control.sh stop --clear-queue
```

**출력 예시**:

```
═══════════════════════════════════════════════════════════════
                     스케줄러 상태
═══════════════════════════════════════════════════════════════

  활성화 상태: ✓ 활성화됨
  컨테이너:    ✓ 실행 중
  총 스케줄 Job: 42
  마지막 Heartbeat: 2025-11-28T01:00:05.497Z

───────────────────────────────────────────────────────────────
                        설정
───────────────────────────────────────────────────────────────

  플랫폼: hwahae, oliveyoung, zigzag, musinsa, ably, kurly
  플랫폼 간 간격: 30초
  동일 플랫폼 쿨다운: 300초
  on_sale 비율: 4:1
  기본 LIMIT: 1000

═══════════════════════════════════════════════════════════════
```

### 환경 변수

```bash
# Scheduler 설정 (docker-compose.dev.yml)
SCHEDULER_PLATFORMS=hwahae,oliveyoung,zigzag,musinsa,ably,kurly
SCHEDULER_CHECK_INTERVAL_MS=10000        # 체크 주기 (10초)
SCHEDULER_INTER_PLATFORM_DELAY_MS=30000  # 플랫폼 간 간격 (30초)
SCHEDULER_SAME_PLATFORM_COOLDOWN_MS=300000  # 동일 플랫폼 쿨다운 (5분)
SCHEDULER_ON_SALE_RATIO=4                # on_sale 비율 (4:1)
SCHEDULER_DEFAULT_LIMIT=1000             # 기본 LIMIT
```

### Crontab vs Scheduler

| 항목             | Crontab              | Scheduler Service                      |
| ---------------- | -------------------- | -------------------------------------- |
| 실행 방식        | 고정 시간            | 동적 (이전 Job 완료 기반)              |
| 유휴 시간        | 있음 (2시간 간격 내) | 최소화 (쿨다운만)                      |
| Rate Limit       | 수동 관리            | 자동 (플랫폼 간 30초, 동일 플랫폼 5분) |
| on_sale/off_sale | 시간대별 수동 설정   | 자동 로테이션 (4:1)                    |
| 확장성           | 플랫폼 추가 시 수동  | 환경변수로 즉시 반영                   |

## 🔔 Alert Watcher Service

테이블 모니터링 서비스로, 주요 테이블의 상품 접근성을 주기적으로 검사하고 실패 시 Slack으로 알림을 발송합니다.

### 감시 대상 테이블

| 테이블          | 모니터 노드              | 설명                         |
| --------------- | ------------------------ | ---------------------------- |
| collabo_banners | CollaboBannerMonitorNode | 활성 콜라보 배너 상품 접근성 |
| votes           | VotesMonitorNode         | 활성 투표 (A/B) 상품 접근성  |
| pick_sections   | PickSectionsMonitorNode  | Pick Sections 상품 접근성    |

### 동작 방식

1. **순차 실행**: 각 모니터 작업을 10초 간격으로 등록
2. **쿨다운**: 각 작업 완료 후 20분 대기
3. **플랫폼 필터링**: 기본적으로 6개 주요 플랫폼만 Alert 발송
   - oliveyoung, hwahae, musinsa, zigzag, ably, kurly
4. **시간대 예외**: 15:00-15:30 KST에는 필터링 없이 전체 Alert 발송
5. **Slack 알림**: 문제 발견 시에만 ALERT_SLACK_CHANNEL_ID로 알림 발송
   - "문제 없음" 상태에서는 Slack 알림을 보내지 않음
6. **JSONL 결과 저장**: 모든 모니터링 결과를 JSONL 파일로 저장
   - 경로: `results/{YYYY-MM-DD}/job_monitor_{type}_{job_id}.jsonl`
   - 문제 있음/없음 모두 기록
7. **로그 출력**: 성공/실패 상태를 터미널 및 파일 로그에 기록
   - worker_alert 컨테이너에서 실행되어 로그 분리

### API 제어

```bash
# 상태 확인
GET /api/v2/alert-watcher/status

# Alert Watcher 시작
POST /api/v2/alert-watcher/start

# Alert Watcher 중지
POST /api/v2/alert-watcher/stop

# Alert Watcher 중지 + 대기 큐 비우기
POST /api/v2/alert-watcher/stop?clear_queue=true
```

### CLI 스크립트

```bash
# 상태 확인
./scripts/alert-watcher-control.sh status

# Alert Watcher 시작
./scripts/alert-watcher-control.sh start

# Alert Watcher 중지
./scripts/alert-watcher-control.sh stop

# Alert Watcher 중지 + 큐 비우기
./scripts/alert-watcher-control.sh stop --clear-queue

# 개별 모니터 테스트
./scripts/test-collabo-banner-monitor.sh
./scripts/test-votes-monitor.sh
./scripts/test-pick-sections-monitor.sh
```

**출력 예시**:

```
═══════════════════════════════════════════════════════════════
                   Alert Watcher 상태
═══════════════════════════════════════════════════════════════

  활성화 상태: ✓ 활성화됨
  컨테이너:    ✓ 실행 중
  총 실행 Job: 42

───────────────────────────────────────────────────────────────
                  현재 실행 중인 작업
───────────────────────────────────────────────────────────────

  현재 실행 중인 작업이 없습니다.

───────────────────────────────────────────────────────────────
                     등록된 감시 작업
───────────────────────────────────────────────────────────────

  • collabo_banner - Collabo Banner Monitor (20분 간격)
  • votes - Votes Monitor (20분 간격)
  • pick_sections - Pick Sections Monitor (20분 간격)

═══════════════════════════════════════════════════════════════
```

### 환경 변수

```bash
# Alert 설정
ALERT_SLACK_CHANNEL_ID=C0123456789   # Alert 전용 Slack 채널
SLACK_BOT_TOKEN=xoxb-your-token      # Slack Bot 토큰
```

### Alert 메시지 예시

**성공 시**:

```
✅ Collabo Banner 모니터링 완료 - 문제 없음
```

**실패 시**:

```
🚨 Collabo Banner Alert - 2건 실패
─────────────────────
• banner_id: 123
• product_set_id: abc-def-123
• link_url: https://www.oliveyoung.co.kr/...
• error: Fetch failed (null or not_found)

• banner_id: 456
• product_set_id: xyz-789
• link_url: https://www.musinsa.com/...
• error: Product not found in DB
─────────────────────
```

## 📊 주요 특징

### 제네릭 기반 멀티 플랫폼 지원

- **플랫폼 독립 설계**: `IProduct`, `IScanner<TProduct>` 인터페이스
- **타입 안전 확장**: 새 플랫폼 추가 시 컴파일 타임 검증
- **코드 재사용**: BaseScanner<TRawData, TProduct, TConfig>
- **YAML 설정**: 플랫폼별 전략을 YAML로 정의

### 다중 전략 스크래핑

- **화해**: API 우선 (빠름), Playwright 대체 (안정)
- **올리브영**: Playwright 브라우저 전용 + 병렬 처리
- **무신사**: HTTP API 직접 호출 (8배 성능 개선)
- **자동 대체**: 전략 실패 시 다음 우선순위 전략 실행
- **검증 기능**: CSV vs API 데이터 비교 (화해 전용)

### 브라우저 인스턴스 풀링 (Object Pool Pattern)

- **BrowserPool**: 브라우저 인스턴스 재사용으로 리소스 최적화
- **동적 관리**: 수요에 따른 인스턴스 자동 생성/제거
- **헬스 체크**: 비정상 인스턴스 자동 교체
- **동시성 제어**: 최대 동시 실행 수 제한 (YAML 설정)

### Repository Pattern

- **추상화**: `IProductRepository` 인터페이스로 데이터 접근 분리
- **테스트 가능**: DI로 Mock Repository 주입
- **Singleton**: Supabase 클라이언트 재사용

### 타입 안전성

- **TypeScript Strict Mode**: 100% 타입 안전
- **Zod 검증**: 런타임 데이터 검증
- **제네릭 타입**: 컴파일 타임 타입 에러 방지
- **도메인 엔티티**: 비즈니스 로직 캡슐화

### 테스트 인프라

- **Jest**: 단위 테스트 프레임워크
- **타입 안전 테스트**: tsconfig.test.json 분리
- **독립 실행**: 테스트 환경 격리

## 🔒 보안

- **환경 변수**: Supabase Service Role Key는 환경 변수로 관리
- **입력 검증**: Middleware를 통한 요청 파라미터 검증
- **에러 처리**: 민감한 정보 노출 방지

## ⚡ 성능

- **Singleton Pattern**: Supabase 클라이언트 재사용
- **쿼리 최적화**: 필요한 필드만 SELECT
- **다중 전략**: API 우선으로 응답 시간 단축
- **병렬 처리**: Workflow 배치 병렬 실행 (올리브영: 최대 88% 성능 개선)

## 🔄 Workflow 시스템

대량 상품 검증을 자동화하는 워크플로우 시스템을 지원합니다.

### 주요 특징

- ✅ **DAG 구조 지원**: 분기(Fork), 합류(Join), 조건부 분기 가능
- ✅ **JSON 기반 설정**: 코드 수정 없이 워크플로우 추가
- ✅ **비동기 처리**: Redis Job Queue + Background Worker
- ✅ **자동 검증**: 워크플로우 로드 시 구조 검증
- ✅ **Multi-Platform 지원**: Platform별 병렬 처리 (8개 쇼핑몰 + default)
- ✅ **Job 메타데이터**: 시작/완료 시각 자동 기록 및 결과 파일 저장

### 간단한 예제

```bash
# Job 등록 (Platform 지정)
curl -X POST http://localhost:3000/api/v1/workflows/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "bulk-validation-v1",
    "params": {
      "platform": "hwahae",
      "link_url_pattern": "%hwahae.co.kr%",
      "limit": 2
    },
    "priority": 5
  }'

# Response
{"success":true,"job_id":"019a33de-da41-777a-be17-0b16bb38e3eb","message":"Workflow execution started"}

# 상태 확인
curl http://localhost:3000/api/v1/workflows/jobs/{job_id}
```

### Platform별 Job 실행

지원 Platform: `default`, `hwahae`, `oliveyoung`, `coupang`, `zigzag`, `musinsa`, `ably`, `kurly`, `naver`

- **Platform 지정**: `params.platform`으로 큐 선택 (미지정 시 `default`)
- **결과 파일명**: `job_{platform}_{job_id}.json` 형식으로 자동 생성
- **병렬 처리**: Platform별 독립 큐로 동시 실행 가능

### 병렬 처리 (Concurrency)

올리브영 Workflow는 배치 병렬 처리를 지원하여 대량 상품 검증 성능을 향상시킵니다.

**성능 개선**:

- 순차 처리 (concurrency: 1): 800개 → 67분
- 4병렬 처리 (concurrency: 4): 800개 → 17분 (75% 개선)
- 8병렬 처리 (concurrency: 8): 800개 → 8.3분 (88% 개선)

**설정 방법**:

```json
// workflows/oliveyoung-validation-v1.json
{
  "2": {
    "config": {
      "concurrency": 8 // 1~10 (YAML max 제한)
    }
  }
}
```

**주의사항**:

- 초기 배포 시 `concurrency: 1`로 시작 권장
- 리소스 모니터링 후 점진적 증가 (1 → 4 → 8)
- 자세한 내용: **[PARALLEL_PROCESSING_TEST.md](docs/PARALLEL_PROCESSING_TEST.md)**

### 문서

- **[WORKFLOW.md](docs/WORKFLOW.md)** - 워크플로우 시스템 전체 가이드
- **[WORKFLOW_DAG.md](docs/WORKFLOW_DAG.md)** - DAG 구조 상세 가이드
- **[PARALLEL_PROCESSING_TEST.md](docs/PARALLEL_PROCESSING_TEST.md)** - 병렬 처리 성능 테스트 가이드

## 🔔 Slack Bot 알림

Workflow 완료 시 Slack으로 결과를 자동 알림합니다.

### 알림 내용

- **Workflow 유형**: Platform Update / URL Extraction / ProductSet Extraction
- **처리 결과**: 총 상품 수, 성공/실패 수, 소요 시간
- **상태별 분류**: on_sale, off_sale, sold_out, product_deleted, error
- **Sale Status 변경**: 이전 상태 → 현재 상태 변경 내역

### 환경 변수

```bash
# Slack Bot 설정
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL_ID=C0123456789
```

### 알림 예시

```
🔔 oliveyoung update 완료

📊 처리 결과
• 총 상품: 100개
• 성공: 98개 | 실패: 2개
• 소요 시간: 5분 30초

📈 상태별 분류
• on_sale: 85개
• off_sale: 10개
• sold_out: 3개

🔄 Sale Status 변경: 5건
• on_sale → off_sale: 3건
• off_sale → on_sale: 2건
```

## ⏱️ Rate Limiting 설정

플랫폼별 YAML 설정에서 Rate Limiting을 제어합니다.

### 플랫폼별 설정

| 플랫폼     | wait_time_ms | batch_size | concurrency | 처리 방식           |
| ---------- | ------------ | ---------- | ----------- | ------------------- |
| hwahae     | 1000         | 10         | 5           | API (병렬 배치)     |
| musinsa    | 2500         | 10         | 1           | API (순차 배치)     |
| zigzag     | 1000         | 10         | 5           | GraphQL (병렬 배치) |
| oliveyoung | 5000         | 5          | 1           | Browser (순차 배치) |
| ably       | 5000         | 5          | 1           | Browser (순차 배치) |
| kurly      | 5000         | 5          | 1           | Browser (순차 배치) |

### 배치 처리 방식

```
# 순차 배치 (concurrency: 1)
Batch 1 [5개] → 완료 → Batch 2 [5개] → 완료 → ...

# 병렬 배치 (concurrency: 5)
Batch 1 [10개, 5병렬] → 완료 → Batch 2 [10개, 5병렬] → ...
```

### YAML 설정 예시

```yaml
# config/platforms/musinsa.yaml
workflow:
  rate_limit:
    enabled: true
    wait_time_ms: 2500 # 각 상품 스캔 간 대기 시간
  concurrency:
    max: 1 # 순차 처리 (API 차단 방지)
    default: 1
```

## 📝 변경 이력

### v2.6.1 (2025-12-03) - Alert Watcher 개선

**주요 변경사항**:

- ✅ **JSONL 결과 저장**: 모니터링 결과를 JSONL 파일로 저장
- ✅ **Slack 알림 조건 변경**: "문제 없음" 시 Slack 알림 미발송
- ✅ **로그 개선**: 성공/실패 상태를 터미널 및 파일 로그에 명시적 기록

**기술적 개선**:

- `MonitorResultWriter`: 모니터링 전용 JSONL 저장 유틸리티 추가
- 모든 모니터 노드: important 플래그로 로그 가시성 향상
- 결과 파일 경로: `results/{YYYY-MM-DD}/job_monitor_{type}_{job_id}.jsonl`

### v2.6.0 (2025-12-02) - Alert Watcher 테이블 모니터링

**주요 변경사항**:

- ✅ **Alert Watcher**: 테이블 모니터링 서비스 추가
- ✅ **모니터 노드**: CollaboBanner, Votes, PickSections 모니터 구현
- ✅ **플랫폼 필터링**: 6개 주요 플랫폼만 Alert 발송
- ✅ **시간대 예외**: 15:00-15:30 KST 필터링 우회

**감시 대상 테이블**:

- `collabo_banners`: 활성 콜라보 배너 상품 접근성
- `votes`: 활성 투표 (A/B) 상품 접근성
- `pick_sections`: Pick Sections 상품 접근성

**API 엔드포인트**:

- `GET /api/v2/alert-watcher/status` - 상태 조회
- `POST /api/v2/alert-watcher/start` - 시작
- `POST /api/v2/alert-watcher/stop` - 중지

**CLI 스크립트**:

- `alert-watcher-control.sh` - Alert Watcher 제어
- `test-collabo-banner-monitor.sh` - Collabo Banner 테스트
- `test-votes-monitor.sh` - Votes 테스트
- `test-pick-sections-monitor.sh` - Pick Sections 테스트

### v2.5.0 (2025-12-01) - Worker 원격 재시작 기능

**주요 변경사항**:

- ✅ **Worker 원격 재시작**: Kill Flag 기반 Worker 재시작 API
- ✅ **Worker 상태 조회**: 전체 Worker 상태 및 Kill Flag 확인 API
- ✅ **CLI 스크립트**: `worker-control.sh` 추가
- ✅ **Redis Singleton**: RedisWorkflowRepository 연결 누수 수정

**기술적 개선**:

- `worker.ts`: setInterval 기반 Kill Flag 체크 (5초 간격)
- `workers.router.ts`: Worker 관리 API 추가
- `RedisWorkflowRepository.ts`: Singleton 패턴 적용
- Docker Compose: 모든 서비스에 `restart: unless-stopped` 적용

**API 엔드포인트**:

- `GET /api/v2/workers/status` - Worker 상태 조회
- `POST /api/v2/workers/{platform}/restart` - Worker 재시작

### v2.4.0 (2025-11-28) - Rate Limiting 및 배치 순차 처리 수정

**주요 변경사항**:

- ✅ **배치 순차 처리**: Promise.all → for...await 순차 실행으로 변경
- ✅ **Slack 알림 버그 수정**: kurly "url" 오감지 문제 해결
- ✅ **Sale Status 표시**: 모든 플랫폼에서 Sale Status 변경 내역 표시
- ✅ **API 문서 추가**: OpenAPI 3.0 스펙 (`api.yaml`)

**기술적 개선**:

- `ScanProductNode.ts`: 배치 간 순차 실행으로 Rate Limiting 준수
- `NotifyResultNode.ts`: workflowId 패턴 매칭 개선 (`includes("url")` → 특정 패턴)
- Concurrency는 배치 내 병렬 수만 제어 (배치 간은 항상 순차)

### v2.3.0 (2025-11-27) - Multi-Worker Queue System & Scheduler

**주요 변경사항**:

- ✅ **Multi-Worker 시스템**: 플랫폼별 독립 Worker 컨테이너
- ✅ **Scheduler Service**: 자동 Job 스케줄링 (30초 간격, 5분 쿨다운)
- ✅ **UUID7 적용**: Job ID, Request ID에 시간 기반 UUID 사용
- ✅ **Slack Bot 알림**: Workflow 완료 시 자동 알림

**Worker 구성**:

- API Worker: hwahae, musinsa, zigzag (2GB)
- Browser Worker: oliveyoung, ably, kurly (4GB)
- Extract Worker: url_extraction, single_product (4GB)

**Scheduler 설정**:

- 플랫폼 간 간격: 30초
- 동일 플랫폼 쿨다운: 5분
- on_sale:off_sale 비율: 4:1

### v2.2.0 (2025-11-12) - 무신사 HTTP API 전환

**주요 변경사항**:

- ✅ **무신사 스크래핑 전략 전환**: Playwright → HTTP API 직접 호출
- ✅ **성능 개선**: 8배 빠른 응답 속도 (~8초 → ~1초)
- ✅ **정확도 향상**: API 직접 조회로 정가/할인가 100% 정확 추출
- ✅ **리소스 최적화**: 브라우저 인스턴스 불필요

**기술적 개선**:

- 새 파일: `MusinsaHttpScanner.ts` - HTTP API 전용 스캐너
- 업데이트: `MusinsaValidationNode.ts` - HTTP API 스캐너 사용
- 업데이트: `musinsa.yaml` - HTTP strategy 설정 추가
- 업데이트: `musinsa-validation-v1.json` - workflow 타임아웃 감소 (60s → 30s)

**API 엔드포인트**:

- `https://goods-detail.musinsa.com/api2/goods/{goodsId}`
- Response: `goodsNm`, `goodsPrice.normalPrice`, `goodsPrice.salePrice`, `goodsSaleType`

**테스트 결과**:

- ✅ 6/6 테스트 통과 (on_sale, sold_out, off_sale)
- ✅ Type check 통과 (0 errors)
- ✅ Workflow 검증 완료 (5/5 products)

## 🚀 TypedNodeStrategy 시스템

타입 안전한 노드 전략 시스템으로, `ITypedNodeStrategy<TInput, TOutput>` 인터페이스 기반의 강타입 워크플로우 노드를 제공합니다.

### 특징

- **타입 안전성**: 입출력 타입이 컴파일 타임에 검증됨
- **PlatformScannerRegistry**: 통합 스캐너 레지스트리 패턴
- **Browser/API 자동 분기**: 플랫폼 유형에 따른 자동 스캔 방식 선택

### 워크플로우 목록

| Workflow ID                         | 용도                          | 노드 타입                                                  |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `{platform}-validation-v2`          | 플랫폼별 상품 검증            | fetch → scan → validate → compare → save → notify          |
| `{platform}-update-v2`              | 플랫폼별 상품 업데이트        | fetch → scan → validate → compare → save → update → notify |
| `extract-url-validation-v2`         | URL 기반 단일 상품 추출       | `extract_url`                                              |
| `extract-product-set-validation-v2` | ProductSet ID 기반 추출       | `extract_product_set`                                      |
| `extract-product-set-update-v2`     | ProductSet ID 추출 + 업데이트 | `extract_product_set` → `update_product_set`               |
| `extract-product-validation-v2`     | Product UUID 멀티 플랫폼 추출 | `extract_product`                                          |
| `extract-product-update-v2`         | Product UUID 추출 + 업데이트  | `extract_product` → `update_product_set`                   |

### 테스트 스크립트

#### 1. 플랫폼별 Validation/Update

```bash
# Validation (검증만)
LIMIT=4 SALE_STATUS=on_sale ./scripts/test-oliveyoung-validation.sh
LIMIT=4 SALE_STATUS=on_sale ./scripts/test-hwahae-validation.sh
LIMIT=4 SALE_STATUS=on_sale ./scripts/test-musinsa-validation.sh
LIMIT=4 SALE_STATUS=on_sale ./scripts/test-zigzag-validation.sh
LIMIT=4 SALE_STATUS=on_sale ./scripts/test-ably-validation.sh
LIMIT=4 SALE_STATUS=on_sale ./scripts/test-kurly-validation.sh

# Update (검증 + DB 업데이트)
LIMIT=4 SALE_STATUS=off_sale ./scripts/test-oliveyoung-update.sh
LIMIT=4 SALE_STATUS=off_sale ./scripts/test-hwahae-update.sh
LIMIT=4 SALE_STATUS=off_sale ./scripts/test-musinsa-update.sh
LIMIT=4 SALE_STATUS=off_sale ./scripts/test-zigzag-update.sh
LIMIT=4 SALE_STATUS=off_sale ./scripts/test-ably-update.sh
LIMIT=4 SALE_STATUS=off_sale ./scripts/test-kurly-update.sh
```

#### 2. URL 기반 추출

단일 URL에서 상품 정보 추출 (DB 비교 없음)

```bash
./scripts/test-extract-url-validation.sh https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do\?goodsNo\=A000000233334
./scripts/test-extract-url-validation.sh https://m.a-bly.com/goods/4096430
./scripts/test-extract-url-validation.sh https://www.kurly.com/goods/1001272724
./scripts/test-extract-url-validation.sh https://www.hwahae.co.kr/goods/62599
./scripts/test-extract-url-validation.sh https://www.musinsa.com/products/1311210
./scripts/test-extract-url-validation.sh https://zigzag.kr/catalog/products/165437822
```

#### 3. ProductSet ID 기반 추출

Supabase product_set.id로 단일 상품 추출 (DB 비교 포함)

```bash
# Validation (검증만)
./scripts/test-extract-product-set-validation.sh 03dfc6d7-bcfe-41ad-b676-96396379e893  # musinsa
./scripts/test-extract-product-set-validation.sh 2a297564-edc3-4465-aa2b-412f27b44848  # ably
./scripts/test-extract-product-set-validation.sh 42e56545-dc2d-451b-90bc-b612f3b400dd  # zigzag
./scripts/test-extract-product-set-validation.sh 6d97e3e9-a835-4a41-b0bd-2c47046b2e21  # oliveyoung
./scripts/test-extract-product-set-validation.sh 710bf70e-5216-4463-8b2a-f480b2e393e9  # kurly
./scripts/test-extract-product-set-validation.sh 7ca3defa-5dd3-41dd-809d-57468b2e82ca  # hwahae

# Update (검증 + DB 업데이트)
./scripts/test-extract-product-set-update.sh 2d6d45e0-876c-4ad4-b04e-13249e7b8e55  # musinsa
./scripts/test-extract-product-set-update.sh 85469c7b-7137-491b-aa4a-53029a8feb9f  # zigzag
./scripts/test-extract-product-set-update.sh cdf36183-a449-43af-92cc-af39ebfe0520  # oliveyoung
./scripts/test-extract-product-set-update.sh d0078239-2e34-4d40-a48e-01c7d0268380  # ably
./scripts/test-extract-product-set-update.sh deb82c6c-fd11-4788-ab98-102a1d5d9c15  # kurly
```

#### 4. Product UUID 멀티 플랫폼 추출

Product ID로 모든 플랫폼의 product_set 조회 후 일괄 추출 (DB 비교 포함)

```bash
# Validation (검증만)
./scripts/test-extract-product-validation.sh b2000182-42a0-4d31-a07d-b1a8670117ea
./scripts/test-extract-product-validation.sh 93674c02-a017-4f58-90db-23e6e3f516a0

# Update (검증 + DB 업데이트)
./scripts/test-extract-product-update.sh 702b3d1a-5182-4817-93f5-613946d07695
SALE_STATUS=on_sale ./scripts/test-extract-product-update.sh 702b3d1a-5182-4817-93f5-613946d07695
SALE_STATUS=off_sale ./scripts/test-extract-product-update.sh 702b3d1a-5182-4817-93f5-613946d07695
```

### 노드 타입

| 노드 타입             | 클래스                  | 용도                                                 |
| --------------------- | ----------------------- | ---------------------------------------------------- |
| `extract_url`         | `ExtractUrlNode`        | URL → 플랫폼 감지 → 스캔                             |
| `extract_product_set` | `ExtractProductSetNode` | ProductSet ID → DB 조회 → 스캔 → 비교                |
| `extract_product`     | `ExtractProductNode`    | Product ID → 다중 ProductSet 조회 → 멀티 플랫폼 스캔 |
| `update_product_set`  | `UpdateProductSetNode`  | JSONL 파싱 → Supabase 배치 업데이트                  |

### Crontab 설정 (외부 서버 참고용)

```bash
## 4 groups - 30분 단위 로테이션, 2시간 주기
## SALE_STATUS: on_sale (기본), off_sale (새벽/오후)
## off_sale 타임라인: 4:20 → 4:50 → 5:20 → 5:50 (30분 간격 유지)

# ─────────────────────────────────────────────────────────────
# 그룹 1: hwahae, oliveyoung - 짝수 시간 20분 (4시, 16시 제외)
# ─────────────────────────────────────────────────────────────
# on_sale (4, 16 제외)
20 0,2,6,8,10,12,14,18,20,22 * * * LIMIT=1000 SALE_STATUS=on_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-hwahae-update.sh
20 0,2,6,8,10,12,14,18,20,22 * * * LIMIT=1000 SALE_STATUS=on_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-oliveyoung-update.sh
# off_sale (4시, 16시)
20 4,16 * * * LIMIT=1000 SALE_STATUS=off_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-hwahae-update.sh
20 4,16 * * * LIMIT=1000 SALE_STATUS=off_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-oliveyoung-update.sh

# ─────────────────────────────────────────────────────────────
# 그룹 2: zigzag, ably - 짝수 시간 50분 (4시, 16시 제외)
# ─────────────────────────────────────────────────────────────
# on_sale (4, 16 제외)
50 0,2,6,8,10,12,14,18,20,22 * * * LIMIT=1000 SALE_STATUS=on_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-zigzag-update.sh
50 0,2,6,8,10,12,14,18,20,22 * * * LIMIT=1000 SALE_STATUS=on_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-ably-update.sh
# off_sale (4시, 16시)
50 4,16 * * * LIMIT=1000 SALE_STATUS=off_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-zigzag-update.sh
50 4,16 * * * LIMIT=1000 SALE_STATUS=off_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-ably-update.sh

# ─────────────────────────────────────────────────────────────
# 그룹 3: musinsa - 홀수 시간 20분 (5시, 17시 제외)
# ─────────────────────────────────────────────────────────────
# on_sale (5, 17 제외)
20 1,3,7,9,11,13,15,19,21,23 * * * LIMIT=1000 SALE_STATUS=on_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-musinsa-update.sh
# off_sale (5시, 17시)
20 5,17 * * * LIMIT=1000 SALE_STATUS=off_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-musinsa-update.sh

# ─────────────────────────────────────────────────────────────
# 그룹 4: kurly - 홀수 시간 50분 (5시, 17시 제외)
# ─────────────────────────────────────────────────────────────
# on_sale (5, 17 제외)
50 1,3,7,9,11,13,15,19,21,23 * * * LIMIT=1000 SALE_STATUS=on_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-kurly-update.sh
# off_sale (5시, 17시)
50 5,17 * * * LIMIT=1000 SALE_STATUS=off_sale /home/grandeclip/project/scoob-scraper/product_scanner/scripts/test-kurly-update.sh
```

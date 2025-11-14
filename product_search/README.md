# Docker Scraper Server

쇼핑몰별 상품 검색 스크래퍼 서버 - YAML 설정 기반으로 코드 수정 없이 새 쇼핑몰을 추가할 수 있습니다.

## 📌 용도

"기획 세트 등록" 페이지에서 각 쇼핑몰별 키워드 검색을 수행합니다.
브랜드명과 상품명으로 올리브영, 무신사, 지그재그 등 다양한 쇼핑몰에서 상품을 검색합니다.

## 🏗️ 아키텍처

### 디자인 패턴

- **Strategy Pattern**: 쇼핑몰별 스크래핑 전략 (설정 기반)
- **Template Method Pattern**: 공통 스크래핑 흐름 정의
- **Factory Pattern**: 스크래퍼 인스턴스 생성
- **Registry Pattern**: 스크래퍼 캐싱 및 관리
- **Singleton Pattern**: 설정 로더 및 레지스트리
- **Command Pattern**: 브라우저 액션 실행
- **Facade Pattern**: 서비스 계층 단순화

### SOLID 원칙

- **SRP**: 각 클래스는 단일 책임만 가짐
- **OCP**: 확장에 열려있고 수정에 닫혀있음
- **LSP**: 모든 하위 클래스는 상위 클래스로 대체 가능
- **ISP**: 클라이언트별 인터페이스 분리
- **DIP**: 추상화에 의존

## 📁 디렉토리 구조

```text
product_search/
├── server.ts                      # 엔트리포인트 (~95줄)
├── config/
│   ├── malls/                     # 쇼핑몰별 YAML 설정
│   │   ├── oliveyoung.yaml
│   │   ├── zigzag.yaml
│   │   ├── musinsa.yaml
│   │   ├── ably.yaml
│   │   └── kurly.yaml
│   └── ConfigLoader.ts            # YAML 로더
├── core/
│   ├── domain/                    # 도메인 모델
│   └── interfaces/                # 인터페이스 정의
├── services/
│   ├── ScraperService.ts          # 비즈니스 로직
│   └── ScraperRegistry.ts         # 레지스트리
├── scrapers/
│   ├── base/
│   │   ├── BaseScraper.ts         # 베이스 클래스
│   │   └── ScraperFactory.ts      # 팩토리
│   └── ConfigDrivenScraper.ts     # YAML 기반 스크래퍼
├── navigators/
│   ├── PageNavigator.ts           # 네비게이션 오케스트레이터
│   └── ActionExecutor.ts          # 액션 실행기
├── extractors/
│   ├── EvaluateExtractor.ts       # page.evaluate 추출
│   └── SelectorExtractor.ts       # Playwright API 추출
├── controllers/
│   └── ScrapeController.ts        # HTTP 컨트롤러
└── middleware/
    ├── errorHandler.ts            # 에러 핸들러
    └── validation.ts              # 요청 검증
```

## 🚀 사용법

### 서버 실행 (Docker Compose)

```bash
# 루트 디렉토리에서
docker-compose up -d product-search

# 또는 개발 환경
cd product_search
npm install
npm start
```

### CLI 도구 사용 (권장)

**전제조건**: Docker Compose로 서버가 실행 중이어야 함 (`docker-compose up -d product-search`)

`product-search-cli.ts`로 실행 중인 서버에 요청을 보낼 수 있습니다.

#### 기본 사용법

```bash
cd product_search
npx tsx product-search-cli.ts <mall> <brand> <productName>
```

#### 단일 쇼핑몰

```bash
npx tsx product-search-cli.ts oliveyoung "라운드랩" "선크림"
npx tsx product-search-cli.ts hwahae "삐아" "레디 투 웨어 다우니 치크"
npx tsx product-search-cli.ts ably "클리오" "킬커버 파운데이션"
```

#### 여러 쇼핑몰 (쉼표로 구분, 병렬 실행)

```bash
npx tsx product-search-cli.ts "oliveyoung,musinsa,zigzag" "토리든" "세럼"
npx tsx product-search-cli.ts "oliveyoung,hwahae" "라운드랩" "선크림"
```

#### 모든 쇼핑몰

```bash
npx tsx product-search-cli.ts all "삐아" "레디 투 웨어 다우니 치크"
npx tsx product-search-cli.ts all "라운드랩" "레디 투 웨어 베이스업 선크림"
```

#### JSON 출력 (프로그래밍 활용)

```bash
OUTPUT_JSON=true npx tsx product-search-cli.ts hwahae "삐아" "레디 투 웨어 다우니 치크"
OUTPUT_JSON=true npx tsx product-search-cli.ts all "라운드랩" "레디 투 웨어 베이스업 선크림"

# jq와 함께 사용
OUTPUT_JSON=true npx tsx product-search-cli.ts oliveyoung "라운드랩" "선크림" | jq '.[0] | {mall, success, count}'
```

#### 사용 내역 확인

```bash
# 과거 CLI 사용 내역 확인
cat ~/.zsh_history | grep "product-search-cli.ts" | tail -20
```

#### 지원 쇼핑몰

- `oliveyoung` - 올리브영
- `zigzag` - 지그재그
- `musinsa` - 무신사
- `ably` - 에이블리
- `kurly` - 컬리
- `hwahae` - 화해

### API 엔드포인트

#### 헬스체크

```bash
GET /health
```

#### 사용 가능한 쇼핑몰 목록

```bash
GET /search-products/malls
```

#### 쇼핑몰별 상품 검색

```bash
POST /search-products/:mall
Content-Type: application/json

{
  "brand": "라운드랩",
  "productName": "선크림"
}
```

예시:

```bash
# 올리브영
POST /search-products/oliveyoung

# 지그재그
POST /search-products/zigzag

# 무신사
POST /search-products/musinsa

# 에이블리
POST /search-products/ably

# 컬리
POST /search-products/kurly
```

#### 하위 호환 엔드포인트 (deprecated)

기존 `/scrape/*` 엔드포인트는 계속 작동하지만, 새로운 `/search-products/*` 엔드포인트를 사용하는 것을 권장합니다.

```bash
POST /scrape/oliveyoung  # ⚠️ deprecated - /search-products/oliveyoung 사용 권장
POST /scrape/zigzag      # ⚠️ deprecated - /search-products/zigzag 사용 권장
POST /scrape/musinsa     # ⚠️ deprecated - /search-products/musinsa 사용 권장
POST /scrape/ably        # ⚠️ deprecated - /search-products/ably 사용 권장
POST /scrape/kurly       # ⚠️ deprecated - /search-products/kurly 사용 권장
```

## ✨ 새 쇼핑몰 추가 방법

### 1단계: YAML 파일 생성

`config/malls/newmall.yaml` 파일을 생성합니다:

```yaml
mall: newmall
name: "새 쇼핑몰"
baseUrl: "https://www.newmall.com"
searchUrl: "${baseUrl}/search?q=${encodedQuery}"

# 브라우저 설정
browser:
  headless: true
  args:
    - "--no-sandbox"
    - "--disable-setuid-sandbox"
  viewport:
    width: 1920
    height: 1080
  userAgent: "Mozilla/5.0 ..."

# 네비게이션 순서
navigation:
  steps:
    - action: goto
      url: "${searchUrl}"
      waitUntil: domcontentloaded
      timeout: 30000
    - action: wait
      duration: 3000

# 데이터 추출 규칙
extraction:
  type: evaluate
  containerSelector: ".product-item"
  fields:
    productId:
      selector: "a"
      type: attribute
      attribute: href
      regex: 'id=(\d+)'
      group: 1
      required: true
    productName:
      selector: ".product-name"
      type: text
      required: true
    # ... 나머지 필드
```

### 2단계: 서버 재시작

```bash
# 서버가 자동으로 새 설정을 인식합니다
npm start
```

### 3단계: 완료

```bash
POST /search-products/newmall
```

## 📝 YAML 설정 가이드

### 네비게이션 액션

- `goto`: 페이지 이동
- `wait`: 대기
- `waitForSelector`: 선택자 대기
- `waitForLoadState`: 로드 상태 대기
- `scroll`: 스크롤
- `click`: 클릭
- `fill`: 입력
- `press`: 키 입력

### 필드 추출 설정

- `selector`: CSS 선택자
- `type`: `text` | `attribute` | `html`
- `attribute`: 속성 이름 (type=attribute일 때)
- `regex`: 정규식 패턴
- `group`: 정규식 그룹 번호
- `transform`: `removeNonDigits` | `removeCommas` | `trim` | `lowercase` | `uppercase`
- `parse`: `int` | `float` | `boolean`
- `required`: 필수 여부
- `nullable`: null 허용 여부
- `fallback`: 기본값

### 템플릿 변수

- `${baseUrl}`: 기본 URL
- `${searchUrl}`: 검색 URL
- `${brand}`: 브랜드명
- `${productName}`: 상품명
- `${searchQuery}`: 검색 쿼리 (brand + productName)
- `${encodedQuery}`: URL 인코딩된 검색 쿼리

## 🔧 고급 사용법

### 커스텀 스크래퍼 (YAML로 표현하기 어려운 케이스)

```typescript
// scrapers/custom/CustomMallScraper.ts
import { BaseScraper } from "./base/BaseScraper";
import { Product } from "../core/domain/Product";

export class CustomMallScraper extends BaseScraper {
  constructor() {
    super("custommall");
  }

  protected async extract(request: ScraperRequest): Promise<any[]> {
    // 복잡한 커스텀 로직
    return [];
  }

  // ... 나머지 구현
}

// server.ts에서 등록
import { ScraperRegistry } from "./services/ScraperRegistry";
import { CustomMallScraper } from "./scrapers/custom/CustomMallScraper";

const registry = ScraperRegistry.getInstance();
registry.registerScraper("custommall", new CustomMallScraper());
```

## 📊 리팩토링 효과

### Before (기존)

- **1,079줄**의 server.ts
- 새 쇼핑몰 추가 시 **~150줄** 함수 추가
- 중복 코드 많음
- 수정 시 전체 파일 이해 필요

### After (리팩토링 후)

- **95줄**의 server.ts (94% 감소)
- 새 쇼핑몰 추가: **YAML 파일 1개** (~50줄)
- 중복 제거: 공통 로직 재사용
- 유지보수: 설정만 수정
- 확장성: 새 액션/추출 규칙 추가 용이

## 🔍 디버깅

### 로그 확인

서버는 자동으로 상세한 로그를 출력합니다:

- 네비게이션 단계
- 데이터 추출 결과
- 에러 메시지

### 헤드리스 모드 비활성화

YAML 설정에서:

```yaml
browser:
  headless: false # 브라우저 창을 볼 수 있음
```

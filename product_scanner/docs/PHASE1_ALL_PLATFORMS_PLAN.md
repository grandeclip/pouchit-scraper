# Phase 1 전체 플랫폼 Extractor 마이그레이션 계획

## 📋 개요

**목적**: 5개 플랫폼(hwahae, musinsa, ably, zigzag, kurly)의 YAML scripts → TypeScript Extractor 마이그레이션

**기간**: 2025-01-24 ~ 예상 2-3일

**브랜치**: `feature/phase1-all-platforms`

**완료 기준**: 모든 플랫폼이 ExtractorRegistry 패턴 사용, 테스트 통과

---

## 🎯 전체 일정

| 순서 | 플랫폼      | 방식       | 복잡도 | 예상 시간 | 우선순위            |
| ---- | ----------- | ---------- | ------ | --------- | ------------------- |
| 1    | **Hwahae**  | HTTP API   | ⚠️ 상  | 1-2시간   | P1 (API 검증)       |
| 2    | **Musinsa** | HTTP API   | 🟡 중  | 1-2시간   | P1 (Custom Scanner) |
| 3    | **Ably**    | Playwright | 🟡 중  | 1-2시간   | P2 (Multi-fallback) |
| 4    | **ZigZag**  | GraphQL    | ⚠️ 상  | 2-3시간   | P2 (GraphQL)        |
| 5    | **Kurly**   | Playwright | 🟡 중  | 1-2시간   | P3 (SSR 파싱)       |

**총 예상 시간**: 6-11시간

---

## 📦 플랫폼별 상세 체크리스트

### 1️⃣ Hwahae (화해) - HTTP API 기반

**복잡도**: ⚠️ 상 (WAF 우회, API 전용)

**현재 구조**:

- Factory: `HwahaeScannerFactory.ts`
- Domain: `HwahaeProduct.ts`
- 방식: HTTP API (Playwright 비활성화)
- 특이사항: AWS WAF 차단, Rate limiting

#### 작업 체크리스트

- [x] **1.1 기존 코드 분석** ✅ 2025-01-24
  - [x] `hwahae.yaml` 분석 (API endpoint, headers)
  - [x] `HwahaeScannerFactory.ts` 분석 (HttpScanner 사용)
  - [x] `HwahaeProduct.ts` 도메인 모델 확인
  - [x] 현재 API response 구조 파악 (HwahaeApiResponse)

- [x] **1.2 Extractor 인터페이스 구현** ✅ 2025-01-24
  - [x] `HwahaePriceExtractor.ts` (API response → PriceData)
  - [x] `HwahaeSaleStatusExtractor.ts` (SELNG/SLDOT/STSEL → SaleStatus enum)
  - [x] `HwahaeMetadataExtractor.ts` (name, title_images → MetadataData)

- [x] **1.3 통합 Extractor 생성** ✅ 2025-01-24
  - [x] `HwahaeExtractor.ts` (Facade Pattern - 3개 전문 Extractor 조합)
  - [x] HttpScanner에 Extractor 통합 (`parseData()` 수정)
  - [x] IProductExtractor<HwahaeApiResponse> 구현

- [x] **1.4 ExtractorRegistry 등록** ✅ 2025-01-24
  - [x] `ExtractorRegistry.ts`에 hwahae 등록 (`IProductExtractor<any>`)
  - [x] Singleton 패턴 유지

- [x] **1.5 YAML 설정 업데이트** ✅ 2025-01-24
  - [x] `hwahae.yaml` 불필요 fieldMapping 제거
  - [x] Extractor 매핑 정보 주석으로 문서화
  - [x] API 전략 우선순위 유지

- [x] **1.6 테스트 작성** ✅ 2025-01-24
  - [x] Unit 테스트 (HwahaePriceExtractor: 5 tests)
  - [x] Unit 테스트 (HwahaeSaleStatusExtractor: 4 tests)
  - [x] Unit 테스트 (HwahaeMetadataExtractor: 8 tests)
  - [x] Integration 테스트 (HwahaeExtractor: 4 tests)
  - [x] ExtractorRegistry 테스트 업데이트 (2 tests 추가)

- [x] **1.7 검증** ✅ 2025-01-24
  - [x] TypeScript 컴파일 (0 errors)
  - [x] 테스트 통과 (21 hwahae tests, 157 total)
  - [x] 실제 워크플로우 검증 (`LIMIT=4 test-hwahae-workflow.sh` - 4/4 성공)

---

### 2️⃣ Musinsa (무신사) - HTTP API 기반 (Custom Scanner)

**복잡도**: 🟡 중 (Custom Scanner, Mobile User-Agent)

**현재 구조**:

- Factory: `MusinsaScannerFactory.ts`
- Scanner: `MusinsaHttpScanner.ts` (Custom)
- Domain: `MusinsaProduct.ts`
- 방식: HTTP API (Mobile User-Agent)
- 특이사항: Custom Scanner 구현, JSON API

#### 작업 체크리스트

- [ ] **2.1 기존 코드 분석**
  - [ ] `musinsa.yaml` 분석 (API endpoint, headers)
  - [ ] `MusinsaHttpScanner.ts` 분석 (Custom 구현)
  - [ ] `MusinsaScannerFactory.ts` 분석
  - [ ] `MusinsaProduct.ts` 도메인 모델 확인

- [ ] **2.2 Extractor 인터페이스 구현**
  - [ ] `MusinsaPriceExtractor.ts` (JSON API → PriceData)
  - [ ] `MusinsaSaleStatusExtractor.ts` (errorCode 처리)
  - [ ] `MusinsaMetadataExtractor.ts` (brand, images)

- [ ] **2.3 통합 Extractor 생성**
  - [ ] `MusinsaExtractor.ts` (Facade Pattern)
  - [ ] Custom Scanner 통합 또는 재구현
  - [ ] IProductExtractor 인터페이스 구현

- [ ] **2.4 ExtractorRegistry 등록**
  - [ ] `ExtractorRegistry.ts`에 musinsa 등록

- [ ] **2.5 YAML 설정 업데이트**
  - [ ] `musinsa.yaml`에 `extractor: "musinsa"` 추가

- [ ] **2.6 테스트 작성**
  - [ ] Unit 테스트 (각 Extractor)
  - [ ] Integration 테스트
  - [ ] Mobile User-Agent 테스트

- [ ] **2.7 검증**
  - [ ] TypeScript 컴파일 (0 errors)
  - [ ] 테스트 통과
  - [ ] 실제 API 호출 검증

---

### 3️⃣ Ably (에이블리) - Playwright 기반 (Multi-level Fallback)

**복잡도**: 🟡 중 (3단계 fallback: SSR + Meta + DOM)

**현재 구조**:

- Factory: `AblyScannerFactory.ts`
- Domain: `AblyProduct.ts`
- 방식: Playwright (SSR + Meta + DOM)
- 특이사항: `__NEXT_DATA__` SSR 데이터, Network API 캡처

#### 작업 체크리스트

- [ ] **3.1 기존 코드 분석**
  - [ ] `ably.yaml` 분석 (extraction script)
  - [ ] `AblyScannerFactory.ts` 분석 (parseDOM)
  - [ ] `AblyProduct.ts` 도메인 모델 확인
  - [ ] Multi-level fallback 로직 파악

- [ ] **3.2 Extractor 인터페이스 구현**
  - [ ] `AblyPriceExtractor.ts` (Page → PriceData)
  - [ ] `AblySaleStatusExtractor.ts` (not_found 처리)
  - [ ] `AblyMetadataExtractor.ts` (SSR data 우선)

- [ ] **3.3 통합 Extractor 생성**
  - [ ] `AblyExtractor.ts` (Facade Pattern)
  - [ ] 3단계 fallback 구현 (**NEXT_DATA** → Meta → DOM)
  - [ ] IProductExtractor 인터페이스 구현

- [ ] **3.4 ExtractorRegistry 등록**
  - [ ] `ExtractorRegistry.ts`에 ably 등록

- [ ] **3.5 YAML 설정 업데이트**
  - [ ] `ably.yaml`에 `extractor: "ably"` 추가
  - [ ] selectors 정의 (fallback용)

- [ ] **3.6 테스트 작성**
  - [ ] Unit 테스트 (각 Extractor)
  - [ ] Integration 테스트 (fallback 검증)
  - [ ] Mock Page 객체 테스트

- [ ] **3.7 검증**
  - [ ] TypeScript 컴파일 (0 errors)
  - [ ] 테스트 통과
  - [ ] 실제 페이지 추출 검증

---

### 4️⃣ ZigZag (지그재그) - GraphQL 기반

**복잡도**: ⚠️ 상 (GraphQL Query, JSON Path 네비게이션)

**현재 구조**:

- Factory: `ZigzagScannerFactory.ts`
- Scanner: `ZigzagGraphQLScanner` (Custom)
- Domain: `ZigzagProduct.ts`
- 방식: GraphQL API (복잡한 Query)
- 특이사항: JSON Path, CloudFront 403 방지 (순차 처리)

#### 작업 체크리스트

- [ ] **4.1 기존 코드 분석**
  - [ ] `zigzag.yaml` 분석 (GraphQL query)
  - [ ] `ZigzagGraphQLScanner.ts` 분석
  - [ ] `ZigzagScannerFactory.ts` 분석
  - [ ] `ZigzagProduct.ts` 도메인 모델 확인
  - [ ] JSON Path 네비게이션 로직 파악

- [ ] **4.2 Extractor 인터페이스 구현**
  - [ ] `ZigzagPriceExtractor.ts` (GraphQL response → PriceData)
  - [ ] `ZigzagSaleStatusExtractor.ts` (soldout 필드)
  - [ ] `ZigzagMetadataExtractor.ts` (product_image_list 처리)

- [ ] **4.3 통합 Extractor 생성**
  - [ ] `ZigzagExtractor.ts` (Facade Pattern)
  - [ ] GraphQL Scanner 통합
  - [ ] IProductExtractor 인터페이스 구현

- [ ] **4.4 ExtractorRegistry 등록**
  - [ ] `ExtractorRegistry.ts`에 zigzag 등록

- [ ] **4.5 YAML 설정 업데이트**
  - [ ] `zigzag.yaml`에 `extractor: "zigzag"` 추가

- [ ] **4.6 테스트 작성**
  - [ ] Unit 테스트 (각 Extractor)
  - [ ] Integration 테스트 (GraphQL response 파싱)
  - [ ] JSON Path 테스트

- [ ] **4.7 검증**
  - [ ] TypeScript 컴파일 (0 errors)
  - [ ] 테스트 통과
  - [ ] 실제 GraphQL 호출 검증

---

### 5️⃣ Kurly (마켓컬리) - Playwright 기반 (SSR 파싱)

**복잡度**: 🟡 중 (**NEXT_DATA** 파싱, Status 특수 처리)

**현재 구조**:

- Factory: `KurlyScannerFactory.ts`
- Domain: `KurlyProduct.ts`
- 방식: Playwright (**NEXT_DATA** 파싱)
- 특이사항: `isSoldOut === null` → INFO_CHANGED

#### 작업 체크리스트

- [ ] **5.1 기존 코드 분석**
  - [ ] `kurly.yaml` 분석 (extraction script)
  - [ ] `KurlyScannerFactory.ts` 분석 (parseDOM)
  - [ ] `KurlyProduct.ts` 도메인 모델 확인
  - [ ] **NEXT_DATA** 파싱 로직 파악

- [ ] **5.2 Extractor 인터페이스 구현**
  - [ ] `KurlyPriceExtractor.ts` (Page → PriceData)
  - [ ] `KurlySaleStatusExtractor.ts` (isSoldOut 특수 처리)
  - [ ] `KurlyMetadataExtractor.ts` (**NEXT_DATA** 우선)

- [ ] **5.3 통합 Extractor 생성**
  - [ ] `KurlyExtractor.ts` (Facade Pattern)
  - [ ] **NEXT_DATA** 파싱 로직 구현
  - [ ] IProductExtractor 인터페이스 구현

- [ ] **5.4 ExtractorRegistry 등록**
  - [ ] `ExtractorRegistry.ts`에 kurly 등록

- [ ] **5.5 YAML 설정 업데이트**
  - [ ] `kurly.yaml`에 `extractor: "kurly"` 추가
  - [ ] Constants 정의 (MISSING_NAME_MESSAGE 등)

- [ ] **5.6 테스트 작성**
  - [ ] Unit 테스트 (각 Extractor)
  - [ ] Integration 테스트 (**NEXT_DATA** 파싱)
  - [ ] Status 특수 케이스 테스트

- [ ] **5.7 검증**
  - [ ] TypeScript 컴파일 (0 errors)
  - [ ] 테스트 통과
  - [ ] 실제 페이지 추출 검증

---

## 🔧 공통 작업 항목

### 각 플랫폼 공통

- [ ] **디렉토리 구조 생성**

  ```
  src/extractors/
    [platform]/
      [Platform]Extractor.ts          # Facade
      [Platform]PriceExtractor.ts
      [Platform]SaleStatusExtractor.ts
      [Platform]MetadataExtractor.ts
  ```

- [ ] **타입 정의**
  - [ ] `[Platform]Config` 인터페이스 (필요시)
  - [ ] `[Platform]Response` 타입 (API/DOM)

- [ ] **에러 처리**
  - [ ] API 에러 처리 (hwahae, musinsa, zigzag)
  - [ ] 404/not_found 처리 (ably, kurly)
  - [ ] Rate limiting 고려

- [ ] **로깅**
  - [ ] Pino logger 통합
  - [ ] 구조화된 로그 (context 포함)

---

## ✅ 검증 기준

### 플랫폼별 검증

각 플랫폼 완료 시 다음 항목 확인:

- [ ] **타입 안전성**
  - [ ] TypeScript 컴파일 0 errors
  - [ ] `any` 타입 0개
  - [ ] 모든 인터페이스 구현 완료

- [ ] **테스트**
  - [ ] Unit 테스트 작성 및 통과
  - [ ] Integration 테스트 통과
  - [ ] 전체 테스트 suite 통과

- [ ] **기능**
  - [ ] ExtractorRegistry에 등록됨
  - [ ] YAML extractor 설정 완료
  - [ ] 실제 데이터 추출 검증 (manual)

- [ ] **문서**
  - [ ] 체크리스트 완료 표시
  - [ ] 특이사항 문서화

### 전체 완료 검증

모든 플랫폼 완료 후:

- [ ] **통합 테스트**
  - [ ] 6개 플랫폼 모두 ExtractorRegistry 등록
  - [ ] 전체 테스트 suite 통과 (목표: 200+ tests)
  - [ ] TypeScript 0 errors

- [ ] **E2E 테스트** (선택적)
  - [ ] 각 플랫폼 실제 상품 추출
  - [ ] 에러 케이스 검증

- [ ] **문서 업데이트**
  - [ ] REFACTORING_PLAN.md Phase 1 완료 표시
  - [ ] PROGRESS_REFACTOR_ALL_PLATFORMS.md 작성

---

## 🚨 리스크 관리

### 예상 리스크

| 리스크                                 | 가능성 | 영향도 | 대응 방안                       |
| -------------------------------------- | ------ | ------ | ------------------------------- |
| **API 변경** (hwahae, musinsa, zigzag) | 중     | 상     | 기존 코드 참조, 에러 처리 강화  |
| **WAF 차단** (hwahae)                  | 중     | 상     | 기존 헤더 재사용, Rate limiting |
| **SSR 구조 변경** (ably, kurly)        | 중     | 중     | Fallback 로직 구현              |
| **GraphQL Schema 변경** (zigzag)       | 중     | 상     | Query validation, 에러 처리     |
| **테스트 부족**                        | 상     | 중     | Mock 데이터 준비, 단계별 검증   |

### 대응 전략

1. **API 변경**: 기존 ScannerFactory의 parseDOM 로직 참조
2. **차단 문제**: 기존 헤더/User-Agent 재사용
3. **데이터 구조**: Fallback 로직 필수 구현
4. **테스트**: 단위 테스트 우선, E2E는 선택적

---

## 📊 진행 상황 추적

### 전체 진행률

- [x] Hwahae (0/7 단계)
- [ ] Musinsa (0/7 단계)
- [ ] Ably (0/7 단계)
- [ ] ZigZag (0/7 단계)
- [ ] Kurly (0/7 단계)

**전체**: 0/35 단계 (0%)

---

## 📝 참고 문서

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - 전체 리팩터링 계획
- [PROGRESS_REFACTOR_OLIVEYOUNG.md](./PROGRESS_REFACTOR_OLIVEYOUNG.md) - Oliveyoung 완료 사례
- [Oliveyoung Extractor](../src/extractors/oliveyoung/) - 참조 구현

---

## 🎯 다음 단계

Phase 1 완료 후:

- Phase 2: 검색 방식 다양화 (URL 템플릿, DirectScanService)
- Phase 3: Scanner 책임 분리 (SRP 강화)
- Phase 4: Workflow Node 책임 분리

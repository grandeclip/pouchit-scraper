# Oliveyoung Extractor 리팩터링 진행 상황

## 📋 개요

**목적**: YAML scripts → TypeScript Extractor 분리 (타입 안전성, 테스트 가능성, 유지보수성)
**범위**: oliveyoung 플랫폼 (Phase 1 우선 완료)
**참고**: [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) Phase 1

---

## ✅ 완료된 작업

### 1. 베이스 인터페이스 정의 (Step 1.1)

**경로**: `src/extractors/base/`

- ✅ `IPriceExtractor.ts` - 가격 추출 인터페이스
- ✅ `ISaleStatusExtractor.ts` - 판매 상태 추출 인터페이스 (재고 + 상태 통합)
- ✅ `IMetadataExtractor.ts` - 메타데이터 추출 인터페이스
- ✅ `IProductExtractor.ts` - 통합 Product 추출 인터페이스
- ✅ `index.ts` - Barrel export

**특징**:

- SaleStatus enum 도입 (0=InStock, 1=OutOfStock, 2=SoldOut, 3=Discontinued)
- schema.org ItemAvailability 표준 준수
- TypeScript strict mode 완전 적용

### 2. 공통 유틸리티 생성 (Step 1.2)

**경로**: `src/extractors/common/`

- ✅ `DOMHelper.ts` - DOM 요소 존재 확인 유틸
- ✅ `PriceParser.ts` - 가격 문자열 파싱 유틸

**특징**:

- 안전한 null 처리
- Playwright Page 객체 기반 헬퍼

### 3. Oliveyoung Extractor 구현 (Step 1.3)

**경로**: `src/extractors/oliveyoung/`

- ✅ `OliveyoungExtractor.ts` - Facade 패턴 통합 Extractor
  - 전처리: 배너 제거, 이미지 로드 대기, 페이지 타입 감지
  - 병렬 추출: Promise.all로 성능 최적화
  - YAML 상수 검증: fail-fast (Z_INDEX_THRESHOLD, MAIN_IMAGE_WAIT_MS)

- ✅ `OliveyoungPriceExtractor.ts` - 가격 추출 전용
  - 7단계 fallback selector
  - 할인가/정가 분리
  - 할인율 자동 계산

- ✅ `OliveyoungSaleStatusExtractor.ts` - 판매 상태 추출 전용
  - 8단계 체크 로직 (상품 정보 → 404 → Mobile 버튼 → Desktop 버튼 → 재입고 → 품절 → 가격 → 기본값)
  - CSS Modules 대응 (모든 button 순회 + textContent 기반 매칭)
  - YAML 기반 button text patterns (in_stock, out_of_stock, sold_out, discontinued)

- ✅ `OliveyoungMetadataExtractor.ts` - 메타데이터 추출 전용
  - 상품명, 브랜드, 이미지 (메인/썸네일)
  - 7단계 fallback selector
  - Swiper DOM 구조 대응
  - YAML 기반 thumbnail exclusion patterns

### 4. YAML 구조 개선 (Step 1.4)

**파일**: `config/platforms/oliveyoung.yaml`

**변경 사항**:

- ✅ `selectors` 섹션: 7단계 fallback 배열 (Mobile 우선)
- ✅ `button_text_patterns` 섹션: 4가지 상태별 패턴 (in_stock, out_of_stock, sold_out, discontinued)
- ✅ `error_messages`, `error_url_patterns` 섹션: 404 페이지 감지
- ✅ `thumbnail_exclusions` 섹션: 제외할 썸네일 패턴
- ✅ `product_number_pattern` 섹션: 상품 번호 추출 regex
- ✅ `constants` 섹션: Z_INDEX_OVERLAY_THRESHOLD, MAIN_IMAGE_WAIT_MS

**아키텍처**:

- Selector만 YAML에 유지 (TypeScript 로직은 완전 분리)
- Template variables 제거 (TypeScript에서 직접 처리)
- 플랫폼별 설정 중앙화

### 5. ExtractorRegistry 생성 (Step 1.5)

**파일**: `src/extractors/ExtractorRegistry.ts`

- ✅ Singleton 패턴 구현
- ✅ Map<string, IProductExtractor> 기반 저장소
- ✅ Oliveyoung 자동 등록
- ✅ 에러 메시지에 available extractors 포함

### 6. 테스트 커버리지

**테스트 결과** (2025-01-24 기준):

- ✅ 135 tests passed (12 skipped)
- ✅ Base interface tests (3개 파일)
- ✅ Common utility tests (2개 파일)
- ✅ Oliveyoung extractor tests (4개 파일)
- ✅ ExtractorRegistry tests
- ✅ E2E integration tests
- ✅ TypeScript 0 errors

**테스트 파일**:

- `tests/extractors/base/*.test.ts` - 인터페이스 검증
- `tests/extractors/common/*.test.ts` - 유틸리티 검증
- `tests/extractors/oliveyoung/*.test.ts` - Oliveyoung 로직 검증
- `tests/extractors/ExtractorRegistry.test.ts` - Registry 검증
- `tests/e2e/oliveyoung-extractor.e2e.test.ts` - E2E 검증

---

## 🔄 최근 리팩터링 (2025-01-24)

### SaleStatus Enum 변환

- **Before**: `type SaleStatus = "InStock" | "OutOfStock" | "SoldOut" | "Discontinued"`
- **After**: `enum SaleStatus { InStock = 0, OutOfStock = 1, SoldOut = 2, Discontinued = 3 }`
- **이유**: 타입 안전성 강화, 오타 방지, 성능 최적화

### YAML 기반 Button Text Pattern 매칭

- **Before**: 하드코딩된 문자열 (`text.includes("일시품절")`)
- **After**: YAML 패턴 배열 + Array.some() (`BUTTON_TEXT_PATTERNS.out_of_stock.some(p => text.includes(p))`)
- **이유**: Zero hardcoding, 유지보수성 향상, 다국어 대응 용이

### Over-Engineering 제거

- ❌ 삭제: `statusText` 필드 (SaleStatusData 인터페이스)
- ❌ 삭제: `isSaleStatus()` type guard 함수 (사용처 없음)
- **이유**: YAGNI 원칙, 코드 단순화

### Fail-Fast 검증 강화

- **Before**: `config.constants?.Z_INDEX_THRESHOLD || 0`
- **After**: `if (!config.constants?.Z_INDEX_THRESHOLD) throw new Error(...)`
- **이유**: 잘못된 구성 조기 감지, 런타임 오류 방지

---

## 🚧 미완료 작업

### Step 1.4: YAML 구조 단순화

- ⚠️ `scripts` 항목 완전 제거 (일부 YAML에 여전히 존재)
- ⚠️ `extractor` ID 참조 시스템 (BrowserScanner 통합 필요)

### Step 1.6: Scanner 통합

- ❌ BrowserScanner에서 ExtractorRegistry 사용
- ❌ YAML에서 extractor ID 읽기
- ❌ script 실행 로직 제거

---

## 📌 다음 작업 (우선순위)

### Option 1: Phase 1 완료 (Scanner 통합)

- [ ] BrowserScanner에서 ExtractorRegistry 사용하도록 변경
- [ ] YAML scripts 항목 완전 제거
- [ ] PlaywrightScriptExecutor 제거 또는 단순화

### Option 2: Phase 1 확장 (다른 플랫폼)

- [ ] Hwahae Extractor 구현 (API 기반, 가장 간단)
- [ ] Musinsa Extractor 구현
- [ ] 공통 유틸리티 확장 (DateHelper, TextNormalizer)

### Option 3: Phase 2 시작 (검색 방식 다양화)

- [ ] URL 템플릿 시스템 (YAML)
- [ ] DirectScanService 구현 (단일 상품 ID 크롤링)

**권장**: Option 1 (Scanner 통합 완료) → Option 2 (플랫폼 확장) 순서

---

## 📊 아키텍처 현황

### 현재 구조

```
src/
  extractors/
    base/                           # ✅ 완료
      IPriceExtractor.ts
      ISaleStatusExtractor.ts
      IMetadataExtractor.ts
      IProductExtractor.ts
      index.ts

    common/                         # ✅ 완료
      DOMHelper.ts
      PriceParser.ts

    oliveyoung/                     # ✅ 완료
      OliveyoungExtractor.ts
      OliveyoungPriceExtractor.ts
      OliveyoungSaleStatusExtractor.ts
      OliveyoungMetadataExtractor.ts

    ExtractorRegistry.ts            # ✅ 완료

    # Legacy (제거 예정 또는 용도 변경)
    JsonLdSchemaExtractor.ts
    NextDataSchemaExtractor.ts

  scrapers/
    base/
      BrowserScanner.ts             # ⚠️ ExtractorRegistry 통합 필요

  config/
    platforms/
      oliveyoung.yaml               # ✅ 개선됨
```

### 설계 패턴 적용 현황

- ✅ **Strategy Pattern**: ISaleStatusExtractor, IPriceExtractor 등
- ✅ **Template Method Pattern**: OliveyoungExtractor (extract 메서드)
- ✅ **Factory Pattern**: ExtractorRegistry
- ✅ **Registry Pattern**: ExtractorRegistry
- ✅ **Singleton Pattern**: ExtractorRegistry, ConfigLoader
- ✅ **Facade Pattern**: OliveyoungExtractor (통합 인터페이스)
- ⚠️ **Command Pattern**: 아직 미적용 (BrowserScanner 통합 시 적용 예정)

---

## 🎯 리팩터링 성과

### 타입 안전성

- ✅ `any` 타입 0개 (strict mode)
- ✅ SaleStatus enum으로 오타 방지
- ✅ 모든 인터페이스 명시적 정의

### 테스트 가능성

- ✅ 135개 테스트 통과 (기존 62개에서 증가)
- ✅ 각 Extractor 독립 테스트 가능
- ✅ Mock Page 객체로 격리 테스트

### 유지보수성

- ✅ YAML 기반 구성 (Zero hardcoding)
- ✅ 단일 책임 원칙 (각 Extractor 분리)
- ✅ 7단계 fallback selector (DOM 변경 대응)

### 성능

- ✅ Promise.all 병렬 추출
- ✅ Playwright Page 재사용
- ✅ 불필요한 코드 제거 (-68 lines from over-engineering removal)

---

## 📝 참고 문서

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - 전체 리팩터링 계획
- [oliveyoung.yaml](../src/config/platforms/oliveyoung.yaml) - YAML 구성
- [OliveyoungExtractor.ts](../src/extractors/oliveyoung/OliveyoungExtractor.ts) - 통합 Extractor
- [ExtractorRegistry.ts](../src/extractors/ExtractorRegistry.ts) - Registry 구현

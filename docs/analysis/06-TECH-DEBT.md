# 기술 부채

## 요약

| 카테고리  | 심각도 | 항목 수 |
| --------- | ------ | ------- |
| 코드 품질 | 중간   | 5       |
| 아키텍처  | 낮음   | 4       |
| 테스트    | 높음   | 3       |
| 문서화    | 낮음   | 2       |

---

## 코드 품질 이슈

### 1. 대용량 파일

| 파일                                 | 줄수 | 권장  |
| ------------------------------------ | ---- | ----- |
| `WorkflowExecutionService.ts`        | 867  | < 300 |
| `DailyPlanningProductSyncService.ts` | 705  | < 300 |
| `RedisWorkflowRepository.ts`         | 379  | < 200 |

**개선**: 책임 분리, 헬퍼 클래스 추출

### 2. 중복 코드

**위치**: 플랫폼별 Extractor, Scanner Factory

```typescript
// 반복 패턴
if (platform === "hwahae") { ... }
else if (platform === "oliveyoung") { ... }
// 6개 플랫폼 반복
```

**개선**: Registry 패턴 강화, 동적 로딩

### 3. 하드코딩된 값

```typescript
// 예시
const SCANNER_TTL_MS = 60 * 60 * 1000;  // 매직 넘버
const PLATFORMS = ["hwahae", "oliveyoung", ...];  // 하드코딩
```

**개선**: 설정 파일로 이동, 상수 모듈화

### 4. 에러 처리 불일치

```typescript
// 일부는 throw
throw new Error("상품을 찾을 수 없습니다");

// 일부는 null 반환
return null;

// 일부는 기본값
return { status: "unknown" };
```

**개선**: 에러 처리 표준화, Result 패턴 도입

### 5. 타입 안전성

```typescript
// any 사용
config: Record<string, unknown>;

// 타입 단언
const product = rawData as HwahaeProduct;
```

**개선**: 제네릭 강화, 타입 가드 추가

---

## 아키텍처 이슈

### 1. Factory 확장성

**현재**:

```typescript
// ScannerFactory.ts
switch (platform) {
  case "hwahae":
    return new HwahaeScannerFactory();
  case "oliveyoung":
    return new OliveyoungScannerFactory();
  // ... 플랫폼 추가 시 수정 필요
}
```

**개선**: 플러그인 아키텍처 또는 동적 import

### 2. 설정과 코드 혼재

**현재**: 일부 로직이 YAML에, 일부는 코드에

**개선**: 설정 경계 명확화

### 3. Repository 인터페이스 부재

**현재**: 일부 Repository는 인터페이스 없이 구현

**개선**: 모든 Repository에 인터페이스 정의

### 4. 레거시 모듈

**위치**: `src/scrapers/` (사용되지 않음)

**개선**: 제거 또는 마이그레이션

---

## 테스트 부채

### 1. 테스트 커버리지 부족

| 모듈        | 현재 | 목표 |
| ----------- | ---- | ---- |
| services/   | ~20% | 80%  |
| scanners/   | ~30% | 70%  |
| strategies/ | ~10% | 80%  |

### 2. 통합 테스트 부재

- API 엔드포인트 테스트 없음
- 워크플로우 E2E 테스트 없음

### 3. 모킹 전략 부재

- 외부 의존성 (Supabase, Redis) 모킹 없음
- Playwright 모킹 어려움

---

## 문서화 부채

### 1. API 문서

**현재**: README에 간단한 설명만

**개선**: OpenAPI/Swagger 스펙 작성

### 2. 워크플로우 문서

**현재**: JSON 파일만 존재

**개선**: 각 워크플로우 목적/사용법 문서화

---

## 개선 로드맵

### Phase 1: 긴급 (안정성)

| 항목             | 우선순위 | 예상 효과   |
| ---------------- | -------- | ----------- |
| 에러 처리 표준화 | P0       | 디버깅 용이 |
| 대용량 파일 분리 | P1       | 유지보수성  |
| 테스트 추가      | P1       | 안정성      |

### Phase 2: 중요 (유지보수성)

| 항목                  | 우선순위 | 예상 효과   |
| --------------------- | -------- | ----------- |
| 중복 코드 제거        | P2       | 코드량 감소 |
| Factory 리팩터링      | P2       | 확장성      |
| Repository 인터페이스 | P2       | 테스트 용이 |

### Phase 3: 향상 (확장성)

| 항목              | 우선순위 | 예상 효과        |
| ----------------- | -------- | ---------------- |
| 플러그인 아키텍처 | P3       | 동적 플랫폼 추가 |
| API 문서화        | P3       | 개발자 경험      |
| 레거시 제거       | P3       | 코드베이스 정리  |

---

## 리팩터링 체크리스트

### 파일 분리

- [ ] `WorkflowExecutionService.ts` → 노드 실행, Job 관리 분리
- [ ] `DailyPlanningProductSyncService.ts` → 단계별 분리
- [ ] `RedisWorkflowRepository.ts` → Queue, Lock 분리

### 패턴 개선

- [ ] Factory → Registry + 동적 로딩
- [ ] Singleton → 의존성 주입
- [ ] 에러 처리 → Result 패턴

### 테스트 추가

- [ ] Unit: services/, scanners/
- [ ] Integration: API endpoints
- [ ] E2E: 워크플로우 전체 흐름

---

## 관련 문서

- [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) - 시스템 아키텍처
- [04-MODULES.md](./04-MODULES.md) - 모듈 상세
- [05-DEPENDENCIES.md](./05-DEPENDENCIES.md) - 의존성 분석

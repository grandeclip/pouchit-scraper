# Phase 4: Workflow Node 책임 분리 계획

## 개요

BaseValidationNode(1,002줄)의 단일 책임 원칙(SRP) 위반 해결을 위한 완전 분리 리팩토링

### 현재 문제

- BaseValidationNode에 8개 이상 책임 혼재
- 스캔, 검증, 비교, 저장, 알림 로직 모두 포함
- 1,000줄 이상의 God Class 패턴

### 리팩토링 방향

- **범위**: 전체 분리 (6개 노드)
- **BaseValidationNode**: 완전 대체 (deprecated → 삭제)
- **병렬 처리**: WorkflowEngine 레벨에서 처리

### 브랜치

`feature/phase4-workflow-node-refactoring`

---

## 목표 구조

### 6개 단일 책임 노드

| 노드                | 책임                         | 입력               | 출력               |
| ------------------- | ---------------------------- | ------------------ | ------------------ |
| FetchProductNode    | Supabase에서 검증 대상 조회  | workflow context   | ProductItem[]      |
| ScanProductNode     | 브라우저 스캔 실행           | ProductItem[]      | ScanResult[]       |
| ValidateProductNode | 스캔 결과 유효성 검증        | ScanResult[]       | ValidatedResult[]  |
| CompareProductNode  | 기존 데이터와 비교           | ValidatedResult[]  | ComparisonResult[] |
| SaveResultNode      | 결과 저장 (Supabase + JSONL) | ComparisonResult[] | SavedResult        |
| NotifyResultNode    | 알림 발송 (Slack 등)         | SavedResult        | void               |

### 노드 파이프라인

```text
FetchProduct → ScanProduct → ValidateProduct → CompareProduct → SaveResult → NotifyResult
```

### 디렉토리 구조

```text
src/workflow/
  nodes/
    base/
      IWorkflowNode.ts           # 노드 인터페이스 (기존 유지)
      BaseWorkflowNode.ts        # 공통 기능 (간소화)
      NodeContext.ts             # 신규: 노드 컨텍스트
    validation/                  # 새로운 분리된 노드들
      FetchProductNode.ts        # 데이터 조회
      ScanProductNode.ts         # 브라우저 스캔
      ValidateProductNode.ts     # 결과 검증
      CompareProductNode.ts      # 데이터 비교
      SaveResultNode.ts          # 결과 저장
      NotifyResultNode.ts        # 알림 발송
      index.ts                   # barrel export
    platform/                    # 플랫폼별 설정 (노드 아님)
      PlatformValidationConfig.ts
      index.ts
  engine/
    WorkflowEngine.ts            # 병렬 처리 로직 추가
    ParallelExecutor.ts          # 신규: 병렬 실행기
```

---

## 구현 단계

### Step 4.1: 노드 인터페이스 정의

**신규/수정 파일**:

- `src/workflow/nodes/base/IWorkflowNode.ts` (수정)
- `src/workflow/nodes/base/NodeContext.ts` (신규)

**인터페이스 확장**:

```typescript
interface IWorkflowNode<TInput, TOutput> {
  name: string;
  execute(input: TInput, context: NodeContext): Promise<TOutput>;
  validate?(input: TInput): ValidationResult;
  rollback?(context: NodeContext): Promise<void>;
}

interface NodeContext {
  workflowId: string;
  jobId: string;
  platform: string;
  logger: Logger;
  config: PlatformConfig;
  sharedState: Map<string, unknown>;
}
```

### Step 4.2: FetchProductNode 구현

**책임**: Supabase에서 검증 대상 상품 조회

**이전할 로직** (BaseValidationNode →):

- `getProductsForValidation()` - 130줄
- `buildSupabaseQuery()` - 45줄
- 상품 필터링 및 배치 처리

**주요 기능**:

- ProductSet 기반 상품 목록 조회
- 배치 크기 설정 (기본 100)
- 필터링 조건 적용

### Step 4.3: ScanProductNode 구현

**책임**: Phase 3 BrowserController 활용한 스캔

**이전할 로직** (BaseValidationNode →):

- `scanProduct()` - 180줄
- `handleScanResult()` - 60줄
- Phase 3 BrowserController 연동

**주요 기능**:

- BrowserController 인스턴스 관리
- 병렬 스캔 (concurrency 설정)
- 스캔 결과 수집

### Step 4.4: ValidateProductNode 구현

**책임**: 스캔 결과 유효성 검증

**이전할 로직** (BaseValidationNode →):

- `validateScanResult()` - 90줄
- `checkPriceValidity()` - 40줄
- Phase 3 ProductValidator 활용

**주요 기능**:

- ProductValidator 연동
- 가격 유효성 검사
- 판매 상태 확인

### Step 4.5: CompareProductNode 구현

**책임**: 기존 데이터와 변경사항 비교

**이전할 로직** (BaseValidationNode →):

- `compareWithExisting()` - 120줄
- `detectChanges()` - 80줄
- `generateDiff()` - 50줄

**주요 기능**:

- 기존 Supabase 데이터 조회
- 필드별 변경 감지
- Diff 생성

### Step 4.6: SaveResultNode 구현

**책임**: 결과 저장 (Supabase + JSONL)

**이전할 로직** (BaseValidationNode →):

- `saveToSupabase()` - 100줄
- `writeToJSONL()` - 60줄
- `updateProductSet()` - 40줄

**주요 기능**:

- Supabase upsert
- JSONL 스트리밍 저장
- ProductSet 상태 업데이트

### Step 4.7: NotifyResultNode 구현

**책임**: 알림 발송

**이전할 로직** (BaseValidationNode →):

- `sendSlackNotification()` - 70줄
- `formatNotificationMessage()` - 40줄

**주요 기능**:

- Slack Webhook 연동
- 결과 요약 메시지 생성
- 오류 알림

### Step 4.8: WorkflowEngine 병렬 처리

**신규 파일**:

- `src/workflow/engine/ParallelExecutor.ts`

**WorkflowEngine 수정**:

- DAG 기반 병렬 노드 실행
- 동일 레벨 노드 동시 실행
- 결과 병합 및 다음 노드 전달

**ParallelExecutor 기능**:

```typescript
class ParallelExecutor {
  async executeParallel<T>(
    nodes: IWorkflowNode[],
    input: T,
    context: NodeContext,
  ): Promise<T[]>;

  async executePipeline<T>(
    nodes: IWorkflowNode[],
    input: T,
    context: NodeContext,
  ): Promise<T>;
}
```

### Step 4.9: 플랫폼 ValidationNode 마이그레이션

**수정 대상** (8개):

- HwahaeValidationNode.ts
- OliveyoungValidationNode.ts
- MusinsaValidationNode.ts
- AblyValidationNode.ts
- KurlyValidationNode.ts
- ZigzagValidationNode.ts
- DefaultValidationNode.ts
- CoupangValidationNode.ts

**변경 사항**:

- BaseValidationNode 상속 제거
- PlatformValidationConfig로 플랫폼별 설정만 유지
- Workflow JSON에서 새 노드 조합으로 대체

---

## 파일 변경 목록

### 신규 생성 (10개)

| 파일                                                      | 설명                     |
| --------------------------------------------------------- | ------------------------ |
| `src/workflow/nodes/base/NodeContext.ts`                  | 노드 컨텍스트 인터페이스 |
| `src/workflow/nodes/validation/FetchProductNode.ts`       | 데이터 조회 노드         |
| `src/workflow/nodes/validation/ScanProductNode.ts`        | 스캔 노드                |
| `src/workflow/nodes/validation/ValidateProductNode.ts`    | 검증 노드                |
| `src/workflow/nodes/validation/CompareProductNode.ts`     | 비교 노드                |
| `src/workflow/nodes/validation/SaveResultNode.ts`         | 저장 노드                |
| `src/workflow/nodes/validation/NotifyResultNode.ts`       | 알림 노드                |
| `src/workflow/nodes/validation/index.ts`                  | barrel export            |
| `src/workflow/nodes/platform/PlatformValidationConfig.ts` | 플랫폼 설정              |
| `src/workflow/engine/ParallelExecutor.ts`                 | 병렬 실행기              |

### 수정 (10개)

| 파일                                                  | 변경                                   |
| ----------------------------------------------------- | -------------------------------------- |
| `src/workflow/nodes/base/IWorkflowNode.ts`            | 제네릭 인터페이스 확장                 |
| `src/workflow/engine/WorkflowEngine.ts`               | 병렬 처리 로직 추가                    |
| `src/workflow/nodes/validation/BaseValidationNode.ts` | Deprecated 마킹 후 단계적 제거         |
| 8개 플랫폼 ValidationNode                             | PlatformValidationConfig 사용으로 변경 |

### 삭제 예정 (Phase 4 완료 후)

| 파일                                                  | 사유        |
| ----------------------------------------------------- | ----------- |
| `src/workflow/nodes/validation/BaseValidationNode.ts` | 완전 대체됨 |

---

## Workflow JSON 구조 변경

### Before (현재)

```json
{
  "nodes": {
    "validate": {
      "type": "validation",
      "name": "HwahaeValidation",
      "config": { "platform": "hwahae" },
      "next_nodes": ["result_writer"]
    }
  }
}
```

### After (Phase 4)

```json
{
  "nodes": {
    "fetch": {
      "type": "fetch_product",
      "config": { "platform": "hwahae", "batch_size": 100 },
      "next_nodes": ["scan"]
    },
    "scan": {
      "type": "scan_product",
      "config": { "concurrency": 5 },
      "next_nodes": ["validate"]
    },
    "validate": {
      "type": "validate_product",
      "next_nodes": ["compare"]
    },
    "compare": {
      "type": "compare_product",
      "next_nodes": ["save"]
    },
    "save": {
      "type": "save_result",
      "config": { "jsonl": true, "supabase": true },
      "next_nodes": ["notify"]
    },
    "notify": {
      "type": "notify_result",
      "config": { "slack": true },
      "next_nodes": []
    }
  }
}
```

---

## 구현 순서

### 1단계: 기반 구조 (Step 4.1)

- [ ] NodeContext 인터페이스 정의
- [ ] IWorkflowNode 제네릭 확장
- [ ] 테스트 구조 설정

### 2단계: 핵심 노드 (Step 4.2-4.7)

- [ ] FetchProductNode 구현 및 테스트
- [ ] ScanProductNode 구현 (Phase 3 연동)
- [ ] ValidateProductNode 구현 (Phase 3 연동)
- [ ] CompareProductNode 구현
- [ ] SaveResultNode 구현
- [ ] NotifyResultNode 구현

### 3단계: 엔진 개선 (Step 4.8)

- [ ] ParallelExecutor 구현
- [ ] WorkflowEngine 병렬 처리 통합
- [ ] DAG 실행 테스트

### 4단계: 마이그레이션 (Step 4.9)

- [ ] PlatformValidationConfig 생성
- [ ] 기존 ValidationNode 마이그레이션
- [ ] Workflow JSON 업데이트
- [ ] E2E 테스트 검증

### 5단계: 정리

- [ ] BaseValidationNode deprecated
- [ ] 레거시 코드 제거
- [ ] 문서 업데이트

---

## 예상 결과

| 항목               | Before    | After            |
| ------------------ | --------- | ---------------- |
| BaseValidationNode | 1,002줄   | 0줄 (삭제)       |
| 노드당 평균 줄 수  | 1,002줄   | ~150줄           |
| 책임 수            | 8+        | 1 (SRP)          |
| 테스트 용이성      | 어려움    | 단위 테스트 가능 |
| 병렬 처리          | 노드 내부 | WorkflowEngine   |
| 재사용성           | 낮음      | 높음 (조합 가능) |

---

## Phase 3 연동

### 활용할 Phase 3 성과물

| 컴포넌트          | 파일 위치                                       | 연동 노드           |
| ----------------- | ----------------------------------------------- | ------------------- |
| BrowserController | `src/scrapers/controllers/BrowserController.ts` | ScanProductNode     |
| ProductValidator  | `src/scrapers/validators/ProductValidator.ts`   | ValidateProductNode |
| ProductMappers    | `src/scrapers/mappers/*Mapper.ts`               | ScanProductNode     |

### 연동 방식

```typescript
// ScanProductNode에서 BrowserController 사용
import { BrowserController } from "@/scrapers/controllers";

class ScanProductNode implements IWorkflowNode<ProductItem[], ScanResult[]> {
  private browserController: BrowserController;

  async execute(
    products: ProductItem[],
    context: NodeContext,
  ): Promise<ScanResult[]> {
    // Phase 3 BrowserController 활용
    return await this.browserController.scanProducts(products, context.config);
  }
}
```

---

## 참조 문서

- `docs/REFACTORING_PLAN.md` - 전체 리팩토링 로드맵
- `docs/PHASE3_SCANNER_REFACTORING_PLAN.md` - Phase 3 구현 상세
- `docs/WORKFLOW_DAG.md` - DAG 워크플로우 설계

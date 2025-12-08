# Workflow DAG 구조 가이드

## 📋 개요

Product Scanner의 Workflow 시스템이 **DAG (Directed Acyclic Graph)** 구조를 지원하도록 개선되었습니다.

### 주요 변경 사항

- ✅ **`next_node`** (단일) → **`next_nodes`** (배열)
- ✅ **선형 체인** → **DAG 구조** (분기, 병합 지원)
- ✅ **순차 실행** → **큐 기반 실행** (병렬 실행 준비)
- ✅ **진행률 계산** 개선 (실행된 노드 수 기반)

---

## 🎯 확장성 평가

### ✅ 가능한 것들

1. **자유로운 워크플로우 구성**
   - JSON 파일만 작성하면 새로운 워크플로우 추가 가능
   - 미리 정의된 노드 타입(Strategy)을 조합하여 구성
   - 노드별 재시도, 타임아웃 설정 가능

2. **DAG 구조 지원**
   - 하나의 노드에서 여러 노드로 분기 가능
   - 여러 노드가 하나의 노드로 합류 가능
   - 순환 참조 탐지 및 경고

3. **동적 플로우 제어**
   - 노드 실행 결과에 따라 `next_nodes` 런타임 오버라이드 가능
   - 조건부 분기 구현 가능

### ⚠️ 현재 제약사항

1. **순차 실행**
   - 현재는 큐 기반 순차 실행 (FIFO)
   - 병렬 실행은 향후 개선 예정

2. **노드 간 데이터 전달**
   - 모든 노드가 동일한 `accumulatedData` 공유
   - 노드별 격리된 데이터는 미지원

---

## 📝 Workflow JSON 구조

### 기본 구조

```json
{
  "workflow_id": "my-workflow",
  "name": "My Workflow",
  "version": "1.0.0",
  "description": "워크플로우 설명",
  "start_node": "node_1",
  "nodes": {
    "node_1": {
      "type": "node_type",
      "name": "Node Name",
      "config": {},
      "next_nodes": ["node_2", "node_3"],
      "retry": {
        "max_attempts": 3,
        "backoff_ms": 1000
      },
      "timeout_ms": 30000
    }
  },
  "defaults": {},
  "metadata": {}
}
```

### 노드 정의

| 필드         | 타입       | 필수 | 설명                                 |
| ------------ | ---------- | ---- | ------------------------------------ |
| `type`       | `string`   | ✅   | 노드 타입 (Strategy 식별자)          |
| `name`       | `string`   | ✅   | 노드 이름 (로깅용)                   |
| `config`     | `object`   | ✅   | 노드별 설정                          |
| `next_nodes` | `string[]` | ✅   | 다음 노드 ID 목록 (빈 배열이면 종료) |
| `retry`      | `object`   | ❌   | 재시도 설정                          |
| `timeout_ms` | `number`   | ❌   | 타임아웃 (밀리초)                    |

---

## 🎨 DAG 패턴 예제

### 1️⃣ 선형 체인 (Linear Chain)

```
A → B → C → D
```

```json
{
  "start_node": "A",
  "nodes": {
    "A": {
      "type": "...",
      "next_nodes": ["B"]
    },
    "B": {
      "type": "...",
      "next_nodes": ["C"]
    },
    "C": {
      "type": "...",
      "next_nodes": ["D"]
    },
    "D": {
      "type": "...",
      "next_nodes": []
    }
  }
}
```

### 2️⃣ 분기 (Fork)

```
     ┌─→ B
A ───┤
     └─→ C
```

```json
{
  "start_node": "A",
  "nodes": {
    "A": {
      "type": "...",
      "next_nodes": ["B", "C"]
    },
    "B": {
      "type": "...",
      "next_nodes": []
    },
    "C": {
      "type": "...",
      "next_nodes": []
    }
  }
}
```

### 3️⃣ 합류 (Join)

```
A ───┐
     ├─→ C
B ───┘
```

```json
{
  "start_node": "A",
  "nodes": {
    "A": {
      "type": "...",
      "next_nodes": ["C"]
    },
    "B": {
      "type": "...",
      "next_nodes": ["C"]
    },
    "C": {
      "type": "...",
      "next_nodes": []
    }
  }
}
```

⚠️ **주의**: 현재는 순차 실행이므로 `A → C` 실행 후 `B`는 실행되지 않습니다.
완전한 병렬 실행은 향후 개선 예정입니다.

### 4️⃣ 다이아몬드 (Diamond)

```
     ┌─→ B ─┐
A ───┤       ├─→ D
     └─→ C ─┘
```

```json
{
  "start_node": "A",
  "nodes": {
    "A": {
      "type": "...",
      "next_nodes": ["B", "C"]
    },
    "B": {
      "type": "...",
      "next_nodes": ["D"]
    },
    "C": {
      "type": "...",
      "next_nodes": ["D"]
    },
    "D": {
      "type": "...",
      "next_nodes": []
    }
  }
}
```

### 5️⃣ 복잡한 DAG

```
     ┌─→ B ─┐
A ───┤       ├─→ D ─→ F
     └─→ C ─┤
            └─→ E
```

```json
{
  "start_node": "A",
  "nodes": {
    "A": {
      "type": "...",
      "next_nodes": ["B", "C"]
    },
    "B": {
      "type": "...",
      "next_nodes": ["D"]
    },
    "C": {
      "type": "...",
      "next_nodes": ["D", "E"]
    },
    "D": {
      "type": "...",
      "next_nodes": ["F"]
    },
    "E": {
      "type": "...",
      "next_nodes": []
    },
    "F": {
      "type": "...",
      "next_nodes": []
    }
  }
}
```

---

## 🔄 동적 플로우 제어

노드 실행 시 `NodeResult.next_nodes`를 설정하면 런타임에 다음 노드를 결정할 수 있습니다.

### 예제: 조건부 분기

```typescript
// Strategy 구현 예제
async execute(context: NodeContext): Promise<NodeResult> {
  const result = await this.processData(context);

  // 결과에 따라 다음 노드 결정
  const nextNodes = result.success
    ? ["success_node"]
    : ["error_handler_node"];

  return {
    success: true,
    data: result,
    next_nodes: nextNodes, // 런타임 오버라이드
  };
}
```

---

## 🛡️ 검증 기능

WorkflowLoaderService가 다음을 자동 검증합니다:

1. **JSON Schema 검증**
   - 필수 필드 존재 여부
   - 타입 일치 여부

2. **구조 검증**
   - ✅ 시작 노드 존재 확인
   - ✅ `next_nodes` 참조 유효성 (존재하지 않는 노드 참조 방지)
   - ✅ 도달 불가능한 노드 탐지
   - ✅ 순환 참조 탐지 및 경고

### 검증 예제

```bash
# 워크플로우 로드 시 자동 검증
[WorkflowLoader] Loading workflow: my-workflow
[WorkflowLoader] Validating schema...
[WorkflowLoader] Validating structure...
[WorkflowLoader] Warning: Cycle detected in workflow 'my-workflow'
[WorkflowLoader] Workflow loaded successfully: my-workflow
```

---

## 🚀 실행 흐름

### DAG 실행 알고리즘

```typescript
1. nodesToExecute = [start_node]
2. executedNodes = Set()

3. WHILE nodesToExecute.length > 0:
   a. currentNode = nodesToExecute.shift()
   b. IF executedNodes.has(currentNode): SKIP
   c. EXECUTE currentNode
   d. executedNodes.add(currentNode)
   e. nextNodes = result.next_nodes || node.next_nodes
   f. FOR EACH nextNode IN nextNodes:
      - IF NOT executedNodes.has(nextNode):
        - nodesToExecute.push(nextNode)
   g. UPDATE progress = executedNodes.size / totalNodes
```

### 실행 로그 예제

```json
{
  "node_id": "A",
  "node_type": "supabase_search",
  "message": "Executing node"
}
{
  "node_id": "A",
  "next_nodes": ["B", "C"],
  "executed_count": 1,
  "total_nodes": 4,
  "progress": 0.25,
  "message": "Node completed"
}
```

---

## 📊 진행률 계산

```typescript
progress = executedNodes.size / totalNodes;
```

- `executedNodes.size`: 실행 완료된 노드 수
- `totalNodes`: 전체 노드 수
- `progress`: 0.0 ~ 1.0

---

## 🔧 노드 타입 추가하기

새로운 노드 타입을 추가하려면:

1. **Strategy 구현**

   ```typescript
   export class MyCustomNode implements INodeStrategy {
     readonly type = "my_custom_node";

     validateConfig(config: Record<string, unknown>): void {
       // 검증 로직
     }

     async execute(context: NodeContext): Promise<NodeResult> {
       // 실행 로직
       return {
         success: true,
         data: {},
         next_nodes: ["next_node_id"], // 선택적
       };
     }
   }
   ```

2. **Factory 등록**

   ```typescript
   // NodeStrategyFactory.ts
   constructor() {
     this.registerStrategy(new MyCustomNode());
   }
   ```

3. **Workflow JSON에서 사용**

   ```json
   {
     "nodes": {
       "my_node": {
         "type": "my_custom_node",
         "config": {},
         "next_nodes": ["next_node"]
       }
     }
   }
   ```

---

## ❓ FAQ

### Q1: 순환 참조가 가능한가요?

A: 기술적으로 가능하지만 권장하지 않습니다. 워크플로우 로더가 순환 참조를 탐지하면 경고를 출력합니다.

### Q2: 병렬 실행이 가능한가요?

A: 현재는 큐 기반 순차 실행입니다. 병렬 실행은 향후 개선 예정입니다.

### Q3: 노드 간 데이터 전달은 어떻게 하나요?

A: 모든 노드가 `accumulatedData`를 공유합니다. 이전 노드의 출력이 다음 노드의 입력으로 누적됩니다.

### Q4: 조건부 분기가 가능한가요?

A: 네! `NodeResult.next_nodes`를 런타임에 설정하면 됩니다.

---

## 📚 참고 자료

- [Workflow.ts](../src/core/domain/Workflow.ts) - 도메인 모델
- [INodeStrategy.ts](../src/core/interfaces/INodeStrategy.ts) - 노드 인터페이스
- [WorkflowExecutionService.ts](../src/services/WorkflowExecutionService.ts) - 실행 엔진
- [WorkflowLoaderService.ts](../src/services/WorkflowLoaderService.ts) - 로더 및 검증
- [bulk-validation-v1.json](../workflows/bulk-validation-v1.json) - 선형 체인 예제
- [dag-example-v1.json](../workflows/dag-example-v1.json) - DAG 구조 예제

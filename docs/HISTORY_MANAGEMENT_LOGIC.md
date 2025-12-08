# 히스토리 관리 로직 문서

다른 서비스 개발자에게 전달할 수 있도록 텍스트로 정리했습니다.

---

## 개요

제품 리뷰 시스템에서 사용하는 두 가지 히스토리 테이블의 로직입니다. 하나는 모든 처리 이력을 추적하고, 다른 하나는 일별 가격 변동을 추적합니다.

---

## 1. history_product_review 테이블

**목적**: 제품 리뷰 처리의 모든 이력을 감사(audit) 목적으로 추적

**동작 방식**: 항상 INSERT (새 레코드 생성)

### 주요 필드

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `review_id` | UUID | 자동 생성되는 고유 식별자 |
| `product_set_id` | UUID | 제품 세트 ID |
| `link_url` | TEXT | 제품 링크 |
| `status` | VARCHAR(20) | 처리 상태 ('verified', 'only_price', 'all', 'confused') |
| `comment` | TEXT | 변경 사항 설명 |
| `before_products` | JSONB | 처리 전 제품 정보 (DB에서 가져온 데이터) |
| `after_products` | JSONB | 처리 후 제품 정보 (AI/크롤링으로 분석한 데이터) |
| `created_at` | TIMESTAMP | 생성 시간 (UTC) |

### JSONB 구조 예시

```json
{
  "product_name": "제품명",
  "original_price": 10000,
  "discounted_price": 8000,
  "thumbnail": "https://..."
}
```

### 처리 로직

1. 제품 처리가 완료될 때마다 무조건 새 레코드를 INSERT
2. 업데이트는 하지 않음 (완전한 이력 보존)
3. 실패하더라도 예외를 발생시키지 않고 None/null 반환
4. 메인 프로세스는 히스토리 기록 실패와 무관하게 계속 진행

### 인덱스

- `product_set_id` (제품별 조회용)
- `created_at DESC` (최신 이력 조회용)
- `status` (상태별 조회용)
- `(product_set_id, created_at DESC)` 복합 인덱스

### 핵심 포인트

- ✅ 모든 처리마다 기록되므로 완전한 감사 추적 가능
- ✅ before/after를 JSONB로 저장하여 변경 전후 비교 가능
- ✅ 히스토리 기록 실패가 메인 비즈니스 로직을 방해하지 않음

---

## 2. product_price_histories 테이블

**목적**: 제품의 일별 가격 변동 추적 (같은 날짜는 최신 가격으로 덮어쓰기)

**동작 방식**: UPSERT (같은 날짜 있으면 UPDATE, 없으면 INSERT)

### 주요 필드

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | UUID | 자동 생성되는 고유 식별자 |
| `product_set_id` | UUID | 제품 세트 ID |
| `original_price` | INTEGER | 원가 |
| `discount_price` | INTEGER | 할인가 |
| `recorded_at` | TIMESTAMP | 실제 기록 시간 (UTC, 타임스탬프) |
| `base_dt` | DATE | 기준 날짜 (KST, YYYY-MM-DD 형식) |

**유니크 제약**: `(product_set_id, base_dt)` - 같은 제품의 같은 날짜는 하나만 존재

### 처리 로직

1. **KST 기준으로 오늘 날짜(`base_dt`)를 계산**
2. **해당 `product_set_id`와 `base_dt` 조합으로 기존 레코드 조회**
3. **기존 레코드가 있으면**:
   - UPDATE: `original_price`, `discount_price`, `recorded_at` 업데이트
   - 같은 날짜에 여러 번 실행되면 최신 가격으로 계속 갱신
4. **기존 레코드가 없으면**:
   - INSERT: 새로운 날짜의 가격 이력 생성
5. **실패하더라도 예외를 발생시키지 않고 False 반환**
6. **메인 프로세스는 가격 이력 기록 실패와 무관하게 계속 진행**

### 시간 처리

- **base_dt**: KST(한국 시간) 기준 날짜 (UTC + 9시간)
- **recorded_at**: UTC 기준 타임스탬프 (정확한 기록 시간)

### 인덱스

- `product_set_id` (제품별 조회용)
- `base_dt DESC` (날짜별 조회용)
- `(product_set_id, base_dt DESC)` 복합 인덱스

### 핵심 포인트

- ✅ 하루에 하나의 가격만 유지 (최신 가격으로 덮어쓰기)
- ✅ 날짜는 KST 기준이지만 실제 기록 시간은 UTC로 정확히 추적
- ✅ 가격 이력 기록 실패가 메인 비즈니스 로직을 방해하지 않음 (안전장치)
- ✅ `discounted_price`가 없으면 `original_price`와 동일하게 처리

---

## 시간 처리 유틸리티

### get_utc_timestamp()

- UTC 타임존을 포함한 타임스탬프 반환
- 형식: `"2025-11-17 10:30:51.497+00"`
- milliseconds 단위까지 포함 (microseconds를 1000으로 나눔)

**구현 예시 (Python)**:

```python
from datetime import datetime, timezone

def get_utc_timestamp() -> str:
    """UTC 타임존을 포함한 타임스탬프를 Supabase 형식으로 반환"""
    now = datetime.now(timezone.utc)
    milliseconds = int(now.microsecond / 1000)
    return f"{now.strftime('%Y-%m-%d %H:%M:%S')}.{milliseconds:03d}+00"
```

**구현 예시 (TypeScript)**:

```typescript
function getUTCTimestamp(): string {
  const now = new Date();
  const milliseconds = now.getMilliseconds();
  return `${now.toISOString().slice(0, 19)}.${milliseconds.toString().padStart(3, '0')}+00`;
}
```

### get_kst_date()

- KST 기준 날짜 반환
- 형식: `"2025-11-17"` (YYYY-MM-DD)
- UTC 시간에 9시간을 더해서 계산

**구현 예시 (Python)**:

```python
from datetime import datetime, timezone

def get_kst_date() -> str:
    """KST 기준 날짜를 YYYY-MM-DD 형식으로 반환"""
    now = datetime.now(timezone.utc)
    kst_time = datetime.fromtimestamp(now.timestamp() + (9 * 60 * 60))
    return kst_time.strftime("%Y-%m-%d")
```

**구현 예시 (TypeScript)**:

```typescript
function getKSTDate(): string {
  const now = new Date();
  const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kstTime.toISOString().split('T')[0]; // YYYY-MM-DD
}
```

---

## 두 테이블의 차이점 요약

| 특성 | history_product_review | product_price_histories |
|------|------------------------|-------------------------|
| **목적** | 모든 처리 이력을 완전히 보존 | 일별 가격 스냅샷 유지 |
| **동작** | 항상 INSERT만 수행 | UPSERT 패턴 (날짜 기준) |
| **데이터 구조** | JSONB로 유연한 데이터 저장 | 정규화된 컬럼 구조 |
| **용도** | 감사(audit) 목적 | 가격 변동 추적 및 차트 표시 |
| **중복 방지** | 없음 (모든 이력 보존) | UNIQUE(product_set_id, base_dt) |
| **실패 처리** | 예외 발생 안함 | 예외 발생 안함 (안전장치) |

### 공통점

- ✅ 둘 다 실패해도 예외를 발생시키지 않음 (안전장치)
- ✅ 메인 비즈니스 로직과 독립적으로 동작
- ✅ 실패 시 로그만 남기고 계속 진행

---

## 구현 시 주의사항

### 1. 트랜잭션 분리

히스토리 기록은 메인 트랜잭션과 분리하여 실패해도 롤백되지 않도록 구현

### 2. 에러 핸들링

try-catch로 감싸고 예외를 외부로 전파하지 않음

```python
try:
    # 히스토리 기록 로직
    pass
except Exception as e:
    logger.error(f"히스토리 기록 실패: {e}")
    return None  # 또는 False
```

### 3. 로깅

성공/실패 여부를 명확히 로깅하여 추후 디버깅 가능하도록 함

```python
logger.info("✅ 히스토리 생성 완료")
logger.error("❌ 히스토리 생성 실패")
logger.warning("⚠️ 가격 이력 기록 실패 (안전장치 작동)")
```

### 4. 타임존

- `base_dt`는 KST
- `recorded_at`/`created_at`은 UTC로 일관성 유지

### 5. NULL 처리

`discounted_price`가 없을 때 `original_price`로 대체하는 등 NULL 처리 로직 필요

```python
discount_price = discounted_price if discounted_price is not None else original_price
```

---

## 호출 시점

### history_product_review

- ✅ 상품 데이터 업데이트를 위한 준비가 완료된 직후
- ✅ 상태(verified/only_price/all/confused)가 결정된 시점
- ✅ 모든 제품에 대해 무조건 호출

### product_price_histories

- ✅ 가격이 실제로 변경된 경우에만 호출
- ✅ `product_sets` 테이블 업데이트 성공 후 호출
- ✅ status가 'only_price' 또는 'all'인 경우

---

## 전체 처리 흐름

```
1. 상품 데이터 업데이트를 위한 준비가 완료된 직후
   ↓
2. 상태 결정 (verified/only_price/all/confused)
   ↓
3. history_product_review 테이블에 INSERT ✅
   ├─ 성공: 로그 기록
   └─ 실패: 로그 기록 후 계속 진행
   ↓
4. 가격 변경이 있는 경우 (only_price 또는 all)
   ├─ product_sets 테이블 UPDATE
   └─ product_price_histories 테이블 UPSERT ✅
       ├─ 같은 날짜 있음: UPDATE
       ├─ 같은 날짜 없음: INSERT
       ├─ 성공: 로그 기록
       └─ 실패: 로그 기록 후 계속 진행
   ↓
5. 메인 프로세스 계속 진행
```

---

## FAQ

### Q1: 히스토리 기록이 실패하면 어떻게 되나요?

A: 히스토리 기록 실패는 메인 비즈니스 로직에 영향을 주지 않습니다. 로그만 남기고 프로세스는 계속 진행됩니다.

### Q2: 같은 날짜에 여러 번 가격이 변경되면?

A: `product_price_histories` 테이블은 같은 날짜(`base_dt`)에는 하나의 레코드만 유지하며, 최신 가격으로 계속 업데이트됩니다.

### Q3: 왜 base_dt는 KST이고 recorded_at은 UTC인가요?

A: `base_dt`는 "어느 날의 가격"을 나타내는 비즈니스 기준이므로 한국 시간(KST)을 사용하고, `recorded_at`은 정확한 기록 시간을 추적하기 위해 표준 시간(UTC)을 사용합니다.

### Q4: history_product_review는 왜 UPDATE를 하지 않나요?

A: 감사(audit) 목적으로 모든 처리 이력을 완전히 보존하기 위해서입니다. 과거의 어떤 시점에 어떤 판단을 했는지 추적할 수 있어야 합니다.

### Q5: 두 테이블 모두 필수인가요?

A: 목적이 다릅니다. `history_product_review`는 감사 추적용, `product_price_histories`는 가격 변동 차트 표시용입니다. 필요에 따라 선택적으로 구현할 수 있습니다.

---

## 결론

이 문서를 참고하여 다른 서비스에서도 동일한 히스토리 관리 로직을 구현할 수 있습니다. 핵심은 **안전장치(fail-safe)** 패턴으로, 히스토리 기록 실패가 메인 비즈니스 로직을 방해하지 않도록 하는 것입니다.

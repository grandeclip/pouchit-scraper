# 쿠폰 유형 분류

## 적용 범위별

### 전체 적용 (all)

모든 상품에 적용 가능한 쿠폰.

```yaml
types:
  - first_purchase: 첫구매 쿠폰 (신규회원 한정)
  - membership: 멤버십 쿠폰 (유료/무료 멤버십)
  - event: 정기세일 쿠폰 (올영세일, 화해위크 등)
  - cart: 장바구니 쿠폰 (주문 금액 기준)
```

### 상품 특정 (product)

특정 상품/브랜드/카테고리에만 적용.

```yaml
types:
  - store: 스토어/브랜드 쿠폰
  - category: 카테고리 쿠폰 (뷰티, 패션 등)
  - product: 개별 상품 쿠폰
```

### 조건부 (conditional)

특정 조건 충족 시 적용.

```yaml
types:
  - payment: 결제수단 쿠폰 (카드사 제휴)
  - min_purchase: 최소금액 쿠폰 (N원 이상 구매시)
  - time_limited: 타임세일 쿠폰
```

## 할인 유형별

```yaml
discount_types:
  percent: # 정률 할인
    example: "20% 할인"
    max_discount: 최대 할인 금액 제한 가능

  fixed: # 정액 할인
    example: "5,000원 할인"
    min_purchase: 최소 구매 금액 조건 가능
```

## 비로그인 노출 여부

```yaml
visibility:
  visible_without_login: # 비로그인 상태에서 노출
    - 첫구매 쿠폰 배너
    - 이벤트/세일 쿠폰
    - 상품 페이지 쿠폰 정보

  requires_login: # 로그인 필요
    - 마이쿠폰함
    - 다운로드 쿠폰
    - 멤버십 전용 쿠폰
```

## TypeScript 타입 정의

```typescript
type CouponType =
  | "first_purchase"
  | "store"
  | "product"
  | "category"
  | "membership"
  | "event"
  | "payment";

type DiscountType = "percent" | "fixed";

interface CouponInfo {
  platform: string;
  type: CouponType;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscount?: number;
  minPurchase?: number;
  requiresLogin: boolean;
  visibleWithoutLogin: boolean;
}
```

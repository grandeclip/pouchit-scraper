# ZigZag 판매중단 상태 판별 방법

**날짜**: 2025-11-07
**문제**: GraphQL API는 `ON_SALE` 반환하지만 UI는 "판매 중단" 버튼 표시
**해결**: `__NEXT_DATA__` SSR 데이터에 실제 판매 상태 존재

---

## 🎯 핵심 발견

### 데이터 소스: `__NEXT_DATA__`

```javascript
// 페이지 내 <script id="__NEXT_DATA__"> 파싱
const data = JSON.parse(document.getElementById("__NEXT_DATA__").textContent);
const product = data.props.pageProps.product;
```

### 판별 필드

| 필드             | 타입    | 설명                  | 예시 값            |
| ---------------- | ------- | --------------------- | ------------------ |
| `is_purchasable` | boolean | 구매 버튼 활성화 여부 | `false` (판매중단) |
| `sales_status`   | string  | 실제 판매 상태        | `"SUSPENDED"`      |
| `display_status` | string  | 노출 상태             | `"HIDDEN"`         |

---

## 📊 비교 분석

### 판매중단 상품 (110848364)

```json
{
  "product_id": "110848364",
  "product_name": "✌세트할인💗 잉크 무드 글로이 틴트 2EA",
  "is_purchasable": false,
  "sales_status": "SUSPENDED",
  "display_status": "HIDDEN",
  "coupon_available_status": "COUPON_AVAILABLE"
}
```

**UI 표시**: 비활성화된 "판매 중단" 버튼

### 정상 상품 (157001205)

```json
{
  "product_id": "157001205",
  "product_name": "닥터 마스카라 픽서 블랙",
  "is_purchasable": true,
  "sales_status": "ON_SALE",
  "display_status": "VISIBLE",
  "coupon_available_status": "COUPON_AVAILABLE"
}
```

**UI 표시**: 활성화된 "구매하기" 버튼

---

## 🔍 GraphQL API vs `__NEXT_DATA__`

### GraphQL API (`matched_item_list`)

**용도**: 개별 옵션 항목 단위 재고 상태

```json
{
  "matched_item_list": [
    {
      "sales_status": "ON_SALE", // 각 옵션의 재고 상태
      "display_status": "VISIBLE",
      "remain_stock": null
    }
  ]
}
```

**특징**:

- 옵션별(색상, 사이즈) 재고 관리
- 판매중단 상품도 옵션은 `ON_SALE` 가능
- **전체 상품 상태와 무관**

### `__NEXT_DATA__` (product)

**용도**: 전체 상품 단위 최종 판매 상태 (⭐ 우선순위)

```json
{
  "is_purchasable": false,
  "sales_status": "SUSPENDED",
  "display_status": "HIDDEN"
}
```

**특징**:

- 상품 전체의 판매 가능 여부
- UI 버튼 활성화 직접 제어
- **최종 판별 기준**

---

## 📋 판매 상태 값

### `sales_status` 가능한 값

| 값          | 한글     | 설명           | `is_purchasable` |
| ----------- | -------- | -------------- | ---------------- |
| `ON_SALE`   | 판매중   | 정상 판매      | `true`           |
| `SOLD_OUT`  | 품절     | 일시적 품절    | `false`          |
| `SUSPENDED` | 판매중단 | 영구 판매 중단 | `false`          |

### `display_status` 가능한 값

| 값        | 한글 | 설명                           |
| --------- | ---- | ------------------------------ |
| `VISIBLE` | 노출 | 상품 페이지 정상 노출          |
| `HIDDEN`  | 숨김 | 상품 페이지 숨김 (판매중단 시) |

---

## 🔧 구현 가이드

### Playwright 추출 코드

```typescript
import { Page } from "playwright";

async function extractProductStatus(page: Page) {
  return await page.evaluate(() => {
    const script = document.getElementById("__NEXT_DATA__");
    if (!script) return null;

    const data = JSON.parse(script.textContent);
    const product = data.props?.pageProps?.product;

    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      isPurchasable: product.is_purchasable,
      salesStatus: product.sales_status,
      displayStatus: product.display_status,
      // 추가 필드
      originalPrice: product.product_price?.max_price_info?.price,
      discountedPrice:
        product.product_price?.final_discount_info?.discount_price,
      thumbnailUrl: product.product_image_list?.find(
        (img) => img.image_type === "MAIN",
      )?.pdp_thumbnail_url,
      shopName: product.shop_name || null,
    };
  });
}
```

### 판매 상태 판별 로직

```typescript
function determinePurchaseStatus(product: any): {
  status: "ON_SALE" | "SOLD_OUT" | "SUSPENDED";
  purchasable: boolean;
  reason: string;
} {
  // 최종 판별은 __NEXT_DATA__의 sales_status 사용
  const status = product.salesStatus;
  const purchasable = product.isPurchasable;

  let reason = "";

  if (status === "SUSPENDED") {
    reason = "판매 중단된 상품";
  } else if (status === "SOLD_OUT") {
    reason = "품절된 상품";
  } else if (status === "ON_SALE" && !purchasable) {
    reason = "구매 불가 (기타 사유)";
  } else {
    reason = "정상 판매중";
  }

  return { status, purchasable, reason };
}
```

---

## ⚠️ 주의사항

### 1. GraphQL API 한계

GraphQL API의 `matched_item_list[].sales_status`는 **옵션별 재고 상태**만 반영하며, **전체 상품의 판매중단 상태는 반영하지 않음**.

**예시**:

- 상품이 판매중단되었어도 옵션은 `ON_SALE` 반환
- 옵션이 모두 품절이어도 상품 자체는 `ON_SALE` 가능

### 2. 우선순위

판매 상태 판별 시 **반드시 `__NEXT_DATA__` 우선 사용**:

```
1순위: __NEXT_DATA__.product.sales_status
2순위: __NEXT_DATA__.product.is_purchasable
3순위: GraphQL API (옵션별 참고용)
```

### 3. 브랜드 정보

`__NEXT_DATA__`의 `product` 객체에는 `shop_name`이 **없을 수 있음**.

브랜드 정보는 별도 경로에 존재:

```javascript
data.props.pageProps.shop.name; // 브랜드명
data.props.pageProps.shop.id; // 브랜드 ID
```

---

## 🎯 최종 권장 전략

### Playwright + `__NEXT_DATA__` 추출

```typescript
async function scrapeZigzagProduct(url: string) {
  const page = await browser.newPage();
  await page.goto(url);

  // __NEXT_DATA__ 추출
  const productData = await page.evaluate(() => {
    const script = document.getElementById("__NEXT_DATA__");
    const data = JSON.parse(script.textContent);
    const product = data.props.pageProps.product;
    const shop = data.props.pageProps.shop;

    return {
      // 기본 정보
      id: product.id,
      name: product.name,
      brand: shop?.name || null,

      // 가격 정보
      originalPrice: product.product_price.max_price_info.price,
      discountedPrice: product.product_price.final_discount_info.discount_price,

      // ⭐ 판매 상태 (핵심)
      isPurchasable: product.is_purchasable,
      salesStatus: product.sales_status,
      displayStatus: product.display_status,

      // 이미지
      thumbnailUrl: product.product_image_list.find(
        (img) => img.image_type === "MAIN",
      )?.pdp_thumbnail_url,
    };
  });

  await page.close();
  return productData;
}
```

---

## 🔄 업데이트 이력

- **2025-11-07**: 판매중단 상태 판별 방법 확정
  - ✅ `__NEXT_DATA__` 데이터 소스 발견
  - ✅ `is_purchasable`, `sales_status`, `display_status` 필드 확인
  - ✅ GraphQL API vs `__NEXT_DATA__` 역할 구분
  - ✅ Playwright 추출 코드 작성
  - 🎯 **최종 전략**: Playwright + `__NEXT_DATA__` 추출

# ZigZag Product API - GetCatalogProductDetailPageOption

**날짜**: 2025-11-06
**Endpoint**: `POST https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption`
**상태**: ✅ **제품 정보 API 발견** (권장 사용)

---

## 🎯 핵심 정보

**목적**: 제품 상세 정보 (이름, 가격, 재고, 이미지 등) 조회

**장점**:

- ✅ 모든 제품 기본 정보 포함
- ✅ 가격, 할인 정보 완전
- ✅ 재고 상태 확인 가능
- ✅ 옵션, 배송 정보 포함

---

## 🔑 Request Headers

### 필수 헤더

```http
POST /api/2/graphql/GetCatalogProductDetailPageOption HTTP/1.1
Host: api.zigzag.kr
Content-Type: application/json
Accept: */*
Origin: https://zigzag.kr
Referer: https://zigzag.kr/
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1
```

**참고**: `GetPdpIntegratedData`와 동일한 헤더 사용

---

## 📦 Request Payload

### GraphQL Query (축약)

```json
{
  "query": "fragment OptionItemList on PdpCatalogItem { id name price final_price sales_status ... } query GetCatalogProductDetailPageOption($catalog_product_id: ID!, $input: PdpBaseInfoInput) { pdp_option_info(catalog_product_id: $catalog_product_id, input: $input) { catalog_product { shop_id shop_name id name product_price { max_price_info { price } final_discount_info { discount_price } product_promotion_discount_info { discount_amount } } product_image_list { url image_type } matched_item_list { sales_status display_status remain_stock } shipping_fee { fee_type base_fee minimum_free_shipping_fee } ... } } }",
  "variables": {
    "catalog_product_id": "157001205",
    "input": {
      "catalog_product_id": "157001205",
      "entry_source_type": ""
    }
  }
}
```

### Variables 설명

| Variable                   | Type        | Required | Description                |
| -------------------------- | ----------- | -------- | -------------------------- |
| `catalog_product_id`       | String (ID) | ✅ 필수  | 상품 고유 ID               |
| `input.catalog_product_id` | String      | ✅ 필수  | 상품 ID (중복)             |
| `input.entry_source_type`  | String      | ❌ 선택  | 진입 경로 (빈 문자열 가능) |

---

## 📊 Response Structure

### 핵심 데이터 경로

```json
{
  "data": {
    "pdp_option_info": {
      "catalog_product": {
        "id": "157001205",
        "name": "닥터 마스카라 픽서 블랙",
        "shop_id": 12897,
        "shop_name": "에뛰드",
        "product_price": {
          "max_price_info": { "price": 8000 },
          "final_discount_info": { "discount_price": 6400 },
          "product_promotion_discount_info": { "discount_amount": 1600 }
        },
        "matched_item_list": [
          {
            "sales_status": "ON_SALE",
            "display_status": "VISIBLE",
            "remain_stock": null,
            "expected_delivery_date": "11. 07(금) 이내 발송예정"
          }
        ],
        "shipping_fee": {
          "fee_type": "CONDITIONAL_FREE",
          "base_fee": 2500,
          "minimum_free_shipping_fee": 15000
        },
        "product_image_list": [
          {
            "url": "https://cf.product-image.s.zigzag.kr/...",
            "image_type": "MAIN"
          }
        ]
      }
    }
  }
}
```

---

## 🗂️ 데이터 필드 매핑

### 제품 기본 정보

| 목표 필드 | JSON 경로                                        | 예시 값                   |
| --------- | ------------------------------------------------ | ------------------------- |
| 제품 ID   | `data.pdp_option_info.catalog_product.id`        | "157001205"               |
| 제품명    | `data.pdp_option_info.catalog_product.name`      | "닥터 마스카라 픽서 블랙" |
| 브랜드 ID | `data.pdp_option_info.catalog_product.shop_id`   | 12897                     |
| 브랜드명  | `data.pdp_option_info.catalog_product.shop_name` | "에뛰드"                  |

### 가격 정보

| 목표 필드 | JSON 경로                                                       | 예시 값 | 계산식                  |
| --------- | --------------------------------------------------------------- | ------- | ----------------------- |
| 정가      | `product_price.max_price_info.price`                            | 8000    | -                       |
| 할인가    | `product_price.final_discount_info.discount_price`              | 6400    | -                       |
| 할인액    | `product_price.product_promotion_discount_info.discount_amount` | 1600    | -                       |
| 할인율    | -                                                               | 20%     | `(할인액 / 정가) * 100` |

### 재고 상태

| 목표 필드 | JSON 경로                             | 예시 값   | 매핑             |
| --------- | ------------------------------------- | --------- | ---------------- |
| 판매 상태 | `matched_item_list[0].sales_status`   | "ON_SALE" | ON_SALE → 판매중 |
| 노출 상태 | `matched_item_list[0].display_status` | "VISIBLE" | VISIBLE → 정상   |
| 재고 수량 | `matched_item_list[0].remain_stock`   | null      | null → 제한 없음 |

**판매 상태 값**:

- `ON_SALE`: 판매중
- `SOLD_OUT`: 품절
- `SUSPENDED`: 판매중단

### 배송 정보

| 필드           | JSON 경로                                     | 예시 값                    |
| -------------- | --------------------------------------------- | -------------------------- |
| 배송비 유형    | `shipping_fee.fee_type`                       | "CONDITIONAL_FREE"         |
| 기본 배송비    | `shipping_fee.base_fee`                       | 2500                       |
| 무료 배송 기준 | `shipping_fee.minimum_free_shipping_fee`      | 15000                      |
| 예상 배송일    | `matched_item_list[0].expected_delivery_date` | "11. 07(금) 이내 발송예정" |

### 이미지

| 필드        | JSON 경로                                | 설명                 |
| ----------- | ---------------------------------------- | -------------------- |
| 메인 이미지 | `product_image_list[0].url`              | `image_type: "MAIN"` |
| 서브 이미지 | `product_image_list[].url`               | `image_type: "SUB"`  |
| 썸네일      | `product_image_list[].pdp_thumbnail_url` | 720x720 최적화       |

---

## 🔧 구현 예시 (TypeScript)

### API 호출

```typescript
async function fetchProductInfo(productId: string) {
  const query = `
    query GetCatalogProductDetailPageOption($catalog_product_id: ID!, $input: PdpBaseInfoInput) {
      pdp_option_info(catalog_product_id: $catalog_product_id, input: $input) {
        catalog_product {
          id name shop_name
          product_price {
            max_price_info { price }
            final_discount_info { discount_price }
            product_promotion_discount_info { discount_amount }
          }
          matched_item_list {
            sales_status display_status remain_stock
          }
          shipping_fee {
            base_fee minimum_free_shipping_fee
          }
          product_image_list {
            url image_type
          }
        }
      }
    }
  `;

  const response = await fetch(
    "https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://zigzag.kr",
        Referer: "https://zigzag.kr/",
      },
      body: JSON.stringify({
        query,
        variables: {
          catalog_product_id: productId,
          input: {
            catalog_product_id: productId,
            entry_source_type: "",
          },
        },
      }),
    },
  );

  return response.json();
}
```

### 데이터 매핑

```typescript
interface ZigzagProduct {
  id: string;
  name: string;
  brand: string;
  originalPrice: number;
  discountedPrice: number;
  discountRate: number;
  saleStatus: "ON_SALE" | "SOLD_OUT" | "SUSPENDED";
  mainImageUrl: string;
  shippingFee: number;
}

function mapToProduct(apiResponse: any): ZigzagProduct {
  const data = apiResponse.data.pdp_option_info.catalog_product;
  const price = data.product_price;

  const originalPrice = price.max_price_info.price;
  const discountedPrice = price.final_discount_info.discount_price;
  const discountRate = Math.round(
    ((originalPrice - discountedPrice) / originalPrice) * 100,
  );

  return {
    id: data.id,
    name: data.name,
    brand: data.shop_name,
    originalPrice,
    discountedPrice,
    discountRate,
    saleStatus: data.matched_item_list[0].sales_status,
    mainImageUrl:
      data.product_image_list.find((img) => img.image_type === "MAIN")?.url ||
      "",
    shippingFee: data.shipping_fee.base_fee,
  };
}
```

---

## ⚠️ 주의사항

### 1. 중복 Variables

`catalog_product_id`가 두 곳에 필요:

- `variables.catalog_product_id`
- `variables.input.catalog_product_id`

### 2. 재고 정보 제한

`remain_stock`이 `null`인 경우:

- 재고 수량 미공개
- 품절 여부는 `sales_status`로 판단

### 3. 옵션 상품 처리

`matched_item_list` 배열:

- 옵션이 없는 단품: 1개
- 옵션이 있는 경우: 여러 개 (색상, 사이즈 등)

### 4. 이미지 최적화

- `url`: 원본 이미지
- `pdp_thumbnail_url`: 720x720 최적화 (권장)
- `pdp_static_image_url`: 정적 이미지

---

## 🔄 업데이트 내역

- **2025-11-06**: 제품 정보 API 발견 및 문서화
  - ✅ Request/Response 구조 분석
  - ✅ 데이터 필드 매핑 완료
  - ✅ TypeScript 구현 예시 작성
  - 🎯 **권장 전략**: API 직접 호출 (Playwright 불필요)

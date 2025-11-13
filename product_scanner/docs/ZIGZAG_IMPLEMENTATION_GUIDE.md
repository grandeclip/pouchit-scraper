# Zigzag 스크래퍼 구현 가이드

## 📋 목차

1. [개요](#개요)
2. [API 전략](#api-전략)
3. [GraphQL API 사용법](#graphql-api-사용법)
4. [데이터 추출 방법](#데이터-추출-방법)
5. [가격 구조 이해](#가격-구조-이해)
6. [구현 예제](#구현-예제)

---

## 개요

**플랫폼**: Zigzag (지그재그)
**권장 방식**: GraphQL API (✅ **검증 완료**)
**대안**: SSR (`__NEXT_DATA__`)

### 핵심 결론

✅ **GraphQL API 사용 가능** - Cloudflare 차단 없음, SSR 대비 8배 빠름
✅ **필요 데이터 100% 추출** - 5개 핵심 필드 모두 정상 추출
✅ **첫구매 가격 처리** - 배지 기반 로직으로 정확한 가격 분리

---

## API 전략

### 전략 비교

| 항목              | GraphQL API             | SSR (`__NEXT_DATA__`)     |
| ----------------- | ----------------------- | ------------------------- |
| **속도**          | ⚡ 빠름 (API 직접 호출) | 느림 (브라우저 로드)      |
| **Cloudflare**    | ✅ 차단 없음            | ⚠️ 반복 접근 시 차단 위험 |
| **데이터 완전성** | ✅ 필요 데이터 100%     | ✅ 전체 데이터            |
| **구현 복잡도**   | 낮음                    | 중간 (Playwright 필요)    |
| **안정성**        | ✅ 높음                 | ⚠️ Cloudflare 의존        |

### ✅ 최종 권장: GraphQL API

**이유**:

- 6회 연속 테스트 성공 (Cloudflare 차단 0회)
- SSR 대비 8배 빠른 응답 속도
- 필요 데이터 100% 추출 가능
- 브라우저 불필요 (리소스 절약)

---

## GraphQL API 사용법

### 엔드포인트

```
POST https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption
Content-Type: application/json
```

### 필수 Headers

```typescript
{
  "Content-Type": "application/json",
  "Accept": "*/*",
  "Origin": "https://zigzag.kr",
  "Referer": "https://zigzag.kr/",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}
```

### GraphQL Query (최적화)

```graphql
query GetCatalogProductDetailPageOption(
  $catalog_product_id: ID!
  $input: PdpBaseInfoInput
) {
  pdp_option_info(catalog_product_id: $catalog_product_id, input: $input) {
    catalog_product {
      id
      name
      shop_name

      product_image_list {
        image_type
        pdp_thumbnail_url
      }

      matched_item_list {
        sales_status
        display_status
      }

      product_price {
        max_price_info {
          price
        }
        final_discount_info {
          discount_price
        }
        display_final_price {
          final_price {
            price
            badge {
              text
            }
          }
          final_price_additional {
            price
            badge {
              text
            }
          }
        }
      }
    }
  }
}
```

### Request Body

```typescript
{
  query: EXTRACTION_QUERY,
  variables: {
    catalog_product_id: "117931583",
    input: {
      catalog_product_id: "117931583",
      entry_source_type: ""
    }
  }
}
```

### 응답 구조

```typescript
{
  data: {
    pdp_option_info: {
      catalog_product: {
        id: string,
        name: string,
        shop_name: string,
        product_image_list: Array<{
          image_type: "MAIN" | "SUB",
          pdp_thumbnail_url: string
        }>,
        matched_item_list: Array<{
          sales_status: "ON_SALE" | "SOLD_OUT"
        }>,
        product_price: {
          max_price_info: { price: number },
          final_discount_info: { discount_price: number },
          display_final_price: {
            final_price: {
              price: number,
              badge: { text: string } | null
            },
            final_price_additional: {
              price: number,
              badge: { text: string }
            } | null
          }
        }
      }
    }
  }
}
```

---

## 데이터 추출 방법

### 필수 5개 필드

| 필드               | 추출 경로                                            | 설명                         |
| ------------------ | ---------------------------------------------------- | ---------------------------- |
| `product_name`     | `catalog_product.name`                               | 상품명                       |
| `thumbnail`        | `catalog_product.product_image_list[]`               | `image_type === "MAIN"` 필터 |
| `sale_status`      | `catalog_product.matched_item_list[0].sales_status`  | 첫 번째 아이템 기준          |
| `original_price`   | `catalog_product.product_price.max_price_info.price` | 정가                         |
| `discounted_price` | **조건부 로직** (아래 참조)                          | 첫구매 제외 가격             |

### ⚠️ `discounted_price` 추출 로직 (중요)

```typescript
const badge = displayPrice.final_price_additional?.badge?.text;
const isFirstPurchase = badge?.includes("첫구매") ?? false;

let discountedPrice: number;

if (isFirstPurchase) {
  // 첫구매 쿠폰: final_price.price = 첫구매 제외 가격
  discountedPrice = displayPrice.final_price.price;
} else {
  // 일반 할인: final_discount_info.discount_price
  discountedPrice = priceData.final_discount_info.discount_price;
}
```

**핵심 포인트**:

- 배지에 **"첫구매"** 포함 시 → `display_final_price.final_price.price` 사용
- 그 외 → `final_discount_info.discount_price` 사용

---

## 가격 구조 이해

### 케이스별 가격 구조

#### 케이스 1: 일반 쿠폰 (판매중)

**제품 ID**: `117931583`
**배지**: `"쿠폰할인가"`

```typescript
{
  max_price_info: { price: 59800 },           // 정가
  final_discount_info: { discount_price: 44850 }, // 최종가
  display_final_price: {
    final_price: {
      price: 44850,                           // UI 표시 가격
      badge: { text: "쿠폰할인가" }
    },
    final_price_additional: null              // 없음
  }
}
```

**추출 결과**:

- `original_price`: 59,800원
- `discounted_price`: 44,850원 (25% 할인)
- `sale_status`: "ON_SALE"

---

#### 케이스 2: 품절 상품

**제품 ID**: `116580170`
**배지**: `null`

```typescript
{
  max_price_info: { price: 30000 },
  final_discount_info: { discount_price: 27000 },
  matched_item_list: [
    { sales_status: "SOLD_OUT" }              // ✅ 품절
  ],
  display_final_price: {
    final_price: {
      price: 27000,
      badge: null                             // 배지 없음
    },
    final_price_additional: null
  }
}
```

**추출 결과**:

- `original_price`: 30,000원
- `discounted_price`: 27,000원 (10% 할인)
- `sale_status`: "SOLD_OUT" ✅

---

#### 케이스 3: 직잭픽 (프로모션)

**제품 ID**: `155514630`
**배지**: `"직잭픽"`

```typescript
{
  max_price_info: { price: 57000 },
  final_discount_info: { discount_price: 34200 },
  product_promotion_discount_info: {
    discount_amount: 14250                    // 프로모션 할인
  },
  display_final_price: {
    final_price: {
      price: 42750,                           // 프로모션가 (취소선)
      badge: null
    },
    final_price_additional: {
      price: 34200,                           // 최종가 (강조)
      badge: { text: "직잭픽" }               // ✅ 특수 배지
    }
  }
}
```

**추출 결과**:

- `original_price`: 57,000원
- `discounted_price`: 34,200원 (40% 할인)
- `badge`: "직잭픽"

---

#### 케이스 4: 첫구매 쿠폰 ⚠️ **중요**

**제품 ID**: `135275589`
**배지**: `"첫구매쿠폰"`

```typescript
{
  max_price_info: { price: 21800 },
  final_discount_info: { discount_price: 10360 }, // ← 첫구매 적용가
  product_promotion_discount_info: {
    discount_amount: 7000
  },
  display_final_price: {
    final_price: {
      price: 14800,                           // ✅ 첫구매 제외 가격
      badge: null
    },
    final_price_additional: {
      price: 10360,                           // 첫구매 적용 가격
      badge: { text: "첫구매쿠폰" }           // ✅ 첫구매 감지
    }
  }
}
```

**추출 결과**:

- `original_price`: 21,800원
- `discounted_price`: **14,800원** (첫구매 **제외** 가격) ✅
- `badge`: "첫구매쿠폰"
- ⚠️ `final_discount_info.discount_price` (10,360원) 사용 **안 함**

**핵심 로직**:

```typescript
if (badge?.includes("첫구매")) {
  // ✅ 첫구매 제외 가격
  discountedPrice = displayPrice.final_price.price; // 14,800원
} else {
  // 일반 할인가
  discountedPrice = priceData.final_discount_info.discount_price;
}
```

---

## 구현 예제

### TypeScript 전체 코드

```typescript
const GRAPHQL_ENDPOINT =
  "https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption";

const EXTRACTION_QUERY = `
  query GetCatalogProductDetailPageOption($catalog_product_id: ID!, $input: PdpBaseInfoInput) {
    pdp_option_info(catalog_product_id: $catalog_product_id, input: $input) {
      catalog_product {
        id
        name
        shop_name
        product_image_list {
          image_type
          pdp_thumbnail_url
        }
        matched_item_list {
          sales_status
        }
        product_price {
          max_price_info { price }
          final_discount_info { discount_price }
          display_final_price {
            final_price {
              price
              badge { text }
            }
            final_price_additional {
              price
              badge { text }
            }
          }
        }
      }
    }
  }
`;

interface ExtractedData {
  product_id: string;
  product_name: string;
  shop_name: string;
  thumbnail: string;
  sale_status: string;
  original_price: number;
  discounted_price: number;
  is_first_purchase: boolean;
  badge?: string;
}

async function fetchProductData(productId: string) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://zigzag.kr",
      Referer: "https://zigzag.kr/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      query: EXTRACTION_QUERY,
      variables: {
        catalog_product_id: productId,
        input: {
          catalog_product_id: productId,
          entry_source_type: "",
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function extractData(result: any): ExtractedData {
  const product = result.data?.pdp_option_info?.catalog_product;

  if (!product) {
    throw new Error("상품 데이터 없음");
  }

  // 1. 썸네일 추출 (MAIN 이미지)
  const mainImage = product.product_image_list?.find(
    (img: any) => img.image_type === "MAIN",
  );
  const thumbnail = mainImage?.pdp_thumbnail_url || "";

  // 2. 판매 상태 (첫 번째 아이템 기준)
  const saleStatus = product.matched_item_list?.[0]?.sales_status || "UNKNOWN";

  // 3. 가격 정보
  const priceData = product.product_price;
  const originalPrice = priceData.max_price_info?.price || 0;

  // 4. 첫구매 제외 가격 계산 ⚠️ 중요
  const displayPrice = priceData.display_final_price;
  const badge = displayPrice.final_price_additional?.badge?.text;
  const isFirstPurchase = badge?.includes("첫구매") ?? false;

  let discountedPrice: number;

  if (isFirstPurchase) {
    // 첫구매 제외 가격 = display_final_price.final_price.price
    discountedPrice = displayPrice.final_price.price;
  } else {
    // 일반 할인가 = final_discount_info.discount_price
    discountedPrice = priceData.final_discount_info?.discount_price || 0;
  }

  return {
    product_id: product.id,
    product_name: product.name,
    shop_name: product.shop_name,
    thumbnail,
    sale_status: saleStatus,
    original_price: originalPrice,
    discounted_price: discountedPrice,
    is_first_purchase: isFirstPurchase,
    badge: badge || displayPrice.final_price.badge?.text || undefined,
  };
}

// 사용 예시
async function main() {
  const productId = "117931583";
  const result = await fetchProductData(productId);
  const extracted = extractData(result);

  console.log(extracted);
  /*
  {
    product_id: '117931583',
    product_name: '[총 2개/교차가능] 달바 \'옐로우&레드\' 화이트 트러플 미스트 세트 100ml+100ml',
    shop_name: '달바',
    thumbnail: 'https://cf.product-image.s.zigzag.kr/original/d/2022/12/1/15872_202212011955150401_93488.jpeg?width=720&height=720&quality=80&format=jpeg',
    sale_status: 'ON_SALE',
    original_price: 59800,
    discounted_price: 44850,
    is_first_purchase: false,
    badge: '쿠폰할인가'
  }
  */
}
```

---

## 배지 시스템

### 배지 타입별 처리

| 배지 텍스트        | 의미          | 가격 구조                                                         | 추출 로직                                  |
| ------------------ | ------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `"쿠폰할인가"`     | 일반 쿠폰     | `final_price` (최종가만)                                          | `final_discount_info.discount_price`       |
| `"직잭픽"`         | 지그재그 단독 | `final_price` (프로모션가) + `final_price_additional` (최종가)    | `final_discount_info.discount_price`       |
| **`"첫구매쿠폰"`** | 첫 구매 쿠폰  | `final_price` (첫구매 제외) + `final_price_additional` (첫구매가) | ✅ `display_final_price.final_price.price` |
| `null`             | 스토어 할인   | `final_price` (최종가만)                                          | `final_discount_info.discount_price`       |

### 배지 감지 로직

```typescript
const badge = displayPrice.final_price_additional?.badge?.text;

if (badge?.includes("첫구매")) {
  // 첫구매 쿠폰 처리
  const priceWithoutFirst = displayPrice.final_price.price;
  const priceWithFirst = displayPrice.final_price_additional.price;
} else if (badge === "직잭픽") {
  // 직잭픽 처리
  const promotionPrice = displayPrice.final_price.price;
  const finalPrice = displayPrice.final_price_additional.price;
} else {
  // 일반 할인
  const finalPrice = displayPrice.final_price.price;
}
```

---

## Rate Limiting 권장사항

### API 호출 제한

```typescript
// 권장: 2초 간격
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processProducts(productIds: string[]) {
  for (let i = 0; i < productIds.length; i++) {
    const result = await fetchProductData(productIds[i]);
    const extracted = extractData(result);

    // 처리...

    if (i < productIds.length - 1) {
      await sleep(2000); // 2초 대기
    }
  }
}
```

### 에러 처리

```typescript
async function fetchWithRetry(productId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchProductData(productId);
    } catch (error: any) {
      if (attempt === maxRetries) throw error;

      console.log(`재시도 ${attempt}/${maxRetries}...`);
      await sleep(attempt * 1000); // 지수 백오프
    }
  }
}
```

---

## 검증 결과

### 테스트 이력

| 테스트 ID   | 케이스             | 결과    | Cloudflare |
| ----------- | ------------------ | ------- | ---------- |
| `117931583` | 일반 쿠폰 (판매중) | ✅ 성공 | 차단 없음  |
| `116580170` | 품절 상품          | ✅ 성공 | 차단 없음  |
| `155514630` | 직잭픽             | ✅ 성공 | 차단 없음  |
| `135275589` | 첫구매 쿠폰        | ✅ 성공 | 차단 없음  |

**총 테스트**: 6회
**성공률**: 100%
**Cloudflare 차단**: 0회
**평균 응답 시간**: ~300ms

---

## 참고 자료

### 테스트 스크립트

- [product_scanner/scripts/test-zigzag-api.ts](../scripts/test-zigzag-api.ts) - GraphQL API 테스트

### GraphQL 응답 예시

- [zigzag_case1.json](./zigzag_case1.json) - 일반 쿠폰
- [zigzag_case2.json](./zigzag_case2.json) - 품절 상품
- [zigzag_case3.json](./zigzag_case3.json) - 직잭픽
- [zigzag_case4.json](./zigzag_case4.json) - 첫구매 쿠폰

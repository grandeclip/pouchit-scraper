# ZigZag 플랫폼 전략 분석

## 📋 개요

| 항목              | 값                                                                      |
| ----------------- | ----------------------------------------------------------------------- |
| **플랫폼**        | ZigZag (지그재그)                                                       |
| **방식**          | GraphQL API (POST)                                                      |
| **엔드포인트**    | `https://api.zigzag.kr/api/2/graphql/GetCatalogProductDetailPageOption` |
| **우선순위**      | GraphQL (priority 1), Playwright fallback (비활성화)                    |
| **Rate Limiting** | 2.5초 간격, 순차 처리 (CloudFront 403 방지)                             |

---

## 🔍 현재 아키텍처

### 파일 구조

```
src/
├── config/platforms/zigzag.yaml       # 전략 설정, GraphQL 쿼리
├── core/domain/
│   ├── ZigzagProduct.ts               # 도메인 모델
│   └── ZigzagConfig.ts                # 설정 타입
├── scanners/
│   ├── ZigzagGraphQLScanner.ts        # GraphQL 스캐너 (parseData 내장)
│   └── platforms/zigzag/
│       └── ZigzagScannerFactory.ts    # 팩토리
└── services/
    └── ZigzagScanService.ts           # Facade
```

### 데이터 흐름

```
ZigzagScanService.scanProduct(productId)
  → ScannerRegistry.getScanner("zigzag", "graphql")
    → ZigzagScannerFactory.create(strategy)
      → ZigzagGraphQLScanner
        → extractData(): GraphQL API 호출
        → parseData(): 데이터 파싱 (하드코딩)
          → ZigzagProduct 생성
```

---

## 📊 GraphQL 응답 구조

### Query

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
      matched_item_list {
        sales_status
        display_status
      }
      product_image_list {
        image_type
        pdp_thumbnail_url
      }
    }
  }
}
```

### 응답 타입

```typescript
interface GraphQLResponse {
  data?: {
    pdp_option_info?: {
      catalog_product?: {
        id: string;
        name: string;
        shop_name: string;
        product_price: {
          max_price_info: { price: number };
          final_discount_info: { discount_price: number };
          display_final_price: {
            final_price: {
              price: number;
              badge: { text: string } | null;
            };
            final_price_additional: {
              price: number;
              badge: { text: string };
            } | null;
          };
        };
        matched_item_list?: Array<{
          sales_status: ZigzagSalesStatus; // "ON_SALE" | "SOLD_OUT" | "SUSPENDED"
          display_status: ZigzagDisplayStatus; // "VISIBLE" | "HIDDEN"
        }>;
        product_image_list?: Array<{
          image_type: string; // "MAIN", "SUB" 등
          pdp_thumbnail_url: string;
        }>;
      } | null;
    } | null;
  } | null;
  errors?: Array<{
    message: string;
    extensions?: Record<string, unknown>;
  }>;
}
```

---

## 🎯 핵심 추출 로직

### 1. 가격 추출 (첫구매 조건부)

```typescript
// 핵심 로직: 첫구매 배지 여부에 따라 가격 선택
const badge = displayPrice?.final_price_additional?.badge?.text;
const isFirstPurchase = ZIGZAG_CONSTANTS.FIRST_PURCHASE_BADGE_KEYWORDS.some(
  (keyword) => badge?.includes(keyword),
); // ["첫구매", "첫 구매"]

if (isFirstPurchase) {
  // 첫구매 제외 가격 = display_final_price.final_price.price
  discountedPrice = displayPrice?.final_price?.price || originalPrice;
} else {
  // 일반 할인가 = final_discount_info.discount_price
  discountedPrice =
    priceData?.final_discount_info?.discount_price || originalPrice;
}
```

**가격 필드 매핑**:

| 필드          | 경로                                    | 설명                  |
| ------------- | --------------------------------------- | --------------------- |
| 정가          | `max_price_info.price`                  | 원래 가격             |
| 일반 할인가   | `final_discount_info.discount_price`    | 기본 할인가           |
| 첫구매 제외가 | `display_final_price.final_price.price` | 첫구매 할인 제외 가격 |

### 2. 판매 상태 추출 (matched_item_list)

```typescript
const items = catalogProduct.matched_item_list || [];

let salesStatus: ZigzagSalesStatus = "SUSPENDED"; // 기본값
let displayStatus: ZigzagDisplayStatus = "HIDDEN"; // 기본값

if (items.length > 0) {
  // 하나라도 ON_SALE → 판매중
  const hasOnSale = items.some((item) => item.sales_status === "ON_SALE");
  // 모두 SOLD_OUT → 품절
  const allSoldOut = items.every((item) => item.sales_status === "SOLD_OUT");

  if (hasOnSale) {
    salesStatus = "ON_SALE";
  } else if (allSoldOut) {
    salesStatus = "SOLD_OUT";
  } else {
    salesStatus = items[0].sales_status; // 첫 번째 아이템 상태
  }

  // 하나라도 VISIBLE → 노출 중
  const hasVisible = items.some((item) => item.display_status === "VISIBLE");
  displayStatus = hasVisible ? "VISIBLE" : items[0].display_status;
}

// 구매 가능 = 판매중 AND 노출중
const isPurchasable = salesStatus === "ON_SALE" && displayStatus === "VISIBLE";
```

**상태 매핑**:

| ZigZag 상태 | SaleStatus enum |
| ----------- | --------------- |
| ON_SALE     | `on_sale`       |
| SOLD_OUT    | `sold_out`      |
| SUSPENDED   | `off_sale`      |

### 3. 메타데이터 추출

```typescript
const brand = catalogProduct.shop_name || "";

// MAIN 이미지 필터링
const thumbnail =
  catalogProduct.product_image_list?.find((img) => img.image_type === "MAIN")
    ?.pdp_thumbnail_url || "";
```

---

## ⚠️ 특이사항

### 1. CloudFront 403 방지

```yaml
workflow:
  rate_limit:
    enabled: true
    wait_time_ms: 2500 # 요청 간 2.5초 대기
  concurrency:
    max: 1 # 순차 처리 (병렬 금지)
```

### 2. HTTP 헤더 (모바일 UA)

```yaml
headers:
  User-Agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5...)"
  Origin: "https://zigzag.kr"
  Referer: "https://zigzag.kr/"
```

### 3. Playwright 전략 (비활성화)

- 현재 GraphQL만 사용
- `__NEXT_DATA__` 기반 fallback 전략 준비됨 (주석 처리)

---

## 📈 Extractor 패턴 적용 계획

### 목표 구조

```
src/extractors/zigzag/
├── index.ts                      # Barrel export
├── types.ts                      # GraphQL 응답 타입
├── ZigzagExtractor.ts            # Facade
├── ZigzagPriceExtractor.ts       # 가격 (첫구매 로직)
├── ZigzagSaleStatusExtractor.ts  # 상태 (matched_item_list)
└── ZigzagMetadataExtractor.ts    # 메타데이터
```

### 구현 포인트

| Extractor      | 핵심 로직                               | 복잡도 |
| -------------- | --------------------------------------- | ------ |
| **Price**      | 첫구매 배지 검사 → 조건부 가격 선택     | 중     |
| **SaleStatus** | matched_item_list 배열 → 복합 상태 계산 | 상     |
| **Metadata**   | shop_name, MAIN 이미지 필터링           | 하     |

### 타입 이동

```typescript
// Scanner의 GraphQLResponse → extractors/zigzag/types.ts
export interface ZigzagGraphQLResponse { ... }
export interface CatalogProduct { ... }
export interface ProductPrice { ... }
export interface MatchedItem { ... }
```

---

## 🔗 참고 파일

- `src/scanners/ZigzagGraphQLScanner.ts` - 현재 parseData() 로직
- `src/config/platforms/zigzag.yaml` - GraphQL 쿼리, 설정
- `src/config/constants.ts` - ZIGZAG_CONSTANTS.FIRST_PURCHASE_BADGE_KEYWORDS
- `src/core/domain/ZigzagProduct.ts` - 도메인 모델, mapSaleStatus()

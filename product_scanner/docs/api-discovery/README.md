# API Discovery - 쇼핑몰 검색 API 분석

> **중요 발견**: DOM 파싱 대신 내부 API를 직접 호출하여 상품 데이터를 추출하는 방식이 훨씬 안정적이고 효율적입니다.

## 개요

기존 접근 방식(DOM 파싱)의 문제점:

- 셀렉터 변경 시 스크래퍼 깨짐
- 브라우저 렌더링 대기 필요
- 동적 로딩 콘텐츠 처리 복잡
- 데이터 누락 가능성

**API 방식의 장점**:

- ✅ 구조화된 JSON 응답
- ✅ 빠른 응답 속도 (브라우저 불필요)
- ✅ 완전한 데이터 (모든 필드 포함)
- ✅ 안정적인 유지보수

---

## OliveYoung (올리브영)

### 발견일

2024-12-08 (모바일 웹 분석)

### API Endpoint

```
POST https://m.oliveyoung.co.kr/search/api/v3/common/unified-search/goods
```

### ⚠️ 접근 제한

```
❌ curl 직접 호출 불가 (Cloudflare 보호)
✅ Playwright 브라우저 자동화로 API 응답 캡쳐
```

### Request

**Headers:**

```
Content-Type: application/json
```

**Body:**

```json
{
  "query": "검색어",
  "page": 1,
  "size": 10
}
```

### Response Structure

```json
{
  "status": "SUCCESS",
  "code": 200,
  "message": "요청에 성공하였습니다.",
  "data": {
    "oliveGoods": {
      "count": 3,
      "totalCount": 3,
      "data": [
        {
          "goodsNumber": "A000000165598",
          "goodsName": "[더블기획/1+1] 토리든 다이브인 히알루론산 수딩 크림...",
          "onlineBrandName": "토리든",
          "onlineBrandEnglishName": "Torriden",
          "onlineBrandCode": "A002820",
          "priceToPay": 27930,
          "originalPrice": 42000,
          "discountRate": 33,
          "imagePath": "10/0000/0016/A00000016559831ko.jpg?l=ko",
          "goodsEvaluationScoreValue": 4.8,
          "goodsAssessmentTotalCount": 11777,
          "soldOutFlag": false,
          "bestGoodsFlag": true,
          "newGoodsFlag": false,
          "quickDeliveryFlag": true,
          "couponFlag": true,
          "displayCategoryName": "크림",
          "upperCategoryName": "뷰티",
          "middleCategoryName": "스킨케어",
          "lowerCategoryName": "크림"
        }
      ]
    }
  }
}
```

### Field Mapping (API → 내부 모델)

| API 필드                    | 내부 필드          | 설명               |
| --------------------------- | ------------------ | ------------------ |
| `goodsNumber`               | `productId`        | 상품 고유 ID       |
| `goodsName`                 | `productName`      | 상품명             |
| `onlineBrandName`           | `brand`            | 브랜드명 (한글)    |
| `onlineBrandEnglishName`    | `brandEn`          | 브랜드명 (영문)    |
| `priceToPay`                | `salePrice`        | 판매가 (할인 적용) |
| `originalPrice`             | `originalPrice`    | 원가               |
| `discountRate`              | `discountRate`     | 할인율 (%)         |
| `imagePath`                 | `thumbnail`        | 썸네일 이미지 경로 |
| `goodsEvaluationScoreValue` | `rating`           | 평점 (5점 만점)    |
| `goodsAssessmentTotalCount` | `reviewCount`      | 리뷰 수            |
| `soldOutFlag`               | `isSoldOut`        | 품절 여부          |
| `bestGoodsFlag`             | `isBest`           | 베스트 상품 여부   |
| `quickDeliveryFlag`         | `hasQuickDelivery` | 오늘드림 가능 여부 |
| `displayCategoryName`       | `category`         | 카테고리명         |

### URL 생성 규칙

**썸네일 URL:**

```
https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/{imagePath}
```

**상품 상세 URL:**

```
https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo={goodsNumber}
```

### 구현 예시

```typescript
interface OliveYoungSearchRequest {
  query: string;
  page?: number;
  size?: number;
}

interface OliveYoungProduct {
  goodsNumber: string;
  goodsName: string;
  onlineBrandName: string;
  onlineBrandEnglishName: string;
  priceToPay: number;
  originalPrice: number;
  discountRate: number;
  imagePath: string;
  goodsEvaluationScoreValue: number;
  goodsAssessmentTotalCount: number;
  soldOutFlag: boolean;
  bestGoodsFlag: boolean;
  quickDeliveryFlag: boolean;
}

async function searchOliveYoung(query: string): Promise<OliveYoungProduct[]> {
  const response = await fetch(
    "https://m.oliveyoung.co.kr/search/api/v3/common/unified-search/goods",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, page: 1, size: 10 }),
    },
  );

  const data = await response.json();
  return data.data.oliveGoods.data;
}
```

### Shell Script

```bash
# 사용법
./scripts/search-oliveyoung.sh "토리든" 10
./scripts/search-oliveyoung.sh "수분크림" 10 --json
```

### 추가 발견된 API

| Endpoint                                             | 용도            |
| ---------------------------------------------------- | --------------- |
| `/search/api/v3/common/unified-search/goods/filters` | 필터 옵션 조회  |
| `/search/api/v2/common/auto-complete-keywords`       | 자동완성 키워드 |
| `/search/api/v1/common/popular-keywords`             | 인기 검색어     |
| `/search/api/v2/common/recommended-products`         | 추천 상품       |

### 특이사항

- ❌ **curl 직접 호출 불가** (Cloudflare 보호)
- ✅ **Playwright 필수** (API 응답 인터셉트)
- 모바일 사이트 (`m.oliveyoung.co.kr`) 타겟

---

## Zigzag (지그재그)

### 발견일

2024-12-XX (모바일 웹 분석)

### API Endpoint

```
POST https://api.zigzag.kr/api/2/graphql/GetSearchResult
```

### Request

**Headers:**

```
Content-Type: application/json
```

**Body (GraphQL):**

```json
{
  "operationName": "GetSearchResult",
  "variables": {
    "input": {
      "q": "검색어",
      "page_id": "srp_item",
      "filter_id_list": ["205"],
      "initial": true,
      "after": null,
      "enable_guided_keyword_search": true
    }
  },
  "query": "query GetSearchResult($input: SearchResultInput!) { search_result(input: $input) { ... } }"
}
```

### Response Structure

```json
{
  "data": {
    "search_result": {
      "end_cursor": "WyIxNDQwMS45MzYiLCIzLjc1IiwiMTc0NDY5ODc4MjAwMCIsIjE2MDg4NTk3MSJd:xxx",
      "has_next": true,
      "total_count": 806,
      "searched_keyword": "수분크림",
      "ui_item_list": [
        {
          "__typename": "UxGoodsCardItem",
          "catalog_product_id": "116775759",
          "title": "원더 세라마이드 모찌 수분 크림 300ml",
          "shop_name": "토니모리",
          "shop_id": "19151",
          "final_price": 15000,
          "discount_rate": 0,
          "review_score": 4.8,
          "display_review_count": "126",
          "image_url": "https://cf.product-image.s.zigzag.kr/original/d/2024/12/26/...",
          "webp_image_url": "https://cf.product-image.s.zigzag.kr/original/d/...?width=400&height=400&quality=80&format=webp",
          "product_url": "https://store.zigzag.kr/app/catalog/products/116775759",
          "free_shipping": true,
          "fomo": { "text": "관심 126" },
          "sellable_status": "ON_SALE"
        }
      ]
    }
  }
}
```

### Field Mapping (API → 내부 모델)

| API 필드               | 내부 필드       | 설명             |
| ---------------------- | --------------- | ---------------- |
| `catalog_product_id`   | `productId`     | 상품 고유 ID     |
| `title`                | `productName`   | 상품명           |
| `shop_name`            | `brand`         | 브랜드/스토어명  |
| `final_price`          | `salePrice`     | 최종 판매가      |
| `discount_rate`        | `discountRate`  | 할인율 (%)       |
| `image_url`            | `thumbnail`     | 썸네일 이미지    |
| `webp_image_url`       | `thumbnailWebp` | WebP 썸네일      |
| `review_score`         | `rating`        | 평점 (5점 만점)  |
| `display_review_count` | `reviewCount`   | 리뷰 수 (문자열) |
| `product_url`          | `productUrl`    | 상품 상세 URL    |
| `free_shipping`        | `freeShipping`  | 무료배송 여부    |
| `fomo.text`            | `interestCount` | 관심 수          |
| `sellable_status`      | `status`        | 판매 상태        |

### URL 생성 규칙

**썸네일 URL (WebP 최적화):**

```
{webp_image_url}
```

**상품 상세 URL:**

```
https://zigzag.kr/catalog/products/{catalog_product_id}
```

### 구현 예시

```typescript
interface ZigzagSearchInput {
  page_id: string; // "search_검색어" 형식
}

interface ZigzagProduct {
  catalog_product_id: string;
  title: string;
  shop_name: string;
  shop_id: string;
  final_price: number;
  discount_rate: number;
  review_score: number;
  display_review_count: string;
  image_url: string;
  webp_image_url: string;
  product_url: string;
  free_shipping: boolean;
  fomo: { text: string };
  sellable_status: string;
}

async function searchZigzag(keyword: string): Promise<ZigzagProduct[]> {
  const query = `
    query GetSearchResult($input: SearchResultInput!) {
      search_result(input: $input) {
        total_count
        has_next
        ui_item_list {
          ... on UxGoodsCardItem {
            catalog_product_id
            title
            shop_name
            final_price
            discount_rate
            review_score
            display_review_count
            image_url
            webp_image_url
            product_url
            free_shipping
            fomo { text }
          }
        }
      }
    }
  `;

  const response = await fetch(
    "https://api.zigzag.kr/api/2/graphql/GetSearchResult",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "GetSearchResult",
        variables: { input: { page_id: `search_${keyword}` } },
        query,
      }),
    },
  );

  const data = await response.json();
  return data.data.search_result.ui_item_list.filter(
    (item: any) => item.__typename === "UxGoodsCardItem",
  );
}
```

### 추가 발견된 API

| Endpoint                                         | 용도             |
| ------------------------------------------------ | ---------------- |
| `/api/2/graphql/GetSearchWebPageInfo`            | 검색 페이지 정보 |
| `/api/2/graphql/GetRecommendedSearchKeywordList` | 추천 검색어      |
| `/api/2/graphql/GetWebSrpBanner`                 | 검색결과 배너    |
| `/api/2/graphql/GetUserName`                     | 사용자 정보      |

### filter_id_list (정렬)

| filter_id | 정렬 기준    |
| --------- | ------------ |
| `205`     | 직잭추천순   |
| `206`     | 인기순       |
| `207`     | 최신순       |
| `208`     | 낮은가격순   |
| `209`     | 높은가격순   |

### Shell Script

```bash
# 사용법
./scripts/search-zigzag.sh "토리든" 10
./scripts/search-zigzag.sh "수분크림" 10 --json
```

### 특이사항

- ✅ **curl 직접 호출 가능**
- **GraphQL 기반**: REST가 아닌 GraphQL 사용
- **q 필드**: 검색 키워드 전달
- **page_id**: `srp_item` 고정값
- **filter_id_list**: 정렬 기준 (`205` = 직잭추천순)
- **ui_item_list**: 상품 외 필터, 툴바 등 다양한 UI 컴포넌트 포함
- **UxGoodsCardItem**: 상품 데이터 타입, `__typename`으로 필터링 필요
- **Pagination**: `end_cursor`와 `has_next`로 무한스크롤 구현
- GraphQL Introspection 비활성화

---

## Kurly (마켓컬리)

### 발견일

2024-12-08 (모바일 웹 분석)

### API Endpoint

```
GET https://api.kurly.com/search/v4/sites/market/normal-search
```

### ⚠️ 접근 제한

```
❌ curl 직접 호출 불가
  - 쿠키/세션 필요
  - 브라우저 헤더 검증

✅ Playwright + Stealth 필수
  - playwright-extra
  - puppeteer-extra-plugin-stealth
```

### Request

**Query Parameters:**

| 파라미터   | 값          | 설명           |
| ---------- | ----------- | -------------- |
| `keyword`  | `검색어`    | 검색 키워드    |
| `sortType` | `4`         | 정렬 (추천순)  |
| `page`     | `1`         | 페이지 번호    |

**sortType 옵션:**

| sortType | 정렬 기준    |
| -------- | ------------ |
| `4`      | 추천순       |
| `0`      | 신상품순     |
| `1`      | 판매량순     |
| `5`      | 혜택순       |
| `2`      | 낮은 가격순  |
| `3`      | 높은 가격순  |

### Response Structure

```json
{
  "success": true,
  "data": {
    "listSections": [{
      "data": {
        "items": [{
          "no": 1000146242,
          "name": "[토리든] 다이브인 저분자 히알루론산 세럼 40ml 기획 세트",
          "shortDescription": "속당김 없이 촘촘히 채우는 수분",
          "listImageUrl": "https://product-image.kurly.com/product/image/...",
          "productVerticalMediumUrl": "https://product-image.kurly.com/hdims/resize/...",
          "salesPrice": 29000,
          "discountedPrice": 16100,
          "discountRate": 44.0,
          "reviewCount": "727",
          "deliveryTypeNames": ["샛별배송"]
        }]
      }
    }],
    "meta": {
      "pagination": {
        "total": 2,
        "count": 2,
        "perPage": 96,
        "currentPage": 1,
        "totalPages": 1
      }
    }
  }
}
```

### Field Mapping

| API 필드                  | 내부 필드      | 설명           |
| ------------------------- | -------------- | -------------- |
| `no`                      | `productId`    | 상품 고유 ID   |
| `name`                    | `productName`  | 상품명         |
| `shortDescription`        | `description`  | 짧은 설명      |
| `listImageUrl`            | `thumbnail`    | 썸네일 URL     |
| `productVerticalMediumUrl`| `thumbnailMd`  | 중간 썸네일    |
| `salesPrice`              | `originalPrice`| 원가           |
| `discountedPrice`         | `salePrice`    | 판매가         |
| `discountRate`            | `discountRate` | 할인율 (%)     |
| `reviewCount`             | `reviewCount`  | 리뷰 수        |
| `deliveryTypeNames`       | `deliveryType` | 배송 타입      |

### URL 생성 규칙

**상품 상세 URL:**

```
https://www.kurly.com/goods/{no}
```

**썸네일 URL:**

```
{productVerticalMediumUrl} 또는 {listImageUrl}
```

### Shell Script

```bash
# 사용법
./scripts/search-kurly.sh "토리든" 10
./scripts/search-kurly.sh "수분크림" 10 --json
```

### 특이사항

- ❌ **curl 직접 호출 불가** (세션/쿠키 필요)
- ✅ **Playwright + Stealth 필수**
- API: `api.kurly.com/search/v4/sites/market/normal-search`
- 응답 구조: `data.listSections[0].data.items`
- 페이지네이션: `meta.pagination`

---

## Hwahae (화해)

### 발견일

2024-12-08 (모바일 웹 분석)

### ⚠️ 접근 방식

```
❌ API 없음 - SSR (Next.js) 기반
❌ curl 직접 호출 불가

✅ Playwright + Stealth + DOM 파싱 필수
  - 검색 결과가 HTML에 포함 (SSR)
  - DOM에서 직접 상품 정보 추출
```

### URL 패턴

**검색 페이지:**

```
https://www.hwahae.co.kr/search?q={keyword}
```

**쇼핑상품 상세:**

```
https://www.hwahae.co.kr/goods/{goods_id}
```

**제품 상세:**

```
https://www.hwahae.co.kr/products/{product_id}
```

### 이미지 URL 패턴

```
https://img.hwahae.co.kr/commerce/goods/{filename}
```

### DOM 구조

검색 결과 페이지에서 쇼핑상품 섹션:

```html
<section>
  <h2>쇼핑상품 66</h2>
  <ul>
    <li>
      <a href="/goods/54413">
        <img src="https://img.hwahae.co.kr/commerce/goods/..." />
        <span>토리든 다이브인 저분자 히알루론산 세럼...</span>
      </a>
    </li>
    ...
  </ul>
</section>
```

### Field Mapping (DOM 추출)

| DOM 요소              | 내부 필드      | 설명           |
| --------------------- | -------------- | -------------- |
| `a[href]`             | `url`          | 상품 URL       |
| `a > img[src]`        | `thumbnail`    | 썸네일 URL     |
| `a` textContent       | `name`         | 상품명         |
| `h2` 텍스트 (숫자)    | `total_count`  | 총 상품 수     |

### Shell Script

```bash
# 사용법
./scripts/search-hwahae.sh "토리든" 10
./scripts/search-hwahae.sh "세럼" 10 --json
```

### 특이사항

- ❌ **API 없음** (SSR 기반 Next.js)
- ❌ **curl 직접 호출 불가**
- ✅ **Playwright + Stealth + DOM 파싱 필수**
- 검색 결과: "쇼핑상품" 섹션에서 추출
- 상품 URL: `/goods/{goods_id}` 형식
- 이미지: `img.hwahae.co.kr/commerce/goods/` 도메인

---

## Musinsa (무신사)

### 발견일

2024-12-08 (모바일 웹 분석)

### API Endpoint

```
GET https://api.musinsa.com/api2/dp/v1/plp/goods
```

### ⚠️ 접근 제한

```
❌ curl 직접 호출 불가 (403 Forbidden)
  - Cloudflare 보호
  - 특정 헤더/쿠키 필요

✅ Playwright + Stealth 필수
  - playwright-extra
  - puppeteer-extra-plugin-stealth
```

### Request

**Query Parameters:**

| 파라미터   | 값          | 설명           |
| ---------- | ----------- | -------------- |
| `gf`       | `A`         | 상품 필터      |
| `keyword`  | `검색어`    | 검색 키워드    |
| `sortCode` | `POPULAR`   | 정렬 (인기순)  |
| `isUsed`   | `false`     | 중고 여부      |
| `page`     | `1`         | 페이지 번호    |
| `size`     | `20`        | 페이지당 개수  |
| `caller`   | `SEARCH`    | 호출자 구분    |

### Response Structure

```json
{
  "data": {
    "pagination": {
      "total": 87
    },
    "list": [
      {
        "goodsNo": 4265842,
        "goodsName": "[2종세트] 다이브인 저분자 히알루론산 세럼 70ml+40ml",
        "goodsLinkUrl": "https://www.musinsa.com/products/4265842",
        "thumbnail": "https://image.msscdn.net/images/goods_img/20240722/4265842/4265842_17634472081885_500.jpg",
        "price": 42000,
        "salePrice": 32110,
        "discountRate": 24
      }
    ]
  }
}
```

### Field Mapping

| API 필드       | 내부 필드      | 설명          |
| -------------- | -------------- | ------------- |
| `goodsNo`      | `productId`    | 상품 고유 ID  |
| `goodsName`    | `productName`  | 상품명        |
| `goodsLinkUrl` | `productUrl`   | 상품 URL (전체) |
| `thumbnail`    | `thumbnail`    | 썸네일 URL    |
| `price`        | `originalPrice`| 원가          |
| `salePrice`    | `salePrice`    | 판매가        |
| `discountRate` | `discountRate` | 할인율 (%)    |

### URL 생성 규칙

**상품 상세 URL:**

```
{goodsLinkUrl} (전체 URL 제공)
```

### Shell Script

```bash
# 사용법
./scripts/search-musinsa.sh "토리든" 10
./scripts/search-musinsa.sh "토리든 세럼" 10 --json
```

### 특이사항

- ❌ **curl 직접 호출 불가** (403 Forbidden)
- ✅ **Playwright + Stealth 필수**
- `goodsLinkUrl`이 전체 URL로 제공됨
- REST API (JSON 응답)
- 페이지네이션: `page`, `size` 파라미터

---

## Ably (에이블리)

### 발견일

2024-12-08 (모바일 웹 분석)

### API Endpoint

```
GET https://api.a-bly.com/api/v2/screens/SEARCH_RESULT/
```

### Request

**Query Parameters:**

| 파라미터      | 값        | 설명         |
| ------------- | --------- | ------------ |
| `query`       | `검색어`  | 검색 키워드  |
| `search_type` | `DIRECT`  | 검색 타입    |

### ⚠️ 접근 제한

```
❌ curl 직접 호출 불가
  - Cloudflare 보호
  - 인증 토큰 필요 (401 에러)

✅ Playwright + Stealth 필수
  - playwright-extra
  - puppeteer-extra-plugin-stealth
```

### Response Structure

```json
{
  "view_event_logging": {
    "analytics": {
      "SEARCH_RESULTS_GOODS": 71
    }
  },
  "components": [
    {
      "type": {
        "item_list": "THREE_COL_GOODS_LIST"
      },
      "entity": {
        "item_list": [
          {
            "item": {
              "sno": 18223241,
              "name": "토리든 다이브인 저분자 히알루론산 세럼 50ml",
              "image": "https://d3ha2047wt6x28.cloudfront.net/...",
              "market_name": "토리든",
              "price": 22000,
              "discount_rate": 25
            }
          }
        ]
      }
    }
  ]
}
```

### Field Mapping

| API 필드                                      | 내부 필드      | 설명         |
| --------------------------------------------- | -------------- | ------------ |
| `view_event_logging.analytics.SEARCH_RESULTS_GOODS` | `totalCount` | 총 상품 수 |
| `components[].entity.item_list[].item.sno`    | `productId`    | 상품 고유 ID |
| `components[].entity.item_list[].item.name`   | `productName`  | 상품명       |
| `components[].entity.item_list[].item.image`  | `thumbnail`    | 썸네일 URL   |
| `components[].entity.item_list[].item.market_name` | `brand`   | 브랜드/마켓  |
| `components[].entity.item_list[].item.price`  | `salePrice`    | 판매가       |
| `components[].entity.item_list[].item.discount_rate` | `discountRate` | 할인율 (%) |

### URL 생성 규칙

**상품 상세 URL:**

```
https://m.a-bly.com/goods/{sno}
```

**썸네일 URL:**

```
{image} (CDN URL 그대로 사용)
```

### 구현 예시

```typescript
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

// Stealth 플러그인 적용 (Cloudflare 우회 필수)
chromium.use(stealth());

async function searchAbly(keyword: string): Promise<AblyProduct[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)...",
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await context.newPage();

  let apiResponse: any = null;

  // API 응답 인터셉트
  page.on("response", async (response) => {
    if (response.url().includes("/api/v2/screens/SEARCH_RESULT")) {
      apiResponse = await response.json();
    }
  });

  // 검색 흐름 실행
  await page.goto("https://m.a-bly.com/search");
  await page.locator('input[placeholder*="무료배송"]').fill(keyword);
  await page.keyboard.press("Enter");

  // API 응답 대기
  await page.waitForTimeout(5000);
  await browser.close();

  // 상품 추출
  return apiResponse.components
    .filter((c: any) => c.type?.item_list === "THREE_COL_GOODS_LIST")
    .flatMap((c: any) => c.entity.item_list.map((w: any) => w.item));
}
```

### Shell Script

```bash
# 사용법
./scripts/search-ably.sh "토리든" 10
./scripts/search-ably.sh "수분크림" 10 --json
```

### 특이사항

- ❌ **curl 직접 호출 불가** (Cloudflare + 인증)
- ✅ **Playwright + Stealth 필수**
- 응답에서 `THREE_COL_GOODS_LIST` 타입 컴포넌트 필터링 필요
- 모바일 사이트 (`m.a-bly.com`) 타겟

---

## 비교: DOM 파싱 vs API 방식

| 항목              | DOM 파싱                         | API 방식              |
| ----------------- | -------------------------------- | --------------------- |
| **안정성**        | ❌ 셀렉터 변경 시 깨짐           | ✅ 구조화된 JSON      |
| **속도**          | ❌ 브라우저 렌더링 필요 (~3-5초) | ✅ 직접 HTTP (~0.5초) |
| **데이터 완전성** | ❌ 일부 누락 가능                | ✅ 모든 필드 제공     |
| **유지보수**      | ❌ 빈번한 업데이트               | ✅ 안정적             |
| **리소스**        | ❌ Playwright 인스턴스 필요      | ✅ HTTP 클라이언트만  |
| **Rate Limiting** | ⚠️ 브라우저 기반                 | ⚠️ API 기반 (동일)    |

### 권장 전략

1. **API 우선**: API가 발견된 플랫폼은 API 방식 사용
2. **DOM 폴백**: API 없거나 차단 시 DOM 파싱으로 폴백
3. **하이브리드**: 일부 데이터만 API로 보완

---

## 플랫폼별 접근 방식 비교

| 플랫폼     | API 타입  | curl 가능 | Playwright 필요 | Stealth 필요 |
| ---------- | --------- | --------- | --------------- | ------------ |
| OliveYoung | REST      | ❌        | ✅              | ✅           |
| Zigzag     | GraphQL   | ✅        | ❌              | ❌           |
| Musinsa    | REST      | ❌ (403)  | ✅              | ✅           |
| Ably       | REST      | ❌ (401)  | ✅              | ✅           |
| Kurly      | REST      | ❌        | ✅              | ✅           |
| Hwahae     | DOM 파싱  | ❌        | ✅              | ✅           |

---

## 파일 구조

```
product_scanner/docs/api-discovery/
├── README.md                      # 이 문서
├── oliveyoung-api-response.json   # OliveYoung API 응답 샘플
├── custom_sample_zigzag.json      # Zigzag API 응답 샘플
└── (기타 샘플 추가 예정)

product_scanner/scripts/
├── search-zigzag.sh               # Zigzag 검색 (curl)
├── search-musinsa.sh              # Musinsa 검색 래퍼
├── search-musinsa.ts              # Musinsa 검색 (Playwright + Stealth)
├── search-oliveyoung.sh           # OliveYoung 검색 래퍼
├── search-oliveyoung.ts           # OliveYoung 검색 (Playwright)
├── search-ably.sh                 # Ably 검색 래퍼
├── search-ably.ts                 # Ably 검색 (Playwright + Stealth)
├── search-kurly.sh                # Kurly 검색 래퍼
├── search-kurly.ts                # Kurly 검색 (Playwright + Stealth)
├── search-hwahae.sh               # Hwahae 검색 래퍼
└── search-hwahae.ts               # Hwahae 검색 (Playwright + DOM 파싱)
```

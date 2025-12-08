# ZigZag Platform Analysis

**Platform**: ZigZag (지그재그)
**Type**: Fashion & Beauty E-commerce Marketplace
**Target URL**: `https://zigzag.kr/catalog/products/{product_id}`
**Analysis Date**: 2025-11-06

---

## 🎯 스크래핑 전략 (최종 확정)

### ✅ 최종 전략: **GraphQL API 직접 호출**

**API**: `GetCatalogProductDetailPageOption`

**이유**:

- ✅ 모든 제품 정보 완비 (이름, 가격, 재고, 이미지)
- ✅ 빠른 응답 속도 (<200ms)
- ✅ 브라우저 불필요 (Playwright 오버헤드 제거)

**권장 접근법**:

1. **GraphQL POST 요청** → `GetCatalogProductDetailPageOption`
2. **JSON 응답 파싱** (구조화된 데이터)
3. **도메인 모델 매핑** (`ZigzagProduct`)

**장점**:

- ✅ 빠른 속도 (API 직접 호출)
- ✅ 모든 필요 데이터 포함
- ✅ 구조화된 JSON (파싱 간편)
- ✅ 브라우저 오버헤드 없음
- ✅ 확장 가능 (리뷰 API 추가 가능)

**단점**:

- ⚠️ GraphQL 쿼리 구조 복잡
- ⚠️ API 스키마 변경 가능성

**참고**: 초기 분석에서 발견한 `GetPdpIntegratedData`는 리뷰 전용이며, `GetCatalogProductDetailPageOption`이 제품 정보용입니다.

---

## 🏗️ Architecture Overview

### Frontend Stack

- **Framework**: Next.js (SSR + CSR hybrid)
- **Rendering**: Server-Side Rendering with client-side hydration
- **State Management**: React context + GraphQL cache
- **Styling**: CSS-in-JS (styled-components or similar)

### Backend API

- **Type**: GraphQL
- **Endpoint**: `https://api.zigzag.kr/api/2/graphql/*`
- **Primary Query**: `GetPdpIntegratedData`
- **Protocol**: HTTPS POST with JSON payload

### CDN & Assets

- **Images**: `cf.product-image.s.zigzag.kr` (WebP format)
- **Static Assets**: `cf.res.s.zigzag.kr`, `cf.fe.s.zigzag.kr`
- **Font**: Pretendard (Korean-optimized)

---

## 📊 Data Extraction Points

### Product Information

| Field            | Location    | Extraction Method                 |
| ---------------- | ----------- | --------------------------------- |
| Product ID       | URL path    | Regex: `/products/(\d+)`          |
| Product Name     | GraphQL API | `data.product.name`               |
| Brand            | GraphQL API | `data.product.brand.name`         |
| Original Price   | GraphQL API | `data.product.price.original`     |
| Discounted Price | GraphQL API | `data.product.price.discounted`   |
| Discount Rate    | GraphQL API | `data.product.price.discountRate` |
| Stock Status     | GraphQL API | `data.product.stock.status`       |
| Images           | GraphQL API | `data.product.images[]`           |
| Description      | GraphQL API | `data.product.description`        |

### Sale Status Detection

```javascript
// Expected stock status values
{
  "IN_STOCK": "판매중",
  "OUT_OF_STOCK": "품절",
  "DISCONTINUED": "판매종료",
  "COMING_SOON": "입고예정"
}
```

---

## 🔧 Implementation Strategy

### Phase 1: API-Based Scraper (Recommended)

#### Advantages

- ✅ Fast response time (<200ms per request)
- ✅ Structured JSON data
- ✅ No HTML parsing overhead
- ✅ Easy to maintain
- ✅ Scalable

#### Implementation Steps

1. **Setup**: Create `ZigzagApiFetcher.ts` (similar to `HwahaeApiFetcher`)
2. **HTTP Client**: Use `axios` or `fetch` with proper headers
3. **GraphQL Query**: Construct proper query with product ID variable
4. **Error Handling**: Handle rate limits, network errors, invalid responses
5. **Data Mapping**: Map GraphQL response to `ZigzagProduct` domain model

#### Sample Code Structure

```typescript
// fetchers/ZigzagApiFetcher.ts
export class ZigzagApiFetcher {
  async fetchProduct(productId: string): Promise<ZigzagProduct> {
    const response = await axios.post(
      "https://api.zigzag.kr/api/2/graphql/GetPdpIntegratedData",
      {
        operationName: "GetPdpIntegratedData",
        variables: { catalogProductId: productId },
        query: GRAPHQL_QUERY,
      },
      { headers: this.buildHeaders() },
    );
    return this.mapToProduct(response.data);
  }
}
```

### Phase 2: Playwright Fallback (If Needed)

Use Playwright only if:

- API requires complex authentication
- Rate limiting is too strict
- Need to simulate real user behavior

---

## 🚧 주요 발견사항 및 과제

### ⚠️ GraphQL API 한계 (핵심 문제)

**문제**: `GetPdpIntegratedData` API는 **리뷰 데이터 중심**이며, **제품 기본 정보(이름, 가격, 재고)가 누락됨**.

**영향**:

- 제품명, 브랜드 정보 없음
- 정가, 할인가, 할인율 데이터 없음
- 재고 상태 (판매중/품절) 확인 불가

**해결 방안**:

1. **Next.js `__NEXT_DATA__` 추출** (권장)
   - Playwright로 페이지 접근
   - `<script id="__NEXT_DATA__">` 파싱
   - SSR 데이터에서 제품 정보 추출
2. **추가 GraphQL 엔드포인트 탐색**
   - DevTools에서 다른 API 요청 확인
   - 제품 기본 정보를 반환하는 쿼리 찾기
3. **DOM 직접 파싱** (최후 수단)
   - HTML에서 메타 태그, 구조화된 데이터 추출

### 2. 인증 및 쿠키

**이슈**: 비로그인 상태에서도 세션 쿠키 발급됨
**해결**:

- 기본 요청에 쿠키 불필요 확인됨
- 필요 시 Playwright로 세션 획득

### 3. Rate Limiting

**이슈**: 알려지지 않은 제한
**해결**:

- 1 req/sec로 시작
- Exponential backoff 구현
- Response 헤더 모니터링

### 4. 스키마 변경

**이슈**: GraphQL 스키마 진화 가능성
**해결**:

- API 버전 관리
- Zod 스키마 검증
- 변경사항 모니터링

---

## 🔍 플랫폼 비교

| Feature           | ZigZag                          | Musinsa               | Olive Young       |
| ----------------- | ------------------------------- | --------------------- | ----------------- |
| **API Type**      | GraphQL (2개 엔드포인트)        | Mixed (JSON-LD + DOM) | Mobile DOM        |
| **Complexity**    | Low (API 단순)                  | High                  | Medium            |
| **Speed**         | ⚡ Fast (API Direct <200ms)     | Medium (Hybrid)       | Medium (DOM)      |
| **Auth Required** | ❌ No (비로그인 가능)           | No                    | No                |
| **Best Strategy** | ✅ GraphQL API Direct           | Playwright + JSON-LD  | Playwright Mobile |
| **Data Quality**  | ✅ Complete (모든 정보 포함)    | Good                  | Good              |
| **Maintenance**   | ✅ Easy (GraphQL 스키마 안정적) | Medium                | Medium            |

---

## 📝 다음 단계

### 즉시 실행

1. ✅ GraphQL 쿼리 전체 구조 추출 완료
2. ✅ Request Headers 및 Payload 확인 완료
3. ✅ Response 스키마 검증 완료
4. ⏳ `ZigzagApiFetcher` 구현
5. ⏳ YAML 설정 파일 생성
6. ⏳ `ZigzagProduct` 도메인 모델 추가
7. ⏳ Unit 테스트 작성

### 설정 계획

```yaml
# config/platforms/zigzag.yaml
platform: zigzag
strategy: api
api:
  base_url: https://api.zigzag.kr/api/2/graphql
  operation: GetCatalogProductDetailPageOption
  method: POST
headers:
  Content-Type: application/json
  Accept: "*/*"
  Origin: https://zigzag.kr
  Referer: https://zigzag.kr/
  User-Agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
variables:
  catalog_product_id: "${productId}"
  input:
    catalog_product_id: "${productId}"
    entry_source_type: ""
```

---

## 📚 참고 문서

- **Network Analysis**: [network-analysis.md](./network-analysis.md) - 전체 네트워크 요청 분석
- **API Headers**: [api-headers.md](./api-headers.md) - GraphQL 헤더 및 리뷰 API
- **Product API**: [product-api.md](./product-api.md) - ⭐ **제품 정보 API 상세 문서**
- **Sample HTML**: [samples/product-page.html](./samples/product-page.html) - HTML 메타데이터

---

## 🔄 업데이트 이력

- **2025-11-06 초기**: 플랫폼 아키텍처 분석
  - Next.js 기반 확인
  - GraphQL 백엔드 발견
- **2025-11-06 중간**: 리뷰 API 발견
  - `GetPdpIntegratedData` 분석
  - 제품 정보 누락 확인
  - Playwright 전략으로 변경 고려
- **2025-11-06 최종**: ⭐ **제품 정보 API 발견**
  - ✅ `GetCatalogProductDetailPageOption` 확인
  - ✅ 모든 제품 정보 포함 검증
  - ✅ **최종 전략**: GraphQL API 직접 호출
  - ✅ 구현 가이드 완료

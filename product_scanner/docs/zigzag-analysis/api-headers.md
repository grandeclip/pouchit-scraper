# ZigZag API Headers & Request Structure

**날짜**: 2025-11-06
**Endpoint**: `POST https://api.zigzag.kr/api/2/graphql/GetPdpIntegratedData`
**상태**: ✅ 실제 데이터 확인 완료

---

## 🔑 Request Headers (실제 값)

### 필수 헤더 (MUST)

```http
POST /api/2/graphql/GetPdpIntegratedData HTTP/1.1
Host: api.zigzag.kr
Content-Type: application/json
Accept: */*
Origin: https://zigzag.kr
Referer: https://zigzag.kr/
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1
```

**설명**:

- **`Content-Type`**: `application/json` (GraphQL POST 요청)
- **`Origin`**: `https://zigzag.kr` (CORS 정책)
- **`Referer`**: `https://zigzag.kr/` (출처 페이지)
- **`User-Agent`**: 모바일 브라우저 UA (iPhone Safari)

---

### 선택적 헤더 (OPTIONAL)

```http
Accept-Encoding: gzip, deflate, br, zstd
Accept-Language: en-US,en;q=0.9
Cookie: connect.sid=s%3A...; ZIGZAGUUID=...; _ga=...; [기타 세션 쿠키]
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-site
Priority: u=1, i
```

**설명**:

- **`Accept-Encoding`**: 응답 압축 지원 (gzip, br)
- **`Accept-Language`**: 언어 우선순위
- **`Cookie`**: 세션 관리 쿠키 (비로그인 시에도 발급됨)
  - `connect.sid`: Express 세션 ID
  - `ZIGZAGUUID`: 사용자 고유 식별자
  - `_ga`, `_ga_*`: Google Analytics
  - `ab.storage.*`: Airbridge SDK
  - `_atrk_*`: Appier 트래킹
- **`Sec-Fetch-*`**: 브라우저 보안 헤더 (자동 생성)

---

### 제외 가능한 헤더 (IGNORE)

다음 헤더들은 **스크래핑 시 불필요**:

- `:authority`, `:method`, `:path`, `:scheme` (HTTP/2 pseudo-headers)
- `Priority`: 브라우저 우선순위 힌트
- `Content-Length`: 자동 계산됨
- 대부분의 `Cookie` (기본 동작에 영향 없음 확인됨)

---

## 📦 Request Payload (GraphQL)

### 실제 요청 구조

```json
{
  "query": "query GetPdpIntegratedData( $catalog_product_id: ID! $limit_count: Int $has_attachment: Boolean $order: UxReviewListOrderType ) { related_product_review_summary: ux_review_summary(product_id: $catalog_product_id) { all_count ratings_average all_count_external_included ratings_average_external_included attribute_list { question { label value category } most_answer { label value count ratio percent } answer_list { label value count ratio percent } } } ux_review_list( input: { product_id: $catalog_product_id has_attachment: $has_attachment order: $order pagination: { limit_count: $limit_count } } ) { item_list { id contents rating requested_user { is_abuse_reported } attachment_list { original_url thumbnail_url status } reviewer { profile { masked_email } } } } pdp_base_info(catalog_product_id: $catalog_product_id) { catalog_product { extra_notice_banner { title notice_id } } epick_list { id image_url landing_url nickname } size_recommendation { recommendation_type option_value_list { ranking name height_range { min max } weight_range { min max } size_with_category answer { percent value } purchase_percent } user_account { name body { height weight size_text } } } fitting_model_list { item_list { id name badge { label } fitting_size_list size_text_list profile_image_url } } policy_list { main_title content_list { title description } } } pdp_size_info(catalog_product_id: $catalog_product_id) { item_list { image_url value_list description } } pdp_short_form_contents(catalog_product_id: $catalog_product_id) { content_list { id title thumbnail_image_url video_url } } pdp_option_info(catalog_product_id: $catalog_product_id) { catalog_product { matching_catalog_product_info { id pdp_url browsing_type external_code shipping_fee { fee_type base_fee minimum_free_shipping_fee } } } } }",
  "variables": {
    "catalog_product_id": "157001205",
    "limit_count": 5,
    "order": "EXPERIENCE_GROUP_BEST_SCORE_DESC"
  }
}
```

### 주요 Variables

| Variable             | Type        | Required | Description              |
| -------------------- | ----------- | -------- | ------------------------ |
| `catalog_product_id` | String (ID) | ✅ 필수  | 상품 고유 ID             |
| `limit_count`        | Int         | ❌ 선택  | 리뷰 개수 제한 (기본: 5) |
| `has_attachment`     | Boolean     | ❌ 선택  | 첨부파일 필터            |
| `order`              | String      | ❌ 선택  | 리뷰 정렬 기준           |

---

## 📊 Response Structure (실제 스키마)

### 주요 데이터 구조

```json
{
  "data": {
    "related_product_review_summary": {
      "all_count": 342,
      "ratings_average": 4.9,
      "attribute_list": [...]
    },
    "ux_review_list": {
      "item_list": [...]
    },
    "pdp_base_info": {
      "catalog_product": {...},
      "policy_list": [...]
    },
    "pdp_size_info": {...},
    "pdp_short_form_contents": {...},
    "pdp_option_info": {...}
  }
}
```

### 문제점 발견 ⚠️

**GraphQL 쿼리가 리뷰 데이터에 집중**되어 있으며, **제품 기본 정보(이름, 가격, 재고)**는 **포함되지 않음**.

**필요한 추가 API 탐색**:

- 제품명, 브랜드
- 정가, 할인가, 할인율
- 재고 상태 (판매중/품절)

→ **별도 GraphQL 엔드포인트 또는 DOM 파싱 필요**

---

## 🔍 Response 필드 분석

### 1. 리뷰 요약 (`related_product_review_summary`)

```json
{
  "all_count": 342,
  "ratings_average": 4.9,
  "attribute_list": [
    {
      "question": { "label": "발랐을 때 색상은 어때요?", "category": "발색력" },
      "most_answer": { "label": "보통이에요", "percent": 93 }
    }
  ]
}
```

### 2. 리뷰 리스트 (`ux_review_list`)

```json
{
  "item_list": [
    {
      "id": "56699659",
      "contents": "리뷰 내용...",
      "rating": 5,
      "attachment_list": [...],
      "reviewer": { "profile": { "masked_email": "bi**" } }
    }
  ]
}
```

### 3. 상품 정책 (`pdp_base_info.policy_list`)

- 배송 정보
- 교환/반품 정책
- 약관 및 주의사항

---

## ⚠️ 중요 발견사항

### GraphQL API 한계

1. **제품 기본 정보 누락**: 이름, 가격, 재고 상태 없음
2. **리뷰 중심 API**: 상품 상세보다 리뷰에 최적화됨
3. **추가 API 필요**: 별도 엔드포인트 또는 DOM 파싱 필요

### 해결 방안

**옵션 1: 추가 GraphQL 엔드포인트 탐색**

- DevTools에서 다른 GraphQL 요청 확인
- 상품 기본 정보를 반환하는 쿼리 찾기

**옵션 2: DOM 파싱 (Playwright)**

- HTML에서 직접 추출
- JSON-LD 스크립트 태그 확인
- `<script id="__NEXT_DATA__">` Next.js 데이터 추출

**옵션 3: 하이브리드 접근**

- Playwright로 페이지 로드
- `__NEXT_DATA__` JSON 추출
- GraphQL은 리뷰 데이터용으로만 사용

---

## 🛠️ 권장 구현 전략

### Phase 1: Next.js Data 추출 (우선)

```typescript
// Playwright로 페이지 접근
await page.goto(url);

// __NEXT_DATA__ 추출
const nextData = await page.evaluate(() => {
  const script = document.getElementById("__NEXT_DATA__");
  return JSON.parse(script?.textContent || "{}");
});

// 상품 정보 추출
const product = nextData.props.pageProps.initialData;
```

### Phase 2: GraphQL API (보조)

리뷰 데이터가 필요한 경우만 사용.

---

## 🔄 업데이트 내역

- **2025-11-06 초기**: 템플릿 생성
- **2025-11-06 업데이트**: 실제 GraphQL 요청/응답 분석 완료
  - ✅ Request Headers 확인
  - ✅ GraphQL Query 구조 추출
  - ✅ Response 스키마 검증
  - ⚠️ **제품 기본 정보 미포함** 확인
  - 🔄 **대안 전략 필요**: DOM 파싱 또는 추가 API 탐색

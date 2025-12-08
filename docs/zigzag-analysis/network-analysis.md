# ZigZag Network Analysis

**Date**: 2025-11-06
**Target**: `https://zigzag.kr/catalog/products/157001205`
**Product**: 에뛰드 닥터 마스카라 픽서 블랙

---

## 🎯 Core API Endpoint (GraphQL)

### Primary Data Source

**Endpoint**: `POST https://api.zigzag.kr/api/2/graphql/GetPdpIntegratedData`

**Purpose**: 상품 상세 정보 통합 API (제품명, 가격, 할인율, 재고 상태 등)

**Request Type**: GraphQL POST

**Expected Response Fields**:

- Product name (상품명)
- Original price (정가)
- Discounted price (할인가)
- Discount rate (할인율)
- Sale status (판매 상태: 판매중/품절)
- Stock status (재고 상태)
- Brand information (브랜드)
- Product ID (상품 ID)
- Images (이미지 URL)
- Description (상품 설명)

---

## 🔗 Supporting API Endpoints

| API Endpoint                                   | Purpose                  |
| ---------------------------------------------- | ------------------------ |
| `GetProductReviewSellerEventBannerByProductId` | 리뷰 및 이벤트 배너 정보 |
| `GetCartItemsCount`                            | 장바구니 아이템 수       |
| `GetMaximumBenefit`                            | 최대 혜택 정보           |
| `GetUserBenefitInfo`                           | 사용자 혜택 정보         |
| `GetPdpRecommendGroup`                         | 추천 상품 그룹           |
| `GetBannerAdList`                              | 배너 광고 리스트         |
| `GetCatalogProductDetailPageOption`            | 상품 상세 옵션           |

---

## 📊 Network Request Analysis

### Static Assets

- **Framework**: Next.js (SSR + CSR hybrid)
- **CDN**: `cf.product-image.s.zigzag.kr`, `cf.res.s.zigzag.kr`, `cf.fe.s.zigzag.kr`
- **Font**: Pretendard (WOFF2)
- **Images**: WebP format (optimized)

### Third-Party Services

- **Analytics**: Google Analytics, Amplitude, Braze, Sentry
- **Tracking**: AppsFlyerWeb, Appier, Naver Analytics
- **Advertising**: Google Ads, DoubleClick, Facebook Pixel

### API Communication Pattern

1. **Initial Page Load**: HTML SSR from Next.js
2. **Hydration**: Client-side JS chunks loaded
3. **Data Fetch**: GraphQL POST requests to `api.zigzag.kr/api/2/graphql/*`
4. **Real-time Updates**: WebSocket or polling (not observed in this session)

---

## 🔍 Recommended Strategy

### API-Based Scraping (Recommended)

**Pros**:

- ✅ Structured JSON data
- ✅ 빠른 응답 속도
- ✅ HTML 파싱 불필요
- ✅ 데이터 일관성 보장

**Cons**:

- ⚠️ GraphQL 쿼리 구조 분석 필요
- ⚠️ 인증/헤더 요구 가능성
- ⚠️ Rate limiting 고려 필요

### Next Steps

1. GraphQL 요청 페이로드 분석
2. 필수 헤더 추출 (Authorization, User-Agent, Referer 등)
3. 응답 스키마 정의
4. API 기반 스크래퍼 구현

---

## 📝 Notes

- **User Agent**: Desktop 환경 사용 (모바일 UA 설정 필요 시 별도 테스트)
- **Session**: 비로그인 상태에서 접근 가능
- **CORS**: API는 동일 도메인(`api.zigzag.kr`)에서 호출
- **CSR Dependency**: JavaScript 실행 필수 (Playwright 적합)

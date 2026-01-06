# 플랫폼별 쿠폰 정보

## WebFetch 가능 플랫폼

### 무신사 (musinsa.com)

```yaml
url: https://www.musinsa.com/products/{product_id}
method: WebFetch
fields:
  - couponDiscount: boolean # 쿠폰 적용 가능 여부
  - onboarding/firstbuy: 첫구매 20% 쿠폰 배너
known_coupons:
  - 첫구매 20% (신규회원)
  - 브랜드 할인 쿠폰
  - 랜덤 쿠폰
```

### 지그재그 (zigzag.kr)

```yaml
url: https://zigzag.kr/catalog/products/{product_id}
method: WebFetch
fields:
  - coupon_available_status: "COUPON_AVAILABLE" | "NOT_AVAILABLE"
  - coupon_discount_info: 쿠폰 할인 상세
  - coupon_discount_info_list: 적용 가능 쿠폰 목록
known_coupons:
  - 장바구니 쿠폰 (Z결제)
  - 스토어 쿠폰
  - 스토어 상품 쿠폰
```

## WebSearch 기반 플랫폼 (403 차단)

### 에이블리 (a-bly.com)

```yaml
search_queries:
  - "에이블리 쿠폰 할인 2025"
  - "에이블리 첫구매 쿠폰"
  - "에이블리 뷰티 쿠폰"
known_coupons:
  - 신규가입 30% 쿠폰팩
  - 뷰티 전용 30% (최대 1만원)
  - 전상품 15%, 10%
  - 싹-쓰리 쿠폰 (쇼핑몰 전용)
```

### 올리브영 (oliveyoung.co.kr)

```yaml
search_queries:
  - "올리브영 쿠폰 할인 2025"
  - "올영세일 쿠폰팩"
known_coupons:
  - 앱 첫구매 2천원
  - 무료배송 쿠폰
  - 올영세일 쿠폰팩 (10~20%)
  - 선착순 쿠폰
```

### 컬리 (kurly.com)

```yaml
search_queries:
  - "마켓컬리 쿠폰 할인 2025"
  - "컬리멤버스 혜택"
known_coupons:
  - 신규가입 1만원 + 1.6만원
  - 컬리멤버스 무료배송 31장/월
  - VIP 전용 쿠폰
```

### 화해 (hwahae.co.kr)

```yaml
search_queries:
  - "화해 쿠폰 할인 2025"
  - "화해위크 쿠폰"
known_coupons:
  - 화해위크 쿠폰팩 (10~20%)
  - 신상월요기획전 쿠폰
  - 포인트 적립
```

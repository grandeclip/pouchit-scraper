---
name: coupon-research
description: 6개 플랫폼(무신사, 지그재그, 에이블리, 올리브영, 컬리, 화해) 쿠폰 정보 조사. 쿠폰 조사, 할인 정보 확인, 플랫폼별 쿠폰 비교, 상품 쿠폰 적용가 요청 시 사용.
---

# Coupon Research

6개 뷰티/패션 플랫폼의 비로그인 쿠폰 정보 조사.

## Triggers

- "쿠폰 조사해줘" - 전체 플랫폼 쿠폰 조사
- "무신사 쿠폰 정보" - 특정 플랫폼 쿠폰 조사
- "이 상품 쿠폰 있어?" - 상품 URL 쿠폰 확인
- "플랫폼별 쿠폰 비교" - 쿠폰 비교 분석

## Workflow

1. **플랫폼 식별** → URL 또는 요청에서 대상 플랫폼 결정
2. **접근 방법 선택** → WebFetch(무신사/지그재그) 또는 WebSearch(나머지)
3. **쿠폰 정보 수집** → 필드 추출 또는 검색
4. **결과 출력** → 통일된 형식으로 정리

## 플랫폼별 접근

| 플랫폼   | 방법      | 핵심 정보                                         |
| -------- | --------- | ------------------------------------------------- |
| 무신사   | WebFetch  | `couponDiscount`, 첫구매 20% 배너                 |
| 지그재그 | WebFetch  | `coupon_available_status`, `coupon_discount_info` |
| 에이블리 | WebSearch | 403 차단 - 검색 기반                              |
| 올리브영 | WebSearch | 403 차단 - 검색 기반                              |
| 컬리     | WebSearch | SSR/CSR - 검색 기반                               |
| 화해     | WebSearch | 동적 콘텐츠 - 검색 기반                           |

## WebFetch 수집

```bash
# 무신사 - JSON 필드 추출
WebFetch: https://www.musinsa.com/products/{id}
Prompt: "couponDiscount, 첫구매 쿠폰 배너 정보 추출"

# 지그재그 - JSON 필드 추출
WebFetch: https://zigzag.kr/catalog/products/{id}
Prompt: "coupon_available_status, coupon_discount_info 추출"
```

## WebSearch 수집

```bash
# 403 차단 플랫폼
WebSearch: "[플랫폼명] 쿠폰 할인 2025"
WebSearch: "[플랫폼명] 첫구매 쿠폰"
```

## 출력 형식

```markdown
## [플랫폼명]

**접근**: WebFetch/WebSearch | **비로그인 노출**: ✅/❌

| 유형           | 이름   | 할인 | 조건     |
| -------------- | ------ | ---- | -------- |
| first_purchase | 첫구매 | 20%  | 신규회원 |
```

## Anti-Patterns

- **로그인 쿠폰 수집 시도**: 비로그인 노출 쿠폰만 수집 가능
- **과도한 WebFetch**: 403 차단 플랫폼에 반복 요청 금지
- **오래된 정보 신뢰**: 쿠폰은 수시 변경됨, 최신 정보 확인 필요

## Extension Points

1. **플랫폼 추가**: `references/platforms.md`에 새 플랫폼 정보 추가
2. **쿠폰 유형 확장**: `references/coupon-types.md`에 새 유형 정의

## References

- [platforms.md](references/platforms.md) - 플랫폼별 상세 접근 방법
- [coupon-types.md](references/coupon-types.md) - 쿠폰 유형 분류

## Design Rationale

**WebFetch vs WebSearch 분리**: 무신사/지그재그는 JSON 데이터 직접 접근 가능, 나머지는 403 차단으로 검색 기반 조사.

**비로그인 한정**: 로그인 필요 쿠폰은 자동 수집 불가, 노출 여부만 기록.

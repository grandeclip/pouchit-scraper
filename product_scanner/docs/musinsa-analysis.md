# 무신사 상품 페이지 분석 결과

## 테스트 URL

<https://www.musinsa.com/products/4350236>

## 1. 추출 필요 데이터

- ✅ product_name: 상품명
- ✅ thumbnail: 상품 이미지
- ✅ original_price: 정가
- ✅ discounted_price: 할인가
- ✅ sale_status: 판매 상태

## 2. 데이터 추출 전략

### Option A: API 기반 (추천)

- **없음**: 메인 상품 정보를 제공하는 직접 API가 발견되지 않음
- **대안**: `/options` API에서 일부 정보 추출 가능하나 가격/이미지 누락

### Option B: DOM 기반 (선택)

HTML의 GTM (Google Tag Manager) data 속성에서 추출

#### 확인된 Selector 패턴

```html
<!-- 상품 정보는 GTM data 속성에 포함 -->
<a
  class="gtm-view-item-list gtm-select-item"
  data-item-id="4350236"
  data-price="29700"
  data-original-price="33000"
  data-item-brand="giverny"
  data-discount="3300"
  data-discount-rate="10"
></a>
```

#### 실제 DOM 구조 (확정)

1. **Product Name**:
   - ✅ Selector: `span.GoodsName-sc-1omefes-1` 또는 `.GoodsName__Wrap span`
   - 실제 값: "듀이 글래시 파운데이션 30ml"
   - HTML: `<span class="text-title_18px_med GoodsName-sc-1omefes-1 iuNgs font-pretendard">`

2. **Thumbnail**:
   - ✅ Pattern: `img[src*="goods_img"][alt="Thumbnail 0"]` (첫 번째 썸네일)
   - URL 패턴: `https://image.msscdn.net/thumbnails/images/goods_img/{date}/{product_id}/{product_id}_{timestamp}_500.jpg`
   - 실제 값: `https://image.msscdn.net/thumbnails/images/goods_img/20240820/4350236/4350236_17395189158827_500.jpg`

3. **Original Price**:
   - ✅ Selector: `span.text-body_13px_reg.line-through.text-gray-500` (가격 할인선)
   - 실제 값: "33,000원"
   - 부모: `.Price__DiscountWrap-sc-1hw5bl8-3`

4. **Discounted Price**:
   - ✅ Selector: `span.Price__CalculatedPrice-sc-1hw5bl8-10` 또는 `.Price__CurrentPrice span:last-child`
   - 실제 값: "29,700원"
   - 할인율: `.Price__DiscountRate-sc-1hw5bl8-9` (10%)

5. **Sale Status**:
   - ✅ "구매하기" 버튼 활성화 여부로 판단
   - Selector: `button:contains("구매하기"):not([disabled])`
   - HTML: `<button ... data-button-name="구매하기" ... >구매하기</button>`
   - disabled 속성 없으면 판매중

## 3. 최종 권장 전략

**Playwright DOM Scraping + 구조화된 Selector**

이유:

- API 직접 호출 불가
- 페이지 구조가 React/Next.js 기반
- GTM data 속성에 일부 정보 포함
- 동적 렌더링 필요

## 4. Selector 검증 결과

✅ **모든 필수 데이터 추출 성공** (`verify-musinsa-selectors.js`)

```json
{
  "productName": "듀이 글래시 파운데이션 30ml",
  "thumbnail": "https://image.msscdn.net/thumbnails/images/goods_img/20240820/4350236/4350236_17395189158827_500.jpg",
  "originalPrice": "33,000원",
  "discountedPrice": "29,700원",
  "saleStatus": "available"
}
```

## 5. 다음 단계

1. ✅ Playwright로 정확한 selector 찾기 - **완료**
2. ⏭️ YAML 설정 파일 작성 (oliveyoung 참고)
3. ⏭️ TypeScript 구현 (oliveyoung 구조 재사용)

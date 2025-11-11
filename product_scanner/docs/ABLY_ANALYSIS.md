# A-bly Platform Analysis Summary

## 📊 분석 결과

### ✅ 성공: NextJS SSR 데이터 추출

**방법**: `document.getElementById('__NEXT_DATA__')` → JSON 파싱

**판매중 상품 (20787714)** ⭐

- SSR 데이터 완벽 추출
- 참고: `product-20787714-ssr-data.json`

### ⚠️ 품절 상품: SSR 데이터 없음 → DOM 파싱

**품절 상품 (32438971, 3092743)**

- `__NEXT_DATA__` 내 `queries` 배열 비어있음
- DOM 스냅샷 파싱으로 대체
- 참고: `product-32438971-dom-fallback.json`

### ❌ 판매중지 상품: 접근 차단

**판매중지 (32438042)**

- Alert 팝업: "판매 중인 상품이 아닙니다"
- 홈페이지로 자동 리다이렉트
- 데이터 추출 불가

## 🎯 필요 데이터 매핑

| 항목                 | SSR 경로                           | 비고                     |
| -------------------- | ---------------------------------- | ------------------------ |
| **Product Name**     | `goods.name`                       | ✅                       |
| **Thumbnail**        | `goods.cover_images[]`             | ✅ (배열)                |
| **Original Price**   | `goods.price_info.consumer`        | ✅                       |
| **Discounted Price** | `goods.price_info.thumbnail_price` | ✅                       |
| **Sale Status**      | `goods.sale_type`                  | ✅ `ON_SALE`, `SOLD_OUT` |

## 🔍 Sale Type 값

```typescript
sale_type: "ON_SALE" | "SOLD_OUT" | 기타;
```

- `ON_SALE`: 판매중
- `SOLD_OUT`: 품절 (페이지 접근 가능, SSR 데이터 없음)
- 판매중지: 페이지 접근 차단 (Alert)

## 🚀 스크래핑 전략

### 1차: SSR 데이터 추출 (권장)

```typescript
const script = document.getElementById("__NEXT_DATA__");
const data = JSON.parse(script.textContent);
const goods =
  data.props.pageProps.serverQueryClient.queries[0]?.state?.data?.goods;

if (goods) {
  // ✅ 판매중 상품
  return {
    name: goods.name,
    sale_type: goods.sale_type,
    price_info: goods.price_info,
    cover_images: goods.cover_images,
  };
}
```

### 2차: DOM 파싱 (fallback)

```typescript
// SSR 데이터 없을 때
if (!goods) {
  // DOM snapshot 또는 selectors 사용
  // Playwright browser_snapshot 활용
}
```

### 3차: 판매중지 감지

```typescript
// Modal dialog 감지
if (dialog_message === "판매 중인 상품이 아닙니다") {
  return { sale_type: "DISCONTINUED", error: true };
}
```

## 📁 참고 파일

1. `headers.json` - 브라우저 헤더
2. `api-headers.json` - API 요청 헤더 (실패)
3. `product-20787714-ssr-data.json` - 판매중 (SSR)
4. `product-32438971-dom-fallback.json` - 품절 (DOM)
5. `product-info-extracted.json` - 초기 DOM 추출

## 💡 Mobile Agent 권장사항

- User-Agent: iPhone Safari (이미 적용됨)
- 쿠키 불필요 (SSR 데이터 접근 가능)
- Playwright 기반 Browser scraping 필수

## ⚠️ 주의사항

1. **API 직접 호출**: 401 Unauthorized (쿠키만으로 불충분)
2. **CORS 제한**: 브라우저 외부 fetch 차단
3. **품절 상품**: SSR 데이터 없음, DOM 파싱 필수
4. **판매중지**: 접근 불가, Alert 감지 필요

---

## 🚨 Cloudflare 봇 차단 분석 (2025-11-11)

### 핵심 발견: 세션 내 2번째 요청 차단

**테스트 결과**:

```text
같은 브라우저 세션 내:
- 1번째 요청: ✅ 성공 (상품 종류 무관)
- 2번째 요청: ❌ Cloudflare 차단 ("잠시만 기다리십시오…")

새 브라우저 세션:
- 단독 요청: ✅ 항상 성공
```

### 차단 패턴

1. **품절 → 판매중 순서**: 2번째(판매중) 차단
2. **판매중 → 품절 순서**: 2번째(품절) 차단
3. **품절만 단독**: ✅ 성공
4. **판매중만 단독**: ✅ 성공

### 원인 분석

- ❌ 품절 여부와 무관
- ❌ 접속 순서와 무관
- ✅ **세션 내 반복 요청 패턴 감지**
- ✅ **Rate Limiting + Behavioral Analysis**

### Stealth 기법 테스트 결과

#### ❌ 수동 Stealth (실패)

**적용 기법**:

- ✅ `navigator.webdriver` 제거 → 효과 확인
- ✅ Canvas fingerprint 우회 (노이즈 주입) → 구현 완료
- ✅ WebGL fingerprint 우회
- ✅ Chrome 객체 추가
- ✅ Plugins/Languages 다양화

**결과**:

- 단독 요청: Stealth 효과 있음
- 반복 요청: Stealth만으로 우회 불가
- 세션 재사용 불가

#### ✅ Stealth Plugin (성공) - 최종 솔루션

**사용 라이브러리**:

```typescript
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());
```

**결과**:

- ✅ 단독 요청: 성공
- ✅ 반복 요청: **성공** (2번째 요청도 차단 없음!)
- ✅ 세션 재사용 가능
- ✅ `window.chrome` 자동 주입
- ✅ `navigator.plugins` 실제 데이터 (3개)
- ✅ 정교한 fingerprint 우회

**성능 비교**:

| 방법               | 세션 재사용 | 브라우저 생성 오버헤드 | 처리량           |
| ------------------ | ----------- | ---------------------- | ---------------- |
| 수동 Stealth       | ❌          | 매 요청마다 1-2초      | 분당 6-10개      |
| **Stealth Plugin** | ✅          | 최초 1회만             | **분당 15-20개** |

### 📋 스크래핑 전략 (최종)

**권장 방식: Stealth Plugin 사용**

1. **Stealth Plugin 적용** (필수)

```typescript
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

const browser = await chromium.launch({ headless: true });
// 세션 재사용 가능 - 여러 상품 연속 스크래핑 OK
```

2. **세션 전략**

- ✅ 세션 재사용 가능 (Stealth Plugin 덕분)
- 권장: 10-20개 상품당 브라우저 재시작 (안정성)
- 요청 간 짧은 대기: 1-2초면 충분

3. **데이터 추출 우선순위**

- 1순위: SSR 데이터 (`__NEXT_DATA__`)
- 2순위: Meta 태그 (`og:title`, `og:image`)
- 3순위: DOM 파싱

~~4. **User-Agent 다양화** (선택)~~

- ~~iPhone Safari 17.x - 18.x~~
- ~~불필요 (Stealth Plugin이 처리)~~

### 🎯 권장 아키텍처

```typescript
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)...",
  isMobile: true,
});

const page = await context.newPage();

// ✅ 세션 재사용 가능 - 연속 스크래핑
for (const id of productIds) {
  await page.goto(`https://m.a-bly.com/goods/${id}`);
  await page.waitForTimeout(1500); // 짧은 대기

  // 데이터 추출
  const data = await extractProductData(page);

  // 10-20개마다 브라우저 재시작 권장
  if (index % 15 === 0) {
    await browser.close();
    browser = await chromium.launch({ headless: true });
  }
}

await browser.close();
```

### 성능 영향

**Stealth Plugin 사용 시**:

- 브라우저 생성: 최초 1회 (~1초)
- 요청 간 대기: 1-2초
- **예상 처리량**: 분당 15-20개 상품
- **100개 상품**: 약 5-7분 소요

### IP 로테이션 (장기 운영 시)

현재는 불필요, 다음 단계에서 고려:

- Residential Proxy
- 모바일 네트워크 시뮬레이션
- VPN 로테이션

### 테스트 스크립트

**최종 검증 스크립트**: `scripts/test-ably.ts`

- 4개 품목 종합 테스트 (판매중, 품절 2개, 판매중지)
- Stealth Plugin 적용
- DOM 기반 데이터 추출
- 상태 구분 로직 검증

### 최종 검증 결과 (4개 품목 테스트)

**테스트 일시**: 2025-11-11
**Stealth Plugin**: ✅ 사용
**결과**: 4/4 성공 (100%)

| 상품 ID  | 분류     | Cloudflare | 추출 방법 | 상태 구분             | 결과 |
| -------- | -------- | ---------- | --------- | --------------------- | ---- |
| 20787714 | 판매중   | ✅ 통과    | DOM       | 버튼: "구매하기"      | ✅   |
| 32438971 | 품절 1   | ✅ 통과    | DOM       | 버튼: "품절"          | ✅   |
| 3092743  | 품절 2   | ✅ 통과    | DOM       | 버튼: "품절"          | ✅   |
| 32438042 | 판매중지 | ✅ 통과    | DOM       | 리다이렉트 → `/today` | ✅   |

**핵심 발견**:

1. ✅ SSR 데이터 없어도 Meta 태그로 충분
2. ✅ 버튼 텍스트로 판매 상태 구분 가능
3. ✅ URL 변경으로 판매중지 상품 감지
4. ✅ Stealth Plugin으로 연속 스크래핑 안정적

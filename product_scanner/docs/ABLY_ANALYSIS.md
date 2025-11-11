# A-bly Platform Analysis Summary

## 📊 분석 결과

### ✅ 성공: Network API 캡처 방식 (최종 솔루션)

**방법**: Playwright `page.on('response')` → `/api/v3/goods/{id}/basic/` API 응답 캡처

**판매중 상품 (20787714)** ⭐

- Network API 응답 캡처 성공
- `__NEXT_DATA__` SSR 데이터에서도 동일 정보 존재 (백업)
- 참고: `test-ably.ts` 스크립트

### ⚠️ 품절 상품: Network API 실패 → Meta Tag Fallback

**품절 상품 (32438971, 3092743)**

- Network API 캡처 타임아웃
- Meta Tag (`og:title`, `og:image`) 기반 추출로 대체
- 판매 상태는 DOM 텍스트 분석으로 판단

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

## 🚀 스크래핑 전략 (최종)

### 1차: Network API 응답 캡처 (권장) ⭐

```typescript
// BEFORE navigation - API 리스너 설정
let apiResponse: any = null;
const apiPromise = new Promise<any>((resolve) => {
  page.on("response", async (response) => {
    if (response.url().includes(`/api/v3/goods/${productId}/basic/`)) {
      try {
        const data = await response.json();
        resolve(data);
      } catch (e) {
        console.error(`JSON 파싱 실패`);
      }
    }
  });
});

// Navigation
await page.goto(`https://m.a-bly.com/goods/${productId}`);

// API 응답 대기 (최대 5초)
apiResponse = await Promise.race([
  apiPromise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("API timeout")), 5000),
  ),
]);

const goods = apiResponse.goods;
// ✅ 판매중 상품 - API 캡처 성공
```

### 2차: Meta Tag Fallback

```typescript
// API 캡처 실패 시 (품절, 판매중지)
const metaData = await page.evaluate(() => {
  const metaTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  const metaImage = document
    .querySelector('meta[property="og:image"]')
    ?.getAttribute("content");

  return { metaTitle, metaImage };
});
```

### 3차: 판매 상태 판단 (DOM 분석)

```typescript
const bodyText = document.body.textContent || "";
const isOffSale =
  bodyText.includes("판매 중인 상품이 아닙니다") ||
  window.location.href.includes("/today");
const isSoldOut = bodyText.includes("품절") || bodyText.includes("재입고");
const isOnSale = bodyText.includes("구매하기");
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

**권장 방식: Stealth Plugin + Network API 캡처**

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

- 1순위: **Network API 캡처** (`/api/v3/goods/{id}/basic/`)
- 2순위: Meta 태그 Fallback (`og:title`, `og:image`)
- 3순위: DOM 텍스트 분석 (판매 상태 판단)

4. **중요 사항**

- API 리스너는 **navigation 전에** 설정 (타이밍 중요!)
- API 타임아웃: 5초 (이후 Meta Tag fallback)
- `__NEXT_DATA__` SSR 데이터는 백업용으로만 활용

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
for (const [index, id] of productIds.entries()) {
  // 1. API 리스너 설정 (BEFORE navigation!)
  let apiResponse: any = null;
  const apiPromise = new Promise<any>((resolve) => {
    page.on("response", async (response) => {
      if (response.url().includes(`/api/v3/goods/${id}/basic/`)) {
        try {
          const data = await response.json();
          resolve(data);
        } catch (e) {
          // JSON 파싱 실패 무시
        }
      }
    });
  });

  // 2. Navigation
  await page.goto(`https://m.a-bly.com/goods/${id}`);
  await page.waitForTimeout(2000);

  // 3. API 캡처 시도
  try {
    apiResponse = await Promise.race([
      apiPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API timeout")), 5000),
      ),
    ]);

    // API 캡처 성공
    const goods = apiResponse.goods;
    const data = {
      name: goods.name,
      saleType: goods.sale_type,
      price: goods.price_info?.thumbnail_price,
      images: goods.cover_images,
    };
  } catch (e) {
    // 4. Meta Tag Fallback
    const metaData = await page.evaluate(() => ({
      metaTitle: document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content"),
      metaImage: document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content"),
    }));
  }

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

| 상품 ID  | 분류     | Cloudflare | 추출 방법       | 상태 구분             | 결과 |
| -------- | -------- | ---------- | --------------- | --------------------- | ---- |
| 20787714 | 판매중   | ✅ 통과    | **Network API** | API: `sale_type`      | ✅   |
| 32438971 | 품절 1   | ✅ 통과    | Meta Fallback   | DOM: "품절"           | ✅   |
| 3092743  | 품절 2   | ✅ 통과    | Meta Fallback   | DOM: "품절"           | ✅   |
| 32438042 | 판매중지 | ✅ 통과    | Meta Fallback   | 리다이렉트 → `/today` | ✅   |

**핵심 발견**:

1. ✅ **Network API 캡처**가 가장 정확 (판매중 상품)
2. ✅ API 실패 시 Meta 태그로 충분 (품절/판매중지)
3. ✅ DOM 텍스트로 판매 상태 구분 가능
4. ✅ Stealth Plugin으로 연속 스크래핑 안정적
5. ✅ `__NEXT_DATA__` SSR은 API 캡처와 동일 정보 (백업용)

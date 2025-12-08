# 올리브영 스크래핑 실패 원인 분석

**분석 일시**: 2025-11-18
**분석 대상**: Job ID `019a957a-c4a5-73e9-a226-3e8e710cc465`
**총 건수**: 20건 (성공 14, 실패 4, not_found 2)

---

## 📊 실패 케이스 개요

### 실패 유형

| 상태                          | 건수 | Product Set IDs                        |
| ----------------------------- | ---- | -------------------------------------- |
| `not_found`                   | 2    | 930c094a, 94d2d826                     |
| `failed` (thumbnail required) | 4    | d2096a7a, 37e67e40, 80b0410c, 4e40b998 |

### 핵심 증거

- **스크린샷**: 20개 모두 페이지 정상 로딩 확인 (`results/2025-11-18/oliveyoung/019a957a-c4a5-73e9-a226-3e8e710cc465/`)
- **URL**: 모두 유효한 올리브영 상품 URL
- **Concurrency**: 4로 설정됨 (리소스 문제 없음)

**결론**: Concurrency 문제가 아닌 **데이터 추출 로직 문제**

---

## 🔍 원인 분석

### 1단계: 스크린샷 검증

#### not_found 케이스 (930c094a)

- **URL**: `https://www.oliveyoung.co.kr/store/G.do?goodsNo=A000000209146`
- **스크린샷**: ✅ 모바일 뷰 정상 렌더링
- **레이아웃**: 하단 버튼 그룹 (`바로구매`, `장바구니`), 모바일 상품 정보 레이아웃
- **문제**: `fetch: null`, `error: "Product not found in Oliveyoung"`

#### failed 케이스 (d2096a7a, 37e67e40, 80b0410c, 4e40b998)

- **URL 예시**: `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000188334`
- **스크린샷**: ❌ **Desktop 뷰로 렌더링**
- **레이아웃**: 상단 헤더 "OLIVE YOUNG" 텍스트, 좌측 상품 썸네일 목록, Desktop 레이아웃
- **문제**: `fetch: null`, `error: "thumbnail is required"`

### 2단계: 렌더링 차이 발견

#### 예상 동작

```yaml
# oliveyoung.yaml:56
navigationSteps:
  - action: "navigate"
    url: "https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=${goodsId}"
```

- 입력 URL (Desktop) → `goodsNo` 추출 → 모바일 URL 생성 → **모바일 페이지 렌더링**

#### 실제 동작

**성공 케이스**: Desktop URL → 모바일 뷰 정상 렌더링 ✅
**실패 케이스**: Desktop URL → **Desktop 뷰로 렌더링** ❌

### 3단계: 코드 추적

#### goodsId 추출 로직

```typescript
// OliveyoungValidationNode.ts:52-64
protected extractProductId(linkUrl: string): string | null {
  if (!linkUrl.includes("oliveyoung.co.kr")) {
    return null;
  }

  try {
    const url = new URL(linkUrl);
    return url.searchParams.get("goodsNo");  // Query Parameter에서 추출
  } catch {
    return null;
  }
}
```

**실패 케이스 URL 분석**:

| URL                                                   | goodsNo 추출       | 생성된 모바일 URL                                                    | 렌더링 결과    |
| ----------------------------------------------------- | ------------------ | -------------------------------------------------------------------- | -------------- |
| `store/G.do?goodsNo=A000000209146`                    | `A000000209146` ✅ | `m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000209146` | Mobile ✅      |
| `store/goods/getGoodsDetail.do?goodsNo=A000000188334` | `A000000188334` ✅ | `m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000188334` | **Desktop** ❌ |

**결론**: goodsId 추출은 정상 동작함

#### 모바일 URL 생성 로직

```typescript
// PlaywrightScriptExecutor.ts:152-154
const targetUrl = url
  .replace("${goodsId}", productId)
  .replace("${productId}", productId);
```

**결론**: URL 생성도 정상 동작함

---

## ⚠️ 핵심 문제

### 문제 1: 모바일 설정 무시

일부 상품에서 모바일 URL로 접속했음에도 **Desktop 페이지로 렌더링**됨

**가능한 원인**:

1. **User-Agent 무시**: 올리브영 서버가 User-Agent를 제대로 인식하지 못함
2. **Viewport 무시**: 모바일 viewport 설정이 적용되지 않음
3. **Cookie/Session**: Desktop 세션이 유지됨
4. **서버 리다이렉트**: 특정 상품에서 Desktop 페이지로 강제 리다이렉트

### 문제 2: DOM 추출 로직 한계

현재 YAML 설정 (Line 169-206):

```javascript
const getDisplayedThumbnail = () => {
  // 1순위: Swiper 활성 슬라이드
  const activeSlide = document.querySelector(".swiper-slide-active");
  const activeImg = activeSlide?.querySelector("img");
  // ...
};
```

**문제점**:

- **Mobile 전용 Selector**: `.swiper-slide-active`, `.swiper-slide`
- **Desktop DOM 구조는 다름**: Desktop 페이지에는 swiper 구조가 없음
- **결과**: Desktop 페이지에서 thumbnail 추출 실패 → `null` 반환

### 문제 3: 에러 처리 불일치

```json
// not_found 케이스
{
  "fetch": null,
  "error": "Product not found in Oliveyoung",
  "status": "not_found"
}

// failed 케이스
{
  "fetch": null,
  "error": "thumbnail is required",
  "status": "failed"
}
```

**실제로는 동일한 문제** (DOM 추출 실패) → 다른 에러 메시지

---

## 📋 검증 필요 사항

### 1. Viewport/User-Agent 적용 확인

**현재 설정** (`oliveyoung.yaml:42-50`):

```yaml
contextOptions:
  viewport:
    width: 430
    height: 932
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ..."
  isMobile: true
  hasTouch: true
  deviceScaleFactor: 3
```

**검증 방법**:

1. Network Request Header 확인 (User-Agent, Viewport)
2. `page.evaluate(() => navigator.userAgent)` 로그 출력
3. `page.viewportSize()` 확인

### 2. Desktop DOM 구조 파악

**Desktop 페이지 스크린샷 분석**:

- 상단: "OLIVE YOUNG" 헤더
- 좌측: 상품 썸네일 목록 (작은 이미지들)
- 중앙: 메인 상품 이미지
- 우측: 상품 정보 (가격, 구매 버튼)

**예상 Selector**:

```javascript
// Desktop 메인 이미지 (추정)
const desktopImg = document.querySelector(".prd_img img");
// 또는
const detailImg = document.querySelector(".detail_img img");
// 또는
const mainImg = document.querySelector(".goods_img img");
```

**검증 필요**: 실제 Desktop 페이지 DOM 구조 확인

### 3. not_found vs failed 차이

**not_found 케이스 (930c094a)**:

- 모바일 뷰 정상 렌더링
- DOM 추출 실패 (왜?)

**가능한 원인**:

- DOM 로드 타이밍 문제
- 특정 상품의 DOM 구조가 다름
- JavaScript 에러 발생

**검증 필요**:

- `page.evaluate()` 실행 시 에러 로그 확인
- 해당 상품의 DOM 구조 직접 확인

---

## 🔬 추가 분석: URL 패턴과 실패 상관관계

### URL 패턴 통계

**전체 20건**:

- `G.do` 패턴: 10건
- `getGoodsDetail.do` 패턴: 10건

**실패 케이스 분석**:

| 상태      | G.do | getGoodsDetail.do | 합계 |
| --------- | ---- | ----------------- | ---- |
| Failed    | 2건  | 2건               | 4건  |
| Not Found | 1건  | 1건               | 2건  |
| Success   | 7건  | 7건               | 14건 |

**결론**: URL 패턴(`G.do` vs `getGoodsDetail.do`)과 실패 여부는 **상관관계가 없음**

### 핵심 가설

**가설 1**: 모바일 URL로 변환 후 접속했지만, 올리브영 서버가 일부 케이스에서 Desktop 페이지를 반환

**증거**:

- 스크린샷 d2096a7a, 37e67e40, 80b0410c, 4e40b998 → Desktop 레이아웃
- 동일한 goodsNo 추출 로직, 동일한 모바일 URL 생성
- User-Agent/Viewport 설정은 동일하게 적용

**가능한 원인**:

1. **첫 방문 시 Cookie/Session 없음** → Desktop으로 fallback
2. **특정 상품의 서버 설정** → 모바일 버전 미지원
3. **User-Agent 헤더 무시** → Stealth plugin 또는 기타 이슈
4. **리다이렉트 체인** → 중간에 Desktop으로 전환

**가설 2**: Desktop 렌더링 감지 후 **새로고침하면 모바일로 전환 가능**

**근거**:

- 새로고침 시 Cookie/Session 유지 → 모바일 선호도 학습
- User-Agent 헤더 재전송 → 서버 인식 재시도
- 일시적 서버 오류 해결 가능

---

## 💡 해결 방안

### 방안 1: Hybrid DOM 추출 로직 (권장)

Mobile + Desktop 모두 지원하는 추출 로직 작성:

```javascript
const getDisplayedThumbnail = () => {
  // 1순위: Mobile Swiper
  const activeSlide = document.querySelector(".swiper-slide-active");
  if (activeSlide) {
    const img = activeSlide.querySelector("img");
    if (img && img.currentSrc) return img.currentSrc;
  }

  // 2순위: Desktop 메인 이미지
  const desktopImg = document.querySelector(
    ".prd_img img, .detail_img img, .goods_img img",
  );
  if (desktopImg && desktopImg.src) return desktopImg.src;

  // 3순위: 모든 이미지 중 가장 큰 이미지
  const allImages = document.querySelectorAll("img");
  let largestImg = null;
  let maxSize = 0;

  allImages.forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      const size = img.naturalWidth * img.naturalHeight;
      if (size > maxSize) {
        maxSize = size;
        largestImg = img;
      }
    }
  });

  return largestImg?.src || "";
};
```

### 방안 2: Desktop 페이지 감지 및 새로고침 (권장)

**핵심 아이디어**: Desktop으로 렌더링되었는지 감지 → 새로고침으로 모바일 렌더링 강제

#### 2-1. 페이지 타입 감지 로직

```yaml
# Step 추가: Desktop 페이지 감지
- action: "evaluate"
  script: |
    async () => {
      // Desktop 페이지 감지
      const isDesktopPage = !window.location.pathname.includes('/m/goods/');
      const hasDesktopLayout = document.querySelector('.prd_detail_top, #Contents, .prd_detail');
      const hasMobileLayout = document.querySelector('.swiper-slide, .info-group__title');

      return {
        pathname: window.location.pathname,
        isDesktopUrl: isDesktopPage,
        hasDesktopLayout: !!hasDesktopLayout,
        hasMobileLayout: !!hasMobileLayout,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    }
  description: "페이지 타입 및 렌더링 상태 확인"
```

#### 2-2. Desktop 감지 시 새로고침

```typescript
// PlaywrightScriptExecutor.ts 또는 Navigation Step에 추가
const pageInfo = await page.evaluate(() => {
  const isDesktopLayout = !!document.querySelector(
    ".prd_detail_top, #Contents",
  );
  const isMobileLayout = !!document.querySelector(".swiper-slide");
  return { isDesktopLayout, isMobileLayout };
});

if (pageInfo.isDesktopLayout && !pageInfo.isMobileLayout) {
  logger.warn({ productId }, "Desktop 페이지 감지 → 새로고침 시도");

  // 새로고침 (User-Agent 재전송)
  await page.reload({ waitUntil: "domcontentloaded" });

  // 재확인
  const reloadedInfo = await page.evaluate(() => ({
    isDesktopLayout: !!document.querySelector(".prd_detail_top"),
    isMobileLayout: !!document.querySelector(".swiper-slide"),
  }));

  if (reloadedInfo.isDesktopLayout) {
    logger.error({ productId }, "새로고침 후에도 Desktop 렌더링 유지");
  }
}
```

#### 2-3. User-Agent 재확인 스크립트

```yaml
- action: "evaluate"
  script: |
    () => {
      const ua = navigator.userAgent;
      const isMobileUA = /Mobile|iPhone|Android/i.test(ua);

      console.log('User-Agent:', ua);
      console.log('Viewport:', window.innerWidth, 'x', window.innerHeight);
      console.log('Is Mobile UA:', isMobileUA);
      console.log('URL:', window.location.href);

      // Desktop UA면 경고
      if (!isMobileUA) {
        console.warn('⚠️ Desktop User-Agent 감지!');
      }

      // Desktop 레이아웃이면 경고
      const hasDesktopLayout = !!document.querySelector('.prd_detail_top, #Contents');
      if (hasDesktopLayout) {
        console.warn('⚠️ Desktop Layout 감지!');
      }
    }
  description: "User-Agent 및 레이아웃 검증"
```

### 방안 3: Context Options 재검증

**현재 설정 점검**:

```yaml
# oliveyoung.yaml:42-50 재확인
contextOptions:
  viewport: { width: 430, height: 932 }
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ..."
  isMobile: true
  hasTouch: true
  deviceScaleFactor: 3
```

**Playwright Stealth Plugin 확인**:

```typescript
// BrowserScanner.ts 확인 필요
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin()); // Stealth plugin이 UA를 덮어쓰는지 확인
```

**Request Interception으로 강제 설정** (최후 수단):

```typescript
await page.route("**/*", (route) => {
  const headers = {
    ...route.request().headers(),
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) ...",
  };
  route.continue({ headers });
});
```

---

## 🎯 다음 단계

1. **즉시 검증**:
   - [ ] Desktop DOM 구조 확인 (실패 케이스 URL 직접 접속)
   - [ ] User-Agent/Viewport 적용 여부 확인
   - [ ] not_found 케이스 DOM 구조 확인

2. **코드 수정**:
   - [ ] Hybrid DOM 추출 로직 구현 (Mobile + Desktop)
   - [ ] 디버깅 로그 추가 (User-Agent, Viewport, DOM 구조)
   - [ ] 에러 처리 개선 (구체적 에러 메시지)

3. **테스트**:
   - [ ] 실패 케이스 6건 재실행
   - [ ] Desktop 페이지 렌더링 케이스 별도 테스트
   - [ ] 전체 20건 재검증

---

## 📌 요약

### 문제

- **concurrency 문제 아님** (스크린샷으로 증명)
- **Desktop 페이지 렌더링** → Mobile 전용 Selector 실패
- **DOM 추출 로직 한계** → Desktop 구조 미지원

### 원인

1. 모바일 설정 무시 (일부 상품)
2. Desktop DOM 구조 미지원
3. not_found 케이스의 추가 원인 불명

### 해결

1. **Hybrid DOM 추출 로직** (Mobile + Desktop)
2. **모바일 렌더링 강제** (User-Agent 재확인)
3. **디버깅 로그 추가** (원인 규명)

# 화해 Playwright 전략 AWS WAF 차단 이슈

## 문제 요약

화해(hwahae.co.kr) 웹사이트는 **AWS WAF (Web Application Firewall)**를 사용하여 헤드리스 브라우저 요청을 차단합니다. 이로 인해 Docker 환경에서 Playwright 전략이 작동하지 않습니다.

## 테스트 결과

### ✅ API 전략 (Priority 1) - 정상 작동

모든 상품 상태에 대해 완벽하게 작동:

```bash
# 판매중 (61560)
curl -X POST "http://localhost:3989/api/scan/61560"
# Result: sale_status: "on_sale" ✅

# 품절 (65725)
curl -X POST "http://localhost:3989/api/scan/65725"
# Result: sale_status: "sold_out" ✅

# 판매중지 (64235)
curl -X POST "http://localhost:3989/api/scan/64235"
# Result: sale_status: "off_sale" ✅
```

### ❌ Playwright 전략 (Priority 2) - AWS WAF 차단

**차단 증거**:

```bash
# Docker 컨테이너 내부 테스트
curl -X POST "http://localhost:3989/api/scan/61560?strategyId=browser"
# Error: productName is required

# 로그 확인
docker logs product_scanner_dev
# [browser] Page title: ERROR: The request could not be satisfied
# [browser] Extracted data: {"name":"","title_images":[],"consumer_price":0,"price":0,"sale_status":"STSEL","_source":"dom"}
```

**페이지 제목**: `"ERROR: The request could not be satisfied"` → AWS WAF 차단 페이지

**추출된 데이터**: 모든 필드가 비어있음 → 실제 콘텐츠가 로드되지 않음

## 원인 분석

### AWS WAF 탐지 메커니즘

AWS WAF는 다음과 같은 특징을 통해 헤드리스 브라우저를 탐지합니다:

1. **WebDriver 속성 감지**: `navigator.webdriver === true`
2. **브라우저 핑거프린팅**: 헤드리스 모드 특유의 패턴
3. **행동 패턴 분석**: 자동화된 요청 패턴
4. **TLS 핑거프린팅**: 브라우저별 TLS handshake 차이
5. **JavaScript 실행 환경**: 헤드리스 환경 특유의 API 차이

### 환경별 차이

| 환경                                  | 결과    | 이유                                   |
| ------------------------------------- | ------- | -------------------------------------- |
| **Playwright MCP (로컬, 인터랙티브)** | ✅ 작동 | 실제 브라우저 창이 열림, WAF 탐지 회피 |
| **Docker 헤드리스 브라우저**          | ❌ 차단 | 헤드리스 특징 노출, WAF 탐지됨         |
| **API 요청**                          | ✅ 작동 | 일반 HTTP 요청, WAF 통과               |

## 시도한 해결 방법 (모두 실패)

### 1. playwright-extra + stealth 플러그인 ✅ 적용됨 (효과 없음)

```typescript
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(StealthPlugin());
```

**결과**: AWS WAF는 여전히 탐지

### 2. Anti-Detection 스크립트 추가 ✅ 적용됨 (효과 없음)

```typescript
// webdriver 속성 제거
await this.context.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", {
    get: () => false,
  });
});

// 브라우저 args 추가
args: ["--disable-blink-features=AutomationControlled"];
```

**결과**: AWS WAF는 여전히 탐지

### 3. 실제 브라우저 User-Agent 사용 ✅ 적용됨 (효과 없음)

```typescript
userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
locale: "ko-KR";
timezoneId: "Asia/Seoul";
```

**결과**: AWS WAF는 여전히 탐지

### 4. 네트워크 대기 전략 변경 ✅ 적용됨 (효과 없음)

```typescript
// domcontentloaded → networkidle
await this.page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

// 추가 대기 시간
- action: "wait"
  timeout: 5000
```

**결과**: 페이지 로딩 개선되었으나 여전히 WAF 차단

### 5. 사람처럼 움직이는 네비게이션 ✅ 구현됨 (효과 없음)

```yaml
navigationSteps:
  # Step 1: 메인 페이지 먼저 방문 (헤더 정보 수집)
  - action: "navigate"
    url: "https://www.hwahae.co.kr"

  - action: "wait"
    timeout: 2000

  # Step 2: 상품 페이지로 이동
  - action: "navigate"
    url: "https://www.hwahae.co.kr/goods/${goodsId}"
```

**결과**: 메인 페이지도 차단됨

## 해결 방안

### ✅ 권장: API 전략 사용 (현재 구현)

**장점**:

- ✅ 빠르고 안정적 (166-244ms 응답 시간)
- ✅ AWS WAF 통과 (브라우저 헤더 사용)
- ✅ 모든 상품 상태 정확히 감지
- ✅ 리소스 효율적

**현재 구현 상태**:

- Strategy Pattern으로 API가 Priority 1로 설정되어 자동으로 사용됨
- 브라우저 헤더 강화 (2025-10-29): User-Agent, Accept-Language, Referer, Origin 추가
- Rate Limiting 방지 (2025-10-29): requestDelay 설정으로 요청 간격 제어
- 실제 브라우저 요청과 동일한 형태로 탐지 회피

**API 전략의 추가 장점**:

API 직접 호출 방식은 다음과 같은 이점이 있습니다:

1. **Rate Limiting 이슈 해결**: 일부 사용자가 경험한 "24시간 후 차단" 문제는 AWS WAF의 Rate Limiting으로 판단됩니다. 브라우저 헤더를 사용한 HTTP 요청은 이 문제를 우회합니다.

2. **인증 토큰 불필요**: 화해 API는 공개 엔드포인트로, 별도의 사용자 인증 토큰이 필요하지 않습니다.

3. **안정적인 장기 운영**: `requestDelay` 설정 (기본 500ms)으로 정상 사용자 패턴을 모방하여 장기간 안정적으로 운영 가능합니다.

**Rate Limiting 방지 설정**:

```yaml
http:
  requestDelay: 500 # 각 요청 사이 500ms 대기 (AWS WAF 우회)
```

- **효과**: 정상 브라우저 사용자의 요청 패턴과 유사하게 동작
- **성능 영향**: 요청당 +500ms (170ms → 670ms)
- **Trade-off**: 속도 < 안정성 (차단 방지가 우선)

### 🔄 대안 1: Residential Proxy 사용 (미구현)

**방법**:

```typescript
this.context = await this.browser.newContext({
  proxy: {
    server: "http://proxy-provider.com:8000",
    username: "user",
    password: "pass",
  },
});
```

**장단점**:

- ✅ AWS WAF 우회 가능
- ❌ 추가 비용 발생 (월 $50-200)
- ❌ 속도 저하
- ❌ 프록시 관리 복잡도 증가

### 🔄 대안 2: Non-Headless 모드 (프로덕션 부적합)

**방법**:

```yaml
playwright:
  headless: false # 실제 브라우저 창 열기
```

**장단점**:

- ✅ AWS WAF 우회 가능
- ❌ 서버 환경에서 실행 불가 (GUI 필요)
- ❌ 리소스 사용량 증가
- ❌ 자동화 환경 부적합

### 🔄 대안 3: Browser as a Service (미구현)

**서비스 예시**:

- [Browserless](https://www.browserless.io/)
- [Apify](https://apify.com/)
- [ScrapingBee](https://www.scrapingbee.com/)

**장단점**:

- ✅ AWS WAF 우회 가능
- ✅ 관리 부담 감소
- ❌ 추가 비용 발생 (월 $100-500)
- ❌ 외부 서비스 의존성

## 결론 및 권장사항

### 현재 상태: ✅ Production Ready

**이유**:

1. **API 전략이 완벽하게 작동**: 모든 상품 상태를 정확히 감지
2. **Strategy Pattern 적용**: API 우선 사용, Playwright는 fallback
3. **Rate Limiting 이슈 해결**: 브라우저 헤더 + requestDelay로 장기 운영 안정성 확보
4. **비용 효율적**: 추가 인프라 불필요

### Playwright 전략 상태: 🔒 Inactive (주석 처리)

**사유**:

- AWS WAF 차단으로 Docker 환경에서 작동 불가
- 추가 투자 없이 해결 불가능
- API 전략으로 모든 요구사항 충족

**재활성화 조건**:

- 화해 측 WAF 정책 변경
- Residential proxy 도입 결정
- Browser as a Service 도입 결정

## 관련 파일

- **설정 파일**: `src/config/platforms/hwahae.yaml`
- **스캐너 구현**: `src/scanners/PlaywrightScanner.ts`
- **이 문서**: `docs/hwahae-playwright-issue.md`

## 테스트 로그

### API 전략 성공 로그 (requestDelay 적용 후)

```bash
$ curl -X POST "http://localhost:3989/api/scan/61560"
{
  "goodsId": "61560",
  "productName": "블랙 쿠션 파운데이션 본품 15g+리필 15g [21N1 바닐라]",
  "thumbnail": "https://img.hwahae.co.kr/commerce/goods/20240401_101447_1_21n1.jpg",
  "originalPrice": 74000,
  "discountedPrice": 66600,
  "saleStatus": "on_sale",
  "discountRate": 10
}

# Docker logs (requestDelay 적용 확인)
[api] 스캔 완료: 블랙 쿠션 파운데이션 본품 15g+리필 15g [21N1 바닐라] (672ms)
# 672ms = 500ms (requestDelay) + 172ms (API 응답)
```

**성능 비교**:

| 설정               | 응답 시간 | 안정성              |
| ------------------ | --------- | ------------------- |
| requestDelay 없음  | ~170ms    | ⚠️ Rate Limit 위험  |
| requestDelay 500ms | ~670ms    | ✅ 안정적 장기 운영 |

### Playwright 전략 실패 로그

```bash
$ curl -X POST "http://localhost:3989/api/scan/61560?strategyId=browser"
{"error":"productName is required"}

# Docker logs
[browser] Navigate to: https://www.hwahae.co.kr
[browser] Wait for: 2000ms
[browser] Navigate to: https://www.hwahae.co.kr/goods/61560
[browser] Wait for: 5000ms
[browser] Extracting via evaluate...
[browser] Page title: ERROR: The request could not be satisfied
[browser] Extracted data: {"name":"","title_images":[],"consumer_price":0,"price":0,"sale_status":"STSEL","_source":"dom"}
[browser] 스캔 실패: Error: productName is required
```

---

**Last Updated**: 2025-10-29
**Status**: Production Ready with Rate Limiting Protection
**Next Action**: Monitor API performance and adjust requestDelay if needed

## 변경 이력

- **2025-10-29**: 브라우저 헤더 강화 (User-Agent, Accept-Language, Referer, Origin)
- **2025-10-29**: Rate Limiting 방지 기능 추가 (requestDelay 설정)
- **2025-10-29**: API 전략 안정성 향상 - 장기 운영 가능

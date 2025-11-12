# Kurly 스캐너 구현 문서

## 📋 개요

- **플랫폼**: 마켓컬리 (Kurly)
- **전략**: Next.js `__NEXT_DATA__` SSR 파싱
- **브라우저**: Playwright (Mobile + Stealth)
- **구현일**: 2025-11-12

## 🏗️ 아키텍처

### 파일 구조

```text
product_scanner/
├── src/
│   ├── config/platforms/
│   │   └── kurly.yaml                    # YAML 설정
│   ├── core/domain/
│   │   ├── KurlyConfig.ts                # 설정 타입
│   │   └── KurlyProduct.ts               # 도메인 모델
│   ├── scanners/platforms/kurly/
│   │   └── KurlyScannerFactory.ts        # Factory 패턴
│   └── strategies/
│       └── KurlyValidationNode.ts        # Validation Node
├── workflows/
│   └── kurly-validation-v1.json          # Workflow 정의
└── scripts/
    ├── test-kurly-strategy.ts            # 전략 테스트
    └── test-kurly-workflow.sh            # Workflow 테스트
```

## 🎯 전략 설명

### **NEXT_DATA** 파싱 방식

컬리는 Next.js SSR을 사용하여 모든 제품 데이터를 `<script id="__NEXT_DATA__">` 태그에 JSON으로 포함합니다.

```javascript
const nextDataScript = document.querySelector("#__NEXT_DATA__");
const nextData = JSON.parse(nextDataScript.textContent);
const product = nextData?.props?.pageProps?.product;
```

### 상태 판단 로직

```javascript
const detectStatus = () => {
  if (product.isSoldOut === null || product.isSoldOut === undefined) {
    return "INFO_CHANGED"; // 상품정보변경
  }
  if (product.isSoldOut === true) {
    return "SOLD_OUT"; // 품절/재고없음
  }
  return "ON_SALE"; // 판매중
};
```

### 상태 매핑

| 컬리 내부 상태 | CSV 상태   | 설명          |
| -------------- | ---------- | ------------- |
| `ON_SALE`      | `on_sale`  | 판매중        |
| `SOLD_OUT`     | `sold_out` | 품절/재고없음 |
| `INFO_CHANGED` | `off_sale` | 상품정보변경  |
| `NOT_FOUND`    | `off_sale` | 상품정보없음  |
| `ERROR`        | `off_sale` | 추출 실패     |

## 🧪 테스트

### 전략 테스트

```bash
# Docker 환경에서 실행
docker exec -it product-scanner-dev npx tsx scripts/test-kurly-strategy.ts
```

**테스트 케이스**:

1. ✅ 판매중 (일리윤): `1000284986`
2. ✅ 판매중 (롬앤 - basePrice 사용): `1001244384`
3. ✅ 품절/재고없음: `1000741467`
4. ✅ 상품정보변경: `1001164253`
5. ✅ 상품정보없음: `5070081`

### Workflow 테스트

```bash
# 1. 서버 시작
npm run dev

# 2. Workflow 실행
./scripts/test-kurly-workflow.sh
```

## 🔧 설정

### YAML 주요 설정

```yaml
# 모바일 설정
contextOptions:
  viewport: { width: 430, height: 932 }
  userAgent: "Mozilla/5.0 (iPhone; ...)"
  isMobile: true
  hasTouch: true
  deviceScaleFactor: 3

# Stealth 모드
browserOptions:
  args:
    - "--disable-blink-features=AutomationControlled"

# Rate Limiting
workflow:
  rate_limit:
    enabled: true
    wait_time_ms: 2000
  concurrency:
    max: 10
    default: 4
```

## 📊 데이터 필드

### 추출 필드

- `name` - 상품명
- `mainImageUrl` - 썸네일 이미지
- `retailPrice` - 정가
- `discountedPrice` or `basePrice` - 할인가
- `discountRate` - 할인율 (퍼센트)
- `isSoldOut` - 품절 여부
- `status` - 판매 상태

### 가격 추출 로직

컬리는 두 가지 가격 필드를 제공:

```javascript
// 1. discountedPrice 우선 사용
// 2. null이면 basePrice 사용
// 3. 둘 다 없으면 0
const extractedDiscountedPrice =
  product.discountedPrice || product.basePrice || 0;
```

**할인율 검증**:

```javascript
// 계산된 가격과 실제 가격 일치 확인
const calculatedPrice = Math.floor(retailPrice * (1 - discountRate / 100));
// calculatedPrice === extractedDiscountedPrice (검증 통과)
```

### 특이사항

- **discountedPrice vs basePrice**:
  - 일부 상품은 `discountedPrice` 사용 (예: 9800)
  - 일부 상품은 `discountedPrice`가 null이고 `basePrice` 사용 (예: 20800)
- **품절 상품**: `isSoldOut: true`이지만 가격 정보는 유지됨
- **상품정보없음**: `__NEXT_DATA__`에 `product` 객체가 없음
- **상품정보변경**: `isSoldOut`이 `null`

## 🔍 참고 문서

- [kurly-research-report.md](kurly-research-report.md) - 전략 수립 과정
- [kurly_sample.json](kurly_sample.json) - **NEXT_DATA** 샘플

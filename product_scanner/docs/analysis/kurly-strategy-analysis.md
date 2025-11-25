# Kurly 전략 분석 및 Extractor 리팩터링 계획

## 📋 개요

| 항목            | 내용                                       |
| --------------- | ------------------------------------------ |
| **플랫폼**      | 마켓컬리 (Kurly)                           |
| **URL 패턴**    | `https://www.kurly.com/goods/{productId}`  |
| **데이터 소스** | Next.js SSR (`__NEXT_DATA__`)              |
| **현재 구현**   | YAML script 기반 (84줄)                    |
| **목표**        | TypeScript Extractor 클래스로 마이그레이션 |

---

## 1️⃣ 데이터 소스 분석

### **NEXT_DATA** 구조

Kurly는 Next.js SSR을 사용하며, 모든 상품 데이터가 `<script id="__NEXT_DATA__">`에 포함됩니다.

```text
__NEXT_DATA__
└── props
    └── pageProps
        └── product           ← 상품 데이터 (직접 접근)
            ├── name          ← 상품명
            ├── mainImageUrl  ← 썸네일
            ├── retailPrice   ← 정가
            ├── basePrice     ← 기본가
            ├── discountedPrice ← 할인가 (nullable)
            ├── isSoldOut     ← 품절 여부 (boolean | null)
            └── dealProducts  ← 옵션 상품 배열
```

### Ably와의 비교

| 항목            | Kurly                                         | Ably                                                          |
| --------------- | --------------------------------------------- | ------------------------------------------------------------- |
| **데이터 경로** | `pageProps.product` (단순)                    | `pageProps.dehydratedState.queries[].state.data.goods` (복잡) |
| **상품 객체**   | `product` 직접 접근                           | `queries` 배열 순회 필요                                      |
| **가격 필드**   | `retailPrice`, `discountedPrice`, `basePrice` | `consumer`, `thumbnail_price`                                 |
| **판매 상태**   | `isSoldOut` (boolean)                         | `sale_type` (string)                                          |
| **브랜드**      | `brandInfo.nameGate.name`                     | `market.name`                                                 |

---

## 2️⃣ 현재 구현 분석

### 2.1 kurly.yaml 추출 스크립트 (L74-157)

```javascript
() => {
  try {
    const nextDataScript = document.querySelector('#__NEXT_DATA__');
    if (!nextDataScript || !nextDataScript.textContent) {
      return { name: '상품 정보 없음', status: 'NOT_FOUND', ... };
    }

    const nextData = JSON.parse(nextDataScript.textContent);
    const product = nextData?.props?.pageProps?.product;

    if (!product) {
      return { name: '상품 정보 없음', status: 'NOT_FOUND', ... };
    }

    // 상태 판단
    const detectStatus = () => {
      if (product.isSoldOut === null || product.isSoldOut === undefined) {
        return 'INFO_CHANGED';
      }
      if (product.isSoldOut === true) {
        return 'SOLD_OUT';
      }
      return 'ON_SALE';
    };

    // 할인가 추출 (discountedPrice || basePrice)
    const extractedDiscountedPrice = product.discountedPrice || product.basePrice || 0;

    return {
      name: product.name || '상품명 없음',
      mainImageUrl: product.mainImageUrl || '',
      retailPrice: product.retailPrice,
      basePrice: product.basePrice || 0,
      discountedPrice: extractedDiscountedPrice,
      isSoldOut: product.isSoldOut,
      status: detectStatus(),
      _source: 'next_data',
      _error: null
    };
  } catch (error) {
    return { name: '추출 실패', status: 'ERROR', _error: error.message };
  }
}
```

**문제점**:

- 84줄의 JavaScript가 YAML 파일에 하드코딩
- 타입 안전성 없음
- 테스트 불가능
- 로깅 없음

### 2.2 KurlyProduct.ts 도메인 모델

```typescript
export class KurlyProduct implements IProduct {
  constructor(
    public readonly productId: string,
    public readonly productName: string,
    public readonly thumbnail: string,
    public readonly originalPrice: number,
    public readonly discountedPrice: number,
    public readonly saleStatus: SaleStatus,
  ) {}

  // 팩토리 메서드
  static fromDOMData(domData: KurlyDOMResponse): KurlyProduct { ... }

  // 판매 상태 매핑
  static mapSaleStatus(domStatus: KurlyDomSaleStatus): SaleStatus { ... }
}
```

**특징**:

- `mapSaleStatus` static 메서드가 이미 존재 (Extractor로 이동 가능)
- `fromDOMData` 팩토리 메서드로 DOM 데이터 변환

### 2.3 KurlyScannerFactory.ts

```typescript
return new BrowserScanner<KurlyDOMResponse, KurlyProduct, KurlyConfig>({
  config: this.config,
  strategy,
  parseDOM: async (domData, productId) => {
    return KurlyProduct.fromDOMData({ ...domData, productId });
  },
});
```

**현재 흐름**:

1. BrowserScanner가 YAML script 실행
2. KurlyDOMResponse 반환
3. parseDOM 콜백에서 KurlyProduct.fromDOMData 호출

---

## 3️⃣ 추출 로직 상세

### 3.1 가격 추출

```typescript
// 정가: retailPrice
const originalPrice = product.retailPrice ?? product.basePrice;

// 판매가: discountedPrice || basePrice
const price = product.discountedPrice || product.basePrice || 0;
```

| 케이스    | retailPrice | discountedPrice | basePrice | 결과                     |
| --------- | ----------- | --------------- | --------- | ------------------------ |
| 할인 상품 | 14000       | 9800            | 11900     | 정가=14000, 판매가=9800  |
| 일반 상품 | 20800       | null            | 20800     | 정가=20800, 판매가=20800 |
| 품절 상품 | 14000       | null            | 11900     | 정가=14000, 판매가=11900 |

### 3.2 판매 상태 추출

```typescript
// isSoldOut 필드 기반 상태 판단
const detectStatus = (isSoldOut: boolean | null): KurlyDomSaleStatus => {
  if (isSoldOut === null || isSoldOut === undefined) {
    return "INFO_CHANGED"; // 상품 정보 변경/삭제
  }
  if (isSoldOut === true) {
    return "SOLD_OUT"; // 품절
  }
  return "ON_SALE"; // 판매중
};
```

**상태 매핑 (시스템 정책: sold_out → off_sale)**:

| DOM 상태     | CSV 상태 | 설명                          |
| ------------ | -------- | ----------------------------- |
| ON_SALE      | on_sale  | 판매중                        |
| SOLD_OUT     | off_sale | 품절 → 시스템 정책상 off_sale |
| INFO_CHANGED | off_sale | 상품 정보 변경                |
| NOT_FOUND    | off_sale | 상품 없음                     |
| ERROR        | off_sale | 추출 실패                     |

### 3.3 메타데이터 추출

```typescript
// 상품명
const productName = product.name || "상품명 없음";

// 썸네일 (이미지 URL 정규화 불필요 - 쿼리 파라미터 제거)
const thumbnail = KurlyProduct.normalizeUrl(product.mainImageUrl || "");

// 브랜드 (brandInfo.nameGate.name)
const brand = product.brandInfo?.nameGate?.name || undefined;
```

---

## 4️⃣ 리팩터링 계획

### 4.1 파일 구조

```text
src/extractors/kurly/
├── KurlyExtractor.ts          # Facade (통합 Extractor)
├── KurlyPriceExtractor.ts     # 가격 추출
├── KurlySaleStatusExtractor.ts # 판매 상태 추출
└── KurlyMetadataExtractor.ts  # 메타데이터 추출

tests/extractors/kurly/
├── KurlyExtractor.test.ts
├── KurlyPriceExtractor.test.ts
├── KurlySaleStatusExtractor.test.ts
└── KurlyMetadataExtractor.test.ts
```

### 4.2 KurlyPriceExtractor

```typescript
export class KurlyPriceExtractor implements IPriceExtractor<Page> {
  async extract(page: Page): Promise<PriceData> {
    const url = page.url();
    logger.debug({ url }, "[KurlyPriceExtractor] 가격 추출 시작");

    const ssrPrice = await this.extractFromSSR(page);
    if (ssrPrice) {
      logger.debug(
        { url, ...ssrPrice },
        "[KurlyPriceExtractor] SSR 가격 추출 성공",
      );
      return ssrPrice;
    }

    return { price: 0, currency: "KRW" };
  }

  private async extractFromSSR(page: Page): Promise<PriceData | null> {
    const productData = await page.evaluate(() => {
      const script = document.getElementById("__NEXT_DATA__");
      if (!script?.textContent) return null;

      const data = JSON.parse(script.textContent);
      const product = data.props?.pageProps?.product;
      if (!product) return null;

      return {
        retailPrice: product.retailPrice,
        basePrice: product.basePrice,
        discountedPrice: product.discountedPrice,
      };
    });

    if (!productData) return null;

    const originalPrice = productData.retailPrice ?? productData.basePrice ?? 0;
    const price = productData.discountedPrice || productData.basePrice || 0;

    return {
      price,
      originalPrice: originalPrice !== price ? originalPrice : undefined,
      currency: "KRW",
    };
  }
}
```

### 4.3 KurlySaleStatusExtractor

```typescript
export class KurlySaleStatusExtractor implements ISaleStatusExtractor<Page> {
  async extract(page: Page): Promise<SaleStatusData> {
    const url = page.url();
    logger.debug({ url }, "[KurlySaleStatusExtractor] 판매상태 추출 시작");

    const ssrStatus = await this.extractFromSSR(page);
    if (ssrStatus) {
      logger.debug(
        { url, ...ssrStatus },
        "[KurlySaleStatusExtractor] SSR 상태 추출 성공",
      );
      return ssrStatus;
    }

    return { saleStatus: SaleStatus.Discontinued };
  }

  private async extractFromSSR(page: Page): Promise<SaleStatusData | null> {
    const isSoldOut = await page.evaluate(() => {
      const script = document.getElementById("__NEXT_DATA__");
      if (!script?.textContent) return undefined;

      const data = JSON.parse(script.textContent);
      const product = data.props?.pageProps?.product;
      return product?.isSoldOut;
    });

    // null/undefined → Discontinued (INFO_CHANGED)
    if (isSoldOut === null || isSoldOut === undefined) {
      return { saleStatus: SaleStatus.Discontinued };
    }

    // true → SoldOut
    if (isSoldOut === true) {
      return { saleStatus: SaleStatus.SoldOut };
    }

    // false → InStock
    return { saleStatus: SaleStatus.InStock };
  }
}
```

### 4.4 KurlyMetadataExtractor

```typescript
export class KurlyMetadataExtractor implements IMetadataExtractor<Page> {
  async extract(page: Page): Promise<MetadataData> {
    const url = page.url();
    logger.debug({ url }, "[KurlyMetadataExtractor] 메타데이터 추출 시작");

    const ssrMetadata = await this.extractFromSSR(page);
    if (ssrMetadata) {
      logger.debug(
        { url, ...ssrMetadata },
        "[KurlyMetadataExtractor] SSR 메타데이터 추출 성공",
      );
      return ssrMetadata;
    }

    // Fallback: Meta tags
    return this.extractFromMeta(page);
  }

  private async extractFromSSR(page: Page): Promise<MetadataData | null> {
    const productData = await page.evaluate(() => {
      const script = document.getElementById("__NEXT_DATA__");
      if (!script?.textContent) return null;

      const data = JSON.parse(script.textContent);
      const product = data.props?.pageProps?.product;
      if (!product) return null;

      return {
        name: product.name,
        mainImageUrl: product.mainImageUrl,
        brand: product.brandInfo?.nameGate?.name,
      };
    });

    if (!productData) return null;

    return {
      productName: productData.name || "",
      thumbnail: this.normalizeUrl(productData.mainImageUrl || ""),
      brand: productData.brand || undefined,
      images: [],
    };
  }

  private async extractFromMeta(page: Page): Promise<MetadataData> {
    const [metaTitle, metaImage] = await Promise.all([
      DOMHelper.safeAttribute(page, 'meta[property="og:title"]', "content"),
      DOMHelper.safeAttribute(page, 'meta[property="og:image"]', "content"),
    ]);

    return {
      productName: metaTitle || "",
      thumbnail: metaImage ? this.normalizeUrl(metaImage) : undefined,
      brand: undefined,
      images: [],
    };
  }

  private normalizeUrl(url: string): string {
    return url.split("?")[0];
  }
}
```

### 4.5 KurlyExtractor (Facade)

```typescript
export class KurlyExtractor implements IExtractor<Page, KurlyExtractorResult> {
  private priceExtractor = new KurlyPriceExtractor();
  private saleStatusExtractor = new KurlySaleStatusExtractor();
  private metadataExtractor = new KurlyMetadataExtractor();

  async extract(page: Page): Promise<KurlyExtractorResult> {
    const url = page.url();
    logger.info({ url }, "[KurlyExtractor] 추출 시작");

    const [price, saleStatus, metadata] = await Promise.all([
      this.priceExtractor.extract(page),
      this.saleStatusExtractor.extract(page),
      this.metadataExtractor.extract(page),
    ]);

    logger.info(
      {
        url,
        price: price.price,
        saleStatus: SaleStatus[saleStatus.saleStatus],
      },
      "[KurlyExtractor] 추출 완료",
    );

    return { price, saleStatus, metadata };
  }
}
```

### 4.6 kurly.yaml 수정

**Before (84줄 script)**:

```yaml
extraction:
  method: "evaluate"
  script: |
    () => { ... 84줄 JavaScript ... }
```

**After (Extractor 참조)**:

```yaml
extraction:
  extractor: "kurly"
```

---

## 5️⃣ 작업 체크리스트

### Phase 1: Extractor 클래스 구현

- [ ] KurlyPriceExtractor.ts 구현
- [ ] KurlyPriceExtractor.test.ts 테스트 작성
- [ ] KurlySaleStatusExtractor.ts 구현
- [ ] KurlySaleStatusExtractor.test.ts 테스트 작성
- [ ] KurlyMetadataExtractor.ts 구현
- [ ] KurlyMetadataExtractor.test.ts 테스트 작성

### Phase 2: Facade 및 통합

- [ ] KurlyExtractor.ts (Facade) 구현
- [ ] KurlyExtractor.test.ts 테스트 작성
- [ ] ExtractorRegistry에 등록

### Phase 3: YAML 정리 및 검증

- [ ] kurly.yaml에서 script 제거
- [ ] extraction.extractor: "kurly" 설정
- [ ] KurlyScannerFactory 수정 (필요 시)
- [ ] 워크플로우 테스트 실행

### Phase 4: 문서화

- [ ] PHASE1_ALL_PLATFORMS_PLAN.md 업데이트
- [ ] REFACTORING_PLAN.md 업데이트

---

## 6️⃣ 예상 변경 사항

| 파일                                  | 변경 내용                     |
| ------------------------------------- | ----------------------------- |
| `src/extractors/kurly/*.ts`           | **신규** 4개 Extractor 클래스 |
| `tests/extractors/kurly/*.ts`         | **신규** 4개 테스트 파일      |
| `src/extractors/ExtractorRegistry.ts` | kurly Extractor 등록          |
| `src/config/platforms/kurly.yaml`     | script 제거, extractor 참조   |
| `src/core/domain/KurlyProduct.ts`     | mapSaleStatus 이동 검토       |

---

## 7️⃣ 위험 요소 및 대응

### 7.1 sold_out 정책 적용

- **문제**: 현재 kurly.yaml의 fieldMapping에서 `SOLD_OUT: "sold_out"` 매핑 존재
- **대응**: KurlySaleStatusExtractor에서 SaleStatus.SoldOut 반환 → saleStatusMapper에서 off_sale로 변환됨 (이미 적용됨)

### 7.2 가격 필드 우선순위

- **문제**: discountedPrice가 null인 경우 basePrice 사용 로직
- **대응**: KurlyPriceExtractor에서 명확한 우선순위 로직 구현

### 7.3 브랜드 정보 경로

- **문제**: 복잡한 브랜드 정보 경로 (`brandInfo.nameGate.name`)
- **대응**: KurlyMetadataExtractor에서 optional chaining으로 안전하게 추출

---

## 8️⃣ 참고 문서

- [ably-strategy-analysis.md](./ably-strategy-analysis.md) - Ably 리팩터링 참조
- [kurly-research-report.md](../kurly-analysis/kurly-research-report.md) - 원본 분석 문서
- [PHASE1_ALL_PLATFORMS_PLAN.md](../PHASE1_ALL_PLATFORMS_PLAN.md) - 전체 마이그레이션 계획

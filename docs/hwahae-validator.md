# 화해(Hwahae) 데이터 검증 스크립트

CSV 데이터와 화해 API 응답을 비교하여 데이터 일관성을 검증하는 TypeScript 스크립트입니다.

## 개요

이 스크립트는 Supabase에서 추출한 화해 상품 데이터(CSV)와 화해 API의 실시간 데이터를 비교하여 다음을 수행합니다:

- **goods_id 추출**: CSV의 `link_url`에서 상품 ID를 자동으로 추출
- **API 데이터 fetch**: 각 상품에 대해 화해 API를 호출하여 최신 데이터 수집
- **필드 비교**: 8개 주요 필드에 대한 상세 비교 수행
- **Rate Limiting**: API 호출 간 1초 이상의 대기 시간 자동 적용
- **결과 리포트**: 차이점을 콘솔에 출력하고 JSON 파일로 저장

## 비교 필드

스크립트는 다음 필드들을 비교합니다:

| 필드      | CSV 컬럼           | API 필드          | 비고                             |
| --------- | ------------------ | ----------------- | -------------------------------- |
| 상품명    | `product_name`     | `name`            | 정확히 일치해야 함               |
| 썸네일    | `thumbnail`        | `title_images[0]` | URL 쿼리 파라미터 차이 발생 가능 |
| 판매 상태 | `sale_status`      | `sale_status`     | 매핑 변환 수행                   |
| 정가      | `original_price`   | `consumer_price`  | 숫자로 변환 후 비교              |
| 판매가    | `discounted_price` | `price`           | 숫자로 변환 후 비교              |
| 용량      | `volume`           | `capacity` (파싱) | `capacity`에서 숫자 추출         |
| 용량 단위 | `volume_unit`      | `capacity` (파싱) | `capacity`에서 단위 추출         |
| 라벨      | `label`            | 상품명 분석       | 리필/세트/단품 자동 분류         |

### 판매 상태 매핑

```typescript
SELNG → on_sale    // 판매중
SLDOT → sold_out   // 품절
STSEL → off_sale   // 판매중지
```

## 사용법

### 실행

```bash
cd /Users/gzu/project/cosmetic/scoob-scraper/product_scanner
npx tsx hwahae-validator.ts
```

### 입력 파일

- **CSV 파일**: `../hwahae/hwahae_filtered.csv`
- CSV는 다음 구조를 가져야 합니다:

```csv
product_set_id,product_id,platform_id,product_name,link_url,md_pick,created_at,updated_at,thumbnail,normalized_product_name,label,volume,volume_unit,sale_status,original_price,discounted_price
```

### 출력 파일

- **JSON 결과**: `../hwahae/validation-results.json`
- 상세한 비교 결과가 저장됩니다

## 출력 예시

### 콘솔 출력

```
🚀 Hwahae Data Validator Starting...

📂 Reading CSV: /Users/gzu/project/cosmetic/scoob-scraper/hwahae/hwahae_filtered.csv
✅ Parsed 6 products from CSV

🔍 Processing goods_id: 61560
   Product: 블랙 쿠션 파운데이션 본품 15g+리필 15g [21N1 바닐라]
   ⚠️  Found 1 differences:
      - thumbnail:
        CSV: "https://img.hwahae.co.kr/commerce/goods/20240401_101447_1_21n1.jpg?format=webp&size=600x600&fit=inside"
        API: "https://img.hwahae.co.kr/commerce/goods/20240401_101447_1_21n1.jpg"

================================================================================
📊 VALIDATION SUMMARY
================================================================================

📈 Status Distribution:
   ✅ Success:   5
   🛒 Sold Out:  1
   ❌ API Error: 0
   ❓ Not Found: 0
   📦 Total:     6

📋 Field Mismatch Statistics:
   - thumbnail: 5 mismatches
   - discounted_price: 3 mismatches
   - product_name: 3 mismatches
   - volume: 3 mismatches
   - volume_unit: 3 mismatches
   - original_price: 2 mismatches
   - label: 2 mismatches
   - sale_status: 1 mismatches

💾 Results saved to: /Users/gzu/project/cosmetic/scoob-scraper/hwahae/validation-results.json

✅ Validation Complete!
```

## 검증 결과 분석

### 테스트 데이터 (6개 상품)

실제 실행 결과를 기반으로 한 분석입니다:

#### 1. 성공 사례 (goods_id: 61560)

- **상품명**: 블랙 쿠션 파운데이션 본품 15g+리필 15g [21N1 바닐라]
- **불일치**: 썸네일 URL (쿼리 파라미터 차이)
- **원인**: CSV는 CDN 최적화 파라미터 포함, API는 원본 URL 반환

#### 2. 가격 변동 사례 (goods_id: 21320)

- **상품명**: 블랙빈 탈모증상 개선 샴푸 520ml
- **불일치**:
  - 썸네일 URL (쿼리 파라미터)
  - 판매가 차이 (CSV: 17,500원 → API: 18,500원)
- **원인**: 실시간 가격 변동 감지 (1,000원 인상)

#### 3. 품절 상태 불일치 (goods_id: 65725)

- **상품명**: 수플렛 컬러팟 → 수플레 컬러 팟 [07 번트 시에나]
- **불일치**:
  - 상품명 (CSV에 옵션명 누락)
  - 판매 상태 (CSV: off_sale → API: sold_out)
  - 용량 정보 (CSV: null → API: 6.5g)
- **원인**: CSV 데이터 불완전, 판매 상태 변경

#### 4. 판매 종료 상품 (goods_id: 71113, 64235)

- **상품명**: "판매 종료" → 실제 상품명
- **불일치**: 거의 모든 필드
- **원인**: CSV에 데이터가 없거나 불완전한 상태

### 주요 발견사항

1. **썸네일 URL 차이**
   - CSV: `?format=webp&size=600x600&fit=inside` 쿼리 파라미터 포함
   - API: 원본 이미지 URL만 반환
   - **해결**: URL 정규화 로직 필요 (쿼리 파라미터 제거 후 비교)

2. **가격 변동**
   - 실시간 가격 변경 감지됨 (21320번 상품: 1,000원 인상)
   - **의미**: CSV 데이터가 오래되었거나 프로모션 종료

3. **판매 상태 불일치**
   - CSV의 `off_sale`과 API의 `sold_out` 구분 필요
   - **개선**: 더 세밀한 상태 매핑 필요

4. **불완전한 CSV 데이터**
   - "판매 종료"로 표시된 상품들은 API에서 정상 조회됨
   - **해결**: CSV 업데이트 또는 재수집 필요

## 기술 구현

### goods_id 추출

```typescript
function extractGoodsId(linkUrl: string): string | null {
  const match = linkUrl.match(/\/goods\/(\d+)/);
  return match ? match[1] : null;
}
```

### 용량 파싱

```typescript
function parseCapacity(capacity: string): {
  volume: number | null;
  volume_unit: string | null;
} {
  const match = capacity.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
  if (match) {
    return {
      volume: parseFloat(match[1]),
      volume_unit: match[2].toLowerCase(),
    };
  }
  return { volume: null, volume_unit: null };
}
```

### 라벨 추출

```typescript
function extractLabel(productName: string): string {
  if (
    productName.includes("리필") ||
    productName.toLowerCase().includes("refill")
  ) {
    return "리필";
  }
  if (productName.match(/\d+개|세트|set/i)) {
    return "세트";
  }
  return "단품";
}
```

### Rate Limiting

```typescript
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 각 API 호출 후 1초 대기
await sleep(1000);
```

## API 엔드포인트

```
GET https://gateway.hwahae.co.kr/v14/commerce/goods/{goods_id}
```

### 응답 구조

```typescript
interface HwahaeApiResponse {
  id: number;
  name: string;
  price: number;
  consumer_price: number;
  capacity: string;
  sale_status: "SELNG" | "SLDOT" | "STSEL";
  title_images: string[];
  // ... 기타 필드들
}
```

## 개선 제안

1. **URL 정규화**
   - 썸네일 URL 비교 시 쿼리 파라미터 제거
   - 또는 CSV 저장 시 쿼리 파라미터 제외

2. **가격 변동 임계값**
   - 작은 가격 차이는 warning으로 표시
   - 큰 가격 차이(10% 이상)는 error로 표시

3. **타임스탬프 비교**
   - CSV의 `updated_at`과 API 응답 시간 비교
   - 오래된 데이터 자동 식별

4. **배치 처리**
   - 대량의 상품 처리 시 progress bar 추가
   - 실패한 항목 자동 재시도 로직

5. **Supabase 연동**
   - 검증 결과를 DB에 직접 저장
   - 불일치 항목 자동 업데이트 옵션

## 참고 자료

- [화해 크롤링 가이드](../hwahae/hwahae_crawling_guide.md)
- CSV 샘플: `../hwahae/hwahae_filtered.csv`
- 성공 사례 JSON: `../hwahae/hwahae_success.json`
- 품절 사례 JSON: `../hwahae/hwahae_soldout.json`
- 실패 사례 JSON: `../hwahae/hwahae_fail.json`

## 문제 해결

### CSV 파일을 찾을 수 없음

```bash
❌ CSV file not found: /path/to/hwahae_filtered.csv
```

**해결**: CSV 파일 경로 확인 및 스크립트 내 `csvPath` 변수 수정

### API 호출 실패

```bash
❌ API Error for goods_id 12345: 404 Not Found
```

**해결**:

- 해당 상품이 삭제되었을 수 있음
- goods_id가 올바른지 확인
- 네트워크 연결 확인

### Rate Limiting 경고

화해 API는 요청 제한이 있을 수 있습니다. 스크립트는 자동으로 1초 대기를 적용하지만, 대량 처리 시 더 긴 대기 시간이 필요할 수 있습니다.

```typescript
// hwahae-validator.ts에서 대기 시간 조정
await sleep(2000); // 1초 → 2초로 변경
```

## 라이센스

이 스크립트는 내부 데이터 검증 목적으로만 사용해야 합니다.

# Product Set 컬럼 추가 스펙

## 목표

`product_sets` 테이블에 3개의 새 컬럼 추가:

- `set_name`
- `sanitized_item_name`
- `structured_item_name`

## 기술 스택

### 패키지

| 패키지               | 버전    | 용도                              |
| -------------------- | ------- | --------------------------------- |
| `@google/genai`      | ^1.31.0 | Gemini API 공식 SDK               |
| `zod`                | ^3.22.0 | 스키마 정의 및 검증 (기존 설치됨) |
| `zod-to-json-schema` | ^3.24.0 | Zod → JSON Schema 변환            |

### 모델

- `gemini-2.5-flash` (기본) 또는 `gemini-2.5-pro-preview`

### thinkingBudget 설정

Gemini 2.5의 `thinkingBudget` 파라미터로 reasoning 토큰 사용량 제어.

**모델별 Range**:

| 모델           | 범위         | 비고           |
| -------------- | ------------ | -------------- |
| 2.5 Flash      | 0 ~ 24,576   | 0으로 비활성화 |
| 2.5 Flash-Lite | 512 ~ 24,576 | 기본값 OFF     |
| 2.5 Pro        | 128 ~ 32,768 | 비활성화 불가  |

**특수값**:

| 값   | 의미                              |
| ---- | --------------------------------- |
| `0`  | Thinking 비활성화 (Pro 제외)      |
| `-1` | Dynamic (복잡도에 따라 자동 조절) |

**가격 (Gemini 2.5 Flash, per 1M tokens)**:

| 항목                   | Free Tier | Paid Tier |
| ---------------------- | --------- | --------- |
| Input                  | 무료      | $0.30     |
| Output (thinking 포함) | 무료      | $2.50     |

**현재 설정**: `thinkingBudget: 0`

- 이유: 패턴 매칭/텍스트 추출 작업 → reasoning 불필요
- 복잡한 추론 없이 규칙 기반 분류만 수행
- thinking ON 시 비용만 증가, 품질 향상 기대 어려움

### 참고 문서

- [Google GenAI SDK (GitHub)](https://github.com/googleapis/js-genai)
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini Thinking](https://ai.google.dev/gemini-api/docs/thinking)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)

## 데이터 소스

| 소스        | 테이블       | 컬럼         | 설명                               |
| ----------- | ------------ | ------------ | ---------------------------------- |
| 원본 텍스트 | product_sets | product_name | 쇼핑몰에서 수집한 전체 상품명      |
| 메인 상품명 | products     | name         | product_id로 조회, 브랜드명 미포함 |

## 컬럼 정의

### 1. structured_item_name

**목적**: 메인 상품 + 증정품을 구조화하여 정리

**생성 로직**:

1. `products.name`으로 메인 상품 식별
2. `product_name`에서 메인 상품과 증정품 분리
3. 각각 용량(volume) + 단위(unit) + 개수(count) 추출
4. "+" 로 연결

**예시**:

```text
입력:
  product_name: "[직잭픽] 토리든 다이브인 저분자 히알루론산 세럼 50ml+( 다이브인 세럼 2ml*3매)"
  products.name: "다이브인 저분자 히알루론산 세럼"

출력:
  structured_item_name: "다이브인 저분자 히알루론산 세럼 50ml + 다이브인 세럼 2ml*3매"
```

**제거 대상**:

- 브랜드명 (예: 토리든)
- 쇼핑몰 태그 (예: [직잭픽])

### 2. sanitized_item_name

**목적**: 제품명 + 용량 추출

**예시**:

```text
입력: "다이브인 저분자 히알루론산 세럼 50ml + 다이브인 세럼 2ml*3매"
출력: "다이브인 저분자 히알루론산 세럼 50ml + 다이브인 세럼 2ml x 3개"
```

**참고**: type 필드 제거로 인해 set_name과 동일한 포맷 사용

### 3. set_name

**목적**: 메인 상품만 표시 (증정품 제외)

**예시**:

```text
단일 메인: "다이브인 저분자 히알루론산 세럼 50ml"
복수 메인: "다이브인 세럼 50ml + 워터뱅크 크림 10g"
```

**규칙**:

- 증정품/샘플 제외
- 메인 상품이 2개 이상일 경우 "+"로 연결

## 처리 파이프라인

```text
┌─────────────────┐
│  Preprocessing  │  (필요시)
└────────┬────────┘
         ▼
┌─────────────────┐
│      LLM        │  1회 호출, Structured Output (JSON Schema 강제)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Postprocessing  │  JSON → 3개 컬럼 텍스트 조합
└─────────────────┘
```

### LLM 호출 전략

- **1회 호출**로 3개 컬럼 모두 생성
- 핵심: 메인/증정품 분리 + 용량 파싱 (동일 로직)
- 3개 컬럼 차이는 Postprocessing에서 필드 조합으로 해결

### LLM 프롬프트 규칙

```
1. main_product_name(products.name)과 매칭되는 상품만 main_products에 포함 (부분 일치 허용)
2. 그 외 모든 상품은 gifts로 분류 (SET 구성품, 증정품, 샘플 모두 포함)
3. SET 상품: main_product_name 외 다른 본품(50ml 등)도 매칭 안 되면 gifts
4. 제거 대상: 브랜드명, 쇼핑몰 태그([직잭픽], [올영픽], [SET] 등)
5. type 추출: cosmeticCategories 목록을 "참고"하여 추출 (강제 선택 아님, 약한 참조)
   - 목록에 없는 type도 허용: 상품명에 명시된 그대로 사용
6. 용량 형식: "50ml", "2ml*3", "10g" 등에서 숫자와 단위 분리
7. 단위(unit) 규칙:
   - 허용: ml, g, L, kg, 개, 매
   - 비허용: colors, 구 등 모호한 단위 → volume=null, unit=""
8. 개수(count): "*3", "x2" 등에서 추출, 없으면 1
   - "10매입", "2개"는 count로 추출하지 않음
```

**SET 상품 처리 예시**:

```
입력:
  product_name: "[SET] 다이브인 세럼 50ml+밸런스풀 시카 컨트롤 세럼 50ml (+시카컨트롤세럼 10ml 2개)"
  main_product_name: "다이브인 저분자 히알루론산 세럼"

출력:
  main_products: [다이브인 세럼 50ml]
  gifts: [밸런스풀 시카 컨트롤 세럼 50ml, 시카컨트롤세럼 10ml*2]

// "밸런스풀 시카 컨트롤 세럼"은 본품급(50ml)이지만
// main_product_name과 매칭 안 됨 → gifts로 분류
```

## Gemini Structured Output

### 개요

Gemini API의 `responseSchema` 기능을 활용하여 JSON 출력 형식을 강제합니다.

**장점**:

- 스키마 준수 보장 (파싱 에러 감소)
- 프롬프트에서 스키마 설명 불필요 (토큰 절약)
- Zod 스키마로 타입 안전성 확보

### Zod 스키마 정의

```typescript
import { z } from "zod";

// 개별 상품 아이템 스키마
const ProductItemSchema = z.object({
  type: z.string().describe("제품 카테고리 (세럼, 크림, 토너 등)"),
  full_name: z.string().describe("라인명 + 제품 상세명 (브랜드 제외)"),
  volume: z.number().nullable().describe("용량 숫자"),
  unit: z
    .string()
    .describe("단위 - ml, g, L, kg, 개, 매 허용 / 비허용 시 빈 문자열"),
  count: z.number().describe("개수"),
});

// 전체 출력 스키마
const ProductSetParsingSchema = z.object({
  main_products: z.array(ProductItemSchema).describe("메인 상품 목록"),
  gifts: z.array(ProductItemSchema).describe("증정품 목록"),
});

// 타입 추출
type ProductSetParsingResult = z.infer<typeof ProductSetParsingSchema>;
```

### API 호출 예시

```typescript
import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: userPrompt,
  config: {
    responseMimeType: "application/json",
    responseSchema: zodToJsonSchema(ProductSetParsingSchema),
  },
});
```

### LLM 출력 구조

```json
{
  "main_products": [
    {
      "type": "세럼",
      "full_name": "다이브인 저분자 히알루론산 세럼",
      "volume": 50,
      "unit": "ml",
      "count": 1
    }
  ],
  "gifts": [
    {
      "type": "세럼",
      "full_name": "다이브인 세럼",
      "volume": 2,
      "unit": "ml",
      "count": 3
    }
  ]
}
```

## Postprocessing

LLM JSON 출력 → 각 컬럼 텍스트 생성:

| 컬럼                 | 조합 로직                                 |
| -------------------- | ----------------------------------------- |
| set_name             | `{type} {volume}{unit}` (main_products만) |
| sanitized_item_name  | `{type} {volume}{unit}` (모든 항목)       |
| structured_item_name | `{full_name} {volume}{unit}` (모든 항목)  |

### 조합 규칙

- 여러 항목은 " + "로 연결
- count > 1인 경우: `x {count}개` (예: 세럼 2ml x 3개)
- volume이 null인 경우: `{full_name}`만 출력

### 단위(unit) 규칙

| 유형   | 예시                      | 처리                 |
| ------ | ------------------------- | -------------------- |
| 허용   | ml, g, L, kg, 개, 매      | 그대로 사용          |
| 비허용 | colors, 구 등 모호한 단위 | volume=null, unit="" |

**예시**:

- 마스크팩 10매입 → `volume: 10, unit: "매"`
- 패드 2개 → `volume: 2, unit: "개"`
- 섀도우팔레트 24 colors → `volume: null, unit: ""` (모호한 단위)
- 세럼 50ml → `volume: 50, unit: "ml"`

## 구현 체크리스트

- [x] LLM 프롬프트 초안 작성
- [x] package.json 패키지 추가 (`@google/genai`, `zod-to-json-schema`)
- [x] Zod 스키마 파일 생성
- [x] GoogleGenAIClient 구현 (공식 SDK 사용, 새 클라이언트)
- [x] ProductSetParsingService 구현
- [x] Postprocessor 구현
- [x] 테스트 스크립트 작성
- [x] SET 상품 (본품 2개) 케이스 프롬프트 추가

## 관련 파일

| 파일                                                | 설명                         |
| --------------------------------------------------- | ---------------------------- |
| `src/llm/prompts/productSetParsingPrompt.ts`        | LLM 프롬프트                 |
| `src/llm/GoogleGenAIClient.ts`                      | Gemini 공식 SDK 클라이언트   |
| `src/llm/ProductSetParsingService.ts`               | 파싱 서비스                  |
| `src/llm/schemas/ProductSetParsingSchema.ts`        | Zod 스키마                   |
| `src/llm/postprocessors/productSetPostprocessor.ts` | 후처리 로직                  |
| `scripts/test-product-set-parsing.ts`               | 테스트 (문자열 입력)         |
| `scripts/test-product-set-parsing-by-id.ts`         | 테스트 (product_set_id 입력) |

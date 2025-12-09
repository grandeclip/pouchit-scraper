# Gemini URL Context 비용 분석

> 테스트 일자: 2025-12-09
> 용도: 상품 설명 생성 (URL Context + Structured Output)

## 개요

Gemini의 URL Context 기능을 사용한 상품 설명 생성 비용 분석입니다. URL에서 웹 페이지 콘텐츠를 가져와 분석하는 기능으로, **숨겨진 토큰 비용**이 발생합니다.

## 테스트 케이스

- **브랜드**: 토리든
- **상품명**: 다이브인 저분자 히알루론산 세럼
- **URL**: 3개 (올리브영, 지그재그, 무신사)

## 모델별 비교

### 결과 요약

| 항목             | Gemini 2.5 Flash | Gemini 3 Pro      |
| ---------------- | ---------------- | ----------------- |
| 호출 방식        | 2단계            | 1단계 (단일 호출) |
| URL Context 토큰 | 12,587           | 16,309            |
| Thinking 토큰    | 0                | 2,734             |
| 총 토큰          | 15,800           | 22,494            |
| **비용**         | **₩3.73**        | **₩104**          |
| **비용 배율**    | **1x**           | **28x**           |
| 소요 시간        | 6.6초            | 37.5초            |
| 성분 추출        | 1개              | 5개               |

### 가격 정책 (2025-01 기준)

| 모델                   | Input/1M | Output/1M              |
| ---------------------- | -------- | ---------------------- |
| gemini-2.5-flash       | $0.15    | $0.60                  |
| gemini-2.5-pro-preview | $1.25    | $10.00                 |
| gemini-3-pro-preview   | $2.00    | $12.00 (thinking 포함) |

---

## Gemini 2.5 Flash 분석

### 호출 방식

URL Context와 Structured Output을 **동시에 사용할 수 없어** 2단계 호출 필요:

```
1단계: URL Context로 정보 추출 (텍스트)
2단계: Structured Output으로 정형화 (JSON)
```

### Raw usageMetadata

**1단계 (URL Context)**:

```json
{
  "promptTokenCount": 180,
  "candidatesTokenCount": 494,
  "totalTokenCount": 13261,
  "toolUsePromptTokenCount": 12587
}
```

**2단계 (Structured Output)**:

```json
{
  "promptTokenCount": 2377,
  "candidatesTokenCount": 162,
  "totalTokenCount": 2539
}
```

### 토큰 구성 분석

| 항목               | 토큰 수    | 비율 |
| ------------------ | ---------- | ---- |
| 프롬프트 (1+2단계) | 2,557      | 16%  |
| URL Context        | 12,587     | 80%  |
| 출력 (1+2단계)     | 656        | 4%   |
| **총계**           | **15,800** | 100% |

### 비용 계산

```
입력: 프롬프트 + URL Context
     = 2,557 + 12,587 = 15,144 tokens
     = 15,144 × $0.15 / 1M = $0.002272

출력: 1단계 + 2단계
     = 494 + 162 = 656 tokens
     = 656 × $0.60 / 1M = $0.000394

총 비용: $0.002666 ≈ ₩3.73
```

### 숨겨진 비용 분석

```
URL Context:  $0.00189 (71%)
프롬프트:     $0.00038 (14%)
출력:         $0.00039 (15%)
─────────────────────────────
총 비용:      $0.00267 (100%)
```

> **URL Context가 전체 비용의 71%를 차지**하지만, 저렴한 가격 정책으로 총 비용은 여전히 경제적입니다.

---

## Gemini 3 Pro 분석

### 호출 방식

URL Context와 Structured Output을 **단일 API 호출**로 동시 사용 가능:

```typescript
const response = await client.models.generateContent({
  model: "gemini-3-pro-preview",
  contents: prompt,
  config: {
    responseMimeType: "application/json",
    responseSchema,
    tools: [{ urlContext: {} }],
    thinkingConfig: { thinkingLevel: "low" },
  },
});
```

### Raw usageMetadata

```json
{
  "promptTokenCount": 3243,
  "candidatesTokenCount": 208,
  "totalTokenCount": 22494,
  "toolUsePromptTokenCount": 16309,
  "thoughtsTokenCount": 2734
}
```

### 토큰 구성 분석

| 항목        | 토큰 수    | 비율 |
| ----------- | ---------- | ---- |
| 프롬프트    | 3,243      | 14%  |
| URL Context | 16,309     | 73%  |
| Thinking    | 2,734      | 12%  |
| 출력        | 208        | 1%   |
| **총계**    | **22,494** | 100% |

### 비용 계산

```
입력: 프롬프트 + URL Context
     = 3,243 + 16,309 = 19,552 tokens
     = 19,552 × $2.00 / 1M = $0.039104

출력: 출력 + Thinking (출력 가격으로 과금)
     = 208 + 2,734 = 2,942 tokens
     = 2,942 × $12.00 / 1M = $0.035304

총 비용: $0.0744 ≈ ₩104
```

### 숨겨진 비용 분석

```
URL Context:  $0.0326 (44%)
Thinking:     $0.0328 (44%)
프롬프트:     $0.0065 (9%)
출력:         $0.0025 (3%)
─────────────────────────────
총 비용:      $0.0744 (100%)
```

> **실제 프롬프트와 출력은 전체 비용의 12%**에 불과하고, **88%가 URL Context와 Thinking**에서 발생합니다.

---

## 권장 사항

### 사용 시나리오별 권장 모델

| 시나리오       | 권장 모델        | 이유           |
| -------------- | ---------------- | -------------- |
| 비용 최적화    | Gemini 2.5 Flash | 28배 저렴      |
| 실시간 응답    | Gemini 2.5 Flash | 5.5배 빠름     |
| 코드 단순화    | Gemini 3 Pro     | 단일 호출      |
| 정보 품질 우선 | Gemini 3 Pro     | 더 상세한 추출 |
| 대량 배치 처리 | Gemini 2.5 Flash | 비용 효율      |

### 비용 최적화 팁

1. **URL 개수 최소화**: URL당 약 4,000~5,500 토큰 소비
2. **Thinking 비활성화**: Gemini 2.5에서 `thinkingBudget: 0` 설정
3. **2단계 호출 사용**: Gemini 2.5 Flash로 비용 절감
4. **캐싱 고려**: 동일 URL 재요청 시 결과 캐싱

---

## 결론

1. **URL Context 토큰은 입력 토큰으로 과금**됩니다 (`toolUsePromptTokenCount`).

2. **Gemini 2.5 Flash가 가장 경제적**입니다 (₩3.73 vs ₩104).

3. **URL Context는 전체 비용의 70~80%**를 차지합니다.

4. **Gemini 3 Pro의 숨겨진 비용** (URL Context + Thinking)이 **전체의 88%**입니다.

5. **대량 처리에는 Gemini 2.5 Flash 2단계 호출** 방식을 권장합니다.

---

## 참고 링크

- [Gemini 가격 정책](https://ai.google.dev/gemini-api/docs/pricing)
- [URL Context 문서](https://ai.google.dev/gemini-api/docs/url-context)
- [Gemini 3 문서](https://ai.google.dev/gemini-api/docs/gemini-3)

## 테스트 스크립트

```bash
npx tsx scripts/test-product-description.ts
```

설정 변경:

```typescript
// scripts/test-product-description.ts
const MODEL = "gemini-2.5-flash"; // 또는 "gemini-3-pro-preview"
const THINKING_BUDGET = 0; // Gemini 2.5용
const THINKING_LEVEL = "low"; // Gemini 3용 ("low" | "high")
```

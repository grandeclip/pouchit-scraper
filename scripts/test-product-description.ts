/**
 * 상품 설명 생성 테스트 스크립트
 *
 * URL Context + Structured Output을 사용하여
 * 브랜드/상품의 마케팅 설명 및 카테고리를 생성합니다.
 *
 * 사용법:
 *   npx tsx scripts/test-product-description.ts
 *
 * @note 모델: gemini-2.5-flash (기본)
 * @note thinking budget: 0 (기본)
 * @note 결과가 부정확하면:
 *   1. thinking budget 증가 (예: 1024, 2048)
 *   2. 모델 변경 (gemini-2.5-pro)
 *
 * @important URL Context와 Structured Output은 동시 사용 불가
 *            → 2단계 호출 방식 사용:
 *            1단계: URL Context로 정보 추출 (텍스트)
 *            2단계: Structured Output으로 정형화 (JSON)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Schema } from "@google/genai";
import { ProductDescriptionSchema } from "@/llm/schemas/ProductDescriptionSchema";
import type { ProductDescriptionResult } from "@/llm/schemas/ProductDescriptionSchema";
import {
  buildProductDescriptionSystemPrompt,
  buildProductDescriptionUserPrompt,
} from "@/llm/prompts/productDescriptionPrompt";

// ============================================
// 설정
// ============================================

/** 사용할 모델 (결과에 따라 조절) */
const MODEL = "gemini-2.5-flash";
// const MODEL = "gemini-3-pro-preview";

/** Thinking level for Gemini 3 ("low" | "high") */
const THINKING_LEVEL: "low" | "high" = "low";

/** Thinking budget for Gemini 2.5 (0 = 비활성화, 필요시 1024, 2048 등으로 증가) */
const THINKING_BUDGET = 0;

/** 비용 계산 (모델별) */
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gemini-2.5-flash": {
    inputPer1M: 0.15,
    outputPer1M: 0.6,
  },
  "gemini-2.5-pro-preview": {
    inputPer1M: 1.25,
    outputPer1M: 10.0,
  },
  "gemini-3-pro-preview": {
    inputPer1M: 2.0,
    outputPer1M: 12.0, // thinking tokens 포함
  },
};

// ============================================
// 테스트 데이터
// ============================================

interface TestCase {
  brand: string;
  product_name: string;
  urls: string[];
}

/**
 * 테스트 케이스
 *
 * 실제 화장품 상품 페이지 URL 사용
 */
const TEST_CASES: TestCase[] = [
  {
    brand: "토리든",
    product_name: "다이브인 저분자 히알루론산 세럼",
    urls: [
      // oliveyoung - 2025 어워즈 한정기획
      "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000238213",
      // zigzag - 직잭픽
      "https://zigzag.kr/catalog/products/131281148",
      // musinsa - 단품 50ml
      "https://www.musinsa.com/products/2582843",
    ],
  },
  // 추가 테스트 케이스는 아래에 추가
];

// ============================================
// 유틸리티 함수
// ============================================

/**
 * Zod 스키마를 Gemini responseSchema 형식으로 변환
 */
function convertToResponseSchema(
  zodSchema: typeof ProductDescriptionSchema,
): Schema {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    $refStrategy: "none",
    target: "openApi3",
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...schemaWithoutMeta } = jsonSchema as Record<
    string,
    unknown
  >;
  return schemaWithoutMeta as Schema;
}

/**
 * 비용 계산 (모델별)
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[MODEL] ?? PRICING["gemini-2.5-flash"];
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

// ============================================
// 메인 로직
// ============================================

/**
 * Gemini 3: URL Context + Structured Output 단일 호출
 */
async function generateWithGemini3(
  client: GoogleGenAI,
  testCase: TestCase,
): Promise<{
  result: ProductDescriptionResult;
  urlMetadata: unknown;
  usage: { input: number; output: number };
}> {
  const systemPrompt = buildProductDescriptionSystemPrompt();
  const userPrompt = buildProductDescriptionUserPrompt(
    testCase.brand,
    testCase.product_name,
    testCase.urls,
  );
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  console.log("\n  [단일 호출] URL Context + Structured Output...");

  const responseSchema = convertToResponseSchema(ProductDescriptionSchema);

  const response = await client.models.generateContent({
    model: MODEL,
    contents: fullPrompt,
    config: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema,
      tools: [{ urlContext: {} }],
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error("API 응답에 텍스트가 없습니다.");
  }

  const result: ProductDescriptionResult = JSON.parse(responseText);
  const urlMetadata = response.candidates?.[0]?.urlContextMetadata;
  const rawUsageMetadata = response.usageMetadata;

  // Raw usageMetadata 출력 (thinking tokens 확인용)
  console.log("\n    📊 Raw usageMetadata:");
  console.log(JSON.stringify(rawUsageMetadata, null, 2));

  const usage = {
    input: rawUsageMetadata?.promptTokenCount ?? 0,
    output: rawUsageMetadata?.candidatesTokenCount ?? 0,
  };

  console.log(`    ✓ 완료 (${usage.input + usage.output} tokens)`);

  return { result, urlMetadata, usage };
}

/**
 * 1단계: URL Context로 정보 추출 (Gemini 2.5용)
 */
async function extractInfoWithUrlContext(
  client: GoogleGenAI,
  testCase: TestCase,
): Promise<{
  text: string;
  urlMetadata: unknown;
  usage: { input: number; output: number };
}> {
  const extractionPrompt = `다음 URL들에서 "${testCase.brand} ${testCase.product_name}" 상품에 대한 정보를 추출해주세요.

## 분석할 URL
${testCase.urls.map((url, i) => `${i + 1}. ${url}`).join("\n")}

## 추출할 정보
1. 상품의 핵심 기능/효능
2. 주요 성분 (있으면)
3. 마케팅 문구나 캐치프레이즈
4. 상품 카테고리 정보
5. 타겟 피부 고민

정보를 요약하여 정리해주세요.`;

  console.log("\n  [1단계] URL Context로 정보 추출 중...");

  const response = await client.models.generateContent({
    model: MODEL,
    contents: extractionPrompt,
    config: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 4096,
      tools: [{ urlContext: {} }],
      ...(MODEL.includes("2.5") && {
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      }),
    },
  });

  const text = response.text ?? "";
  const urlMetadata = response.candidates?.[0]?.urlContextMetadata;
  const rawUsageMetadata = response.usageMetadata;

  // Raw usageMetadata 출력 (URL Context 토큰 확인용)
  console.log("\n    📊 [1단계] Raw usageMetadata:");
  console.log(JSON.stringify(rawUsageMetadata, null, 2));

  const usage = {
    input: rawUsageMetadata?.promptTokenCount ?? 0,
    output: rawUsageMetadata?.candidatesTokenCount ?? 0,
    toolUse:
      (rawUsageMetadata as Record<string, unknown>)?.toolUsePromptTokenCount ??
      0,
  };

  console.log(
    `    ✓ 추출 완료 (prompt: ${usage.input}, output: ${usage.output}, toolUse: ${usage.toolUse})`,
  );

  return { text, urlMetadata, usage };
}

/**
 * 2단계: Structured Output으로 정형화
 */
async function generateStructuredOutput(
  client: GoogleGenAI,
  testCase: TestCase,
  extractedInfo: string,
): Promise<{
  result: ProductDescriptionResult;
  usage: { input: number; output: number };
}> {
  const systemPrompt = buildProductDescriptionSystemPrompt();

  const structuredPrompt = `${systemPrompt}

## 추출된 상품 정보
${extractedInfo}

## 요청 상품
- 브랜드: ${testCase.brand}
- 상품명: ${testCase.product_name}

위 정보를 바탕으로 상품 설명과 카테고리를 생성해주세요.`;

  console.log("\n  [2단계] Structured Output 생성 중...");

  const responseSchema = convertToResponseSchema(ProductDescriptionSchema);

  const response = await client.models.generateContent({
    model: MODEL,
    contents: structuredPrompt,
    config: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema,
      ...(MODEL.includes("2.5") && {
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      }),
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error("API 응답에 텍스트가 없습니다.");
  }

  const result: ProductDescriptionResult = JSON.parse(responseText);
  const rawUsageMetadata = response.usageMetadata;

  // Raw usageMetadata 출력
  console.log("\n    📊 [2단계] Raw usageMetadata:");
  console.log(JSON.stringify(rawUsageMetadata, null, 2));

  const usage = {
    input: rawUsageMetadata?.promptTokenCount ?? 0,
    output: rawUsageMetadata?.candidatesTokenCount ?? 0,
  };

  console.log(
    `    ✓ 생성 완료 (prompt: ${usage.input}, output: ${usage.output})`,
  );

  return { result, usage };
}

async function testProductDescription(testCase: TestCase): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log(
    "🔍 상품 설명 생성 테스트 (2단계: URL Context → Structured Output)",
  );
  console.log("=".repeat(70));

  console.log("\n📥 입력:");
  console.log(`  브랜드: ${testCase.brand}`);
  console.log(`  상품명: ${testCase.product_name}`);
  console.log(`  URL 개수: ${testCase.urls.length}`);
  testCase.urls.forEach((url, i) => console.log(`    [${i + 1}] ${url}`));

  // API 키 확인
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("\n❌ GEMINI_API_KEY가 설정되지 않았습니다.");
    process.exit(1);
  }

  const isGemini3 = MODEL.includes("gemini-3");

  console.log("\n⏳ Gemini API 호출 중...");
  console.log(`  모델: ${MODEL}`);
  if (isGemini3) {
    console.log(`  Thinking Level: ${THINKING_LEVEL}`);
    console.log(`  모드: 단일 호출 (URL Context + Structured Output)`);
  } else {
    console.log(`  Thinking Budget: ${THINKING_BUDGET}`);
    console.log(`  모드: 2단계 호출`);
  }

  const startTime = Date.now();

  try {
    const client = new GoogleGenAI({ apiKey });

    let result: ProductDescriptionResult;
    let urlMetadata: unknown;
    let totalInput: number;
    let totalOutput: number;
    let toolUseTokens = 0;

    if (isGemini3) {
      // Gemini 3: 단일 호출
      const response = await generateWithGemini3(client, testCase);
      result = response.result;
      urlMetadata = response.urlMetadata;
      totalInput = response.usage.input;
      totalOutput = response.usage.output;
    } else {
      // Gemini 2.5: 2단계 호출
      const extracted = await extractInfoWithUrlContext(client, testCase);
      const structured = await generateStructuredOutput(
        client,
        testCase,
        extracted.text,
      );
      result = structured.result;
      urlMetadata = extracted.urlMetadata;
      totalInput = extracted.usage.input + structured.usage.input;
      totalOutput = extracted.usage.output + structured.usage.output;
      toolUseTokens = extracted.usage.toolUse as number;

      // 추출된 정보 요약 출력 (2단계 모드에서만)
      console.log("\n  📄 1단계 추출 정보 (요약):");
      const summary = extracted.text.substring(0, 500);
      console.log(`    ${summary}${extracted.text.length > 500 ? "..." : ""}`);
    }

    const elapsed = Date.now() - startTime;

    // 결과 출력
    console.log("\n📤 결과:");
    console.log("\n  📝 상품 설명:");
    console.log(`    "${result.description}"`);

    console.log("\n  📁 카테고리:");
    console.log(`    ID: ${result.category.id}`);
    console.log(`    경로: ${result.category.path}`);

    // URL Context 메타데이터 출력
    if (urlMetadata) {
      console.log("\n  🌐 URL Context 메타데이터:");
      console.log(JSON.stringify(urlMetadata, null, 2));
    }

    // 토큰 & 비용 정보
    // URL Context 토큰은 입력 토큰으로 과금됨
    const effectiveInput = totalInput + toolUseTokens;
    const totalTokens = effectiveInput + totalOutput;
    const cost = calculateCost(effectiveInput, totalOutput);

    console.log("\n💰 토큰 & 비용 정보:");
    console.log(`  모델: ${MODEL}`);
    console.log(`  프롬프트 토큰: ${totalInput.toLocaleString()}`);
    if (toolUseTokens > 0) {
      console.log(`  URL Context 토큰: ${toolUseTokens.toLocaleString()}`);
      console.log(
        `  실제 입력 토큰: ${effectiveInput.toLocaleString()} (프롬프트 + URL Context)`,
      );
    }
    console.log(`  출력 토큰: ${totalOutput.toLocaleString()}`);
    console.log(`  총 토큰: ${totalTokens.toLocaleString()}`);
    console.log(
      `  비용: $${cost.toFixed(6)} (약 ₩${(cost * 1400).toFixed(2)})`,
    );
    console.log(`  소요 시간: ${elapsed}ms`);

    // Raw JSON 출력
    console.log("\n📋 Raw JSON:");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n" + "=".repeat(70));
    console.log("✅ 테스트 완료");
    console.log("=".repeat(70) + "\n");
  } catch (err) {
    console.error("\n❌ 에러 발생:", err);

    // 에러 상세 정보
    if (err instanceof Error) {
      console.error("  메시지:", err.message);
      if (err.cause) {
        console.error("  원인:", err.cause);
      }
    }

    process.exit(1);
  }
}

// ============================================
// 엔트리포인트
// ============================================

async function main(): Promise<void> {
  const isGemini3 = MODEL.includes("gemini-3");

  console.log("\n🚀 상품 설명 생성 테스트 시작\n");
  console.log("📌 설정:");
  console.log(`  - 모델: ${MODEL}`);
  if (isGemini3) {
    console.log(`  - Thinking Level: ${THINKING_LEVEL}`);
    console.log(`  - 모드: 단일 호출 (URL Context + Structured Output 동시)`);
  } else {
    console.log(`  - Thinking Budget: ${THINKING_BUDGET}`);
    console.log(`  - 모드: 2단계 호출 (URL Context → Structured Output)`);
  }
  console.log(`  - URL Context: 활성화`);
  console.log(`  - Structured Output: 활성화`);

  for (const testCase of TEST_CASES) {
    await testProductDescription(testCase);
  }
}

main().catch(console.error);

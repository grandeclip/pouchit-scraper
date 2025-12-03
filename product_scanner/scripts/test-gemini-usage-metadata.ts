/**
 * Gemini API 응답 구조 및 비용 측정 테스트
 *
 * 목적: API 응답에서 토큰 사용량(usageMetadata) 확인
 *
 * 사용법:
 *   npx tsx scripts/test-gemini-usage-metadata.ts
 *
 * 환경변수:
 *   - GEMINI_API_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { normalizeProductPrompt } from "@/llm/prompts/normalizeProductPrompt";
import { classificationPrompt } from "@/llm/prompts/classificationPrompt";

// ============================================
// Gemini API 전체 응답 인터페이스
// ============================================

interface GeminiFullResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
      role?: string;
    };
    finishReason?: string;
    avgLogprobs?: number;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    promptTokensDetails?: Array<{
      modality: string;
      tokenCount: number;
    }>;
    candidatesTokensDetails?: Array<{
      modality: string;
      tokenCount: number;
    }>;
  };
  modelVersion?: string;
}

// ============================================
// Gemini 가격 (2024-12 기준, USD)
// ============================================

interface GeminiPricing {
  model: string;
  inputPer1M: number; // USD per 1M input tokens
  outputPer1M: number; // USD per 1M output tokens
}

const GEMINI_PRICING: Record<string, GeminiPricing> = {
  "gemini-2.5-flash": {
    model: "gemini-2.5-flash",
    inputPer1M: 0.15, // $0.15 per 1M input tokens
    outputPer1M: 0.6, // $0.60 per 1M output tokens (non-thinking)
  },
  "gemini-2.0-flash": {
    model: "gemini-2.0-flash",
    inputPer1M: 0.1,
    outputPer1M: 0.4,
  },
  "gemini-1.5-flash": {
    model: "gemini-1.5-flash",
    inputPer1M: 0.075,
    outputPer1M: 0.3,
  },
};

// ============================================
// API 호출 함수 (전체 응답 반환)
// ============================================

async function fetchGeminiFullResponse(
  userPrompt: string,
  systemPrompt?: string,
  model = "gemini-2.5-flash",
): Promise<GeminiFullResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수 필요");
  }

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  const apiUrl = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const combinedPrompt = systemPrompt
    ? `${systemPrompt}\n\n${userPrompt}`
    : userPrompt;

  const requestBody = {
    contents: [
      {
        parts: [{ text: combinedPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `API 오류 ${response.status}: ${JSON.stringify(errorData)}`,
    );
  }

  return response.json();
}

// ============================================
// 비용 계산
// ============================================

function calculateCost(
  usage: GeminiFullResponse["usageMetadata"],
  model: string,
): { inputCost: number; outputCost: number; totalCost: number } | null {
  if (!usage) return null;

  const pricing = GEMINI_PRICING[model] || GEMINI_PRICING["gemini-2.5-flash"];

  const inputCost = (usage.promptTokenCount / 1_000_000) * pricing.inputPer1M;
  const outputCost =
    (usage.candidatesTokenCount / 1_000_000) * pricing.outputPer1M;
  const totalCost = inputCost + outputCost;

  return { inputCost, outputCost, totalCost };
}

// ============================================
// 테스트 실행
// ============================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Gemini API 응답 구조 및 비용 측정 테스트");
  console.log("=".repeat(60));

  const testProductName =
    "[1+1] 에스티로더 더블웨어 파운데이션 SPF10 30ml 본품 + 미니어처 7ml 증정";

  // ─────────────────────────────────────────
  // 테스트 1: 상품명 정규화 (normalizeProductPrompt)
  // ─────────────────────────────────────────
  console.log("\n📦 테스트 1: 상품명 정규화");
  console.log("-".repeat(60));

  try {
    const normalizeResponse = await fetchGeminiFullResponse(
      `상품명: ${testProductName}`,
      normalizeProductPrompt,
    );

    console.log("\n🔍 전체 응답 구조:");
    console.log(JSON.stringify(normalizeResponse, null, 2));

    console.log("\n📊 usageMetadata:");
    if (normalizeResponse.usageMetadata) {
      const usage = normalizeResponse.usageMetadata;
      console.log(`  - promptTokenCount: ${usage.promptTokenCount}`);
      console.log(`  - candidatesTokenCount: ${usage.candidatesTokenCount}`);
      console.log(`  - totalTokenCount: ${usage.totalTokenCount}`);

      if (usage.promptTokensDetails) {
        console.log("  - promptTokensDetails:");
        usage.promptTokensDetails.forEach((d) => {
          console.log(`      ${d.modality}: ${d.tokenCount}`);
        });
      }

      const cost = calculateCost(usage, "gemini-2.5-flash");
      if (cost) {
        console.log("\n💰 비용 계산 (gemini-2.5-flash 기준):");
        console.log(`  - Input cost:  $${cost.inputCost.toFixed(8)}`);
        console.log(`  - Output cost: $${cost.outputCost.toFixed(8)}`);
        console.log(`  - Total cost:  $${cost.totalCost.toFixed(8)}`);
        console.log(
          `  - 1000건 처리 시: $${(cost.totalCost * 1000).toFixed(4)}`,
        );
        console.log(
          `  - 10000건 처리 시: $${(cost.totalCost * 10000).toFixed(4)}`,
        );
      }
    } else {
      console.log("  ⚠️ usageMetadata 없음");
    }

    console.log("\n📄 modelVersion:", normalizeResponse.modelVersion);
  } catch (error) {
    console.error("❌ 테스트 1 실패:", error);
  }

  // ─────────────────────────────────────────
  // 테스트 2: 라벨 분류 (classificationPrompt)
  // ─────────────────────────────────────────
  console.log("\n\n📦 테스트 2: 라벨 분류");
  console.log("-".repeat(60));

  try {
    const labelResponse = await fetchGeminiFullResponse(
      `상품명: 에스티로더 더블웨어 파운데이션 SPF10 30ml`,
      classificationPrompt,
    );

    console.log("\n📊 usageMetadata:");
    if (labelResponse.usageMetadata) {
      const usage = labelResponse.usageMetadata;
      console.log(`  - promptTokenCount: ${usage.promptTokenCount}`);
      console.log(`  - candidatesTokenCount: ${usage.candidatesTokenCount}`);
      console.log(`  - totalTokenCount: ${usage.totalTokenCount}`);

      const cost = calculateCost(usage, "gemini-2.5-flash");
      if (cost) {
        console.log("\n💰 비용 계산 (gemini-2.5-flash 기준):");
        console.log(`  - Input cost:  $${cost.inputCost.toFixed(8)}`);
        console.log(`  - Output cost: $${cost.outputCost.toFixed(8)}`);
        console.log(`  - Total cost:  $${cost.totalCost.toFixed(8)}`);
      }
    }

    // 결과 텍스트 확인
    const resultText = labelResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (resultText) {
      console.log("\n📝 응답 결과:");
      console.log(resultText);
    }
  } catch (error) {
    console.error("❌ 테스트 2 실패:", error);
  }

  // ─────────────────────────────────────────
  // 요약
  // ─────────────────────────────────────────
  console.log("\n\n" + "=".repeat(60));
  console.log("📋 요약: Gemini API 응답에 포함되는 주요 필드");
  console.log("=".repeat(60));
  console.log(`
  GeminiFullResponse {
    candidates: [{
      content: { parts: [{ text: "..." }], role: "model" },
      finishReason: "STOP" | "MAX_TOKENS" | ...,
      avgLogprobs: number
    }],
    usageMetadata: {
      promptTokenCount: number,      // 입력 토큰 수
      candidatesTokenCount: number,  // 출력 토큰 수
      totalTokenCount: number,       // 총 토큰 수
      promptTokensDetails: [...],    // 상세 (modality별)
      candidatesTokensDetails: [...]
    },
    modelVersion: "gemini-2.5-flash-preview-05-20"
  }
  `);

  console.log("💡 비용 측정을 위해 usageMetadata 활용 가능");
  console.log("   → 현재 GeminiApiClient는 이 데이터를 무시하고 있음");
  console.log("   → 비용 추적 필요 시 반환 타입 확장 필요\n");
}

main().catch(console.error);

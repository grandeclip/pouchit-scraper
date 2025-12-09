/**
 * Product Filtering 테스트 스크립트
 *
 * 사용법:
 *   npx tsx scripts/test-product-filtering.ts
 *
 * 하드코딩된 예제로 테스트 실행
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenAIClient } from "@/llm/GoogleGenAIClient";
import { ProductFilteringSchema } from "@/llm/schemas";
import type { ProductFilteringResult } from "@/llm/schemas";
import { productFilteringPrompt } from "@/llm/prompts/productFilteringPrompt";

// ============================================
// 비용 계산
// ============================================

interface GeminiPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const GEMINI_PRICING: Record<string, GeminiPricing> = {
  "gemini-2.5-flash": {
    inputPer1M: 0.15,
    outputPer1M: 0.6,
  },
  "gemini-2.5-pro-preview": {
    inputPer1M: 1.25,
    outputPer1M: 10.0,
  },
};

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = GEMINI_PRICING[model] ?? GEMINI_PRICING["gemini-2.5-flash"];
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}

// ============================================
// 테스트 데이터
// ============================================

interface TestCase {
  brand: string;
  product_name: string;
  product_names: Record<string, string[]>;
}

const TEST_CASE: TestCase = {
  brand: "토리든",
  product_name: "다이브인 저분자 히알루론산 세럼",
  product_names: {
    ably: [
      "토리든 다이브인 저분자 히알루론산 세럼 50ml(+밸런스풀시카컨트롤세럼10ml미니어쳐증정)",
      "토리든 다이브인 저분자 히알루론산 멀티패드 80매(+밸런스풀시카컨트롤세럼10ml미니어쳐증정)",
      "토리든 다이브인 저분자 히알루론산 토너 300ml(+밸런스풀시카컨트롤세럼10ml미니어쳐증정)",
    ],
    oliveyoung: [
      "[2025 어워즈] 토리든 다이브인 저분자 히알루론산 세럼 100ml 어워즈 한정기획",
      "[1등세럼/단독기획] 토리든 다이브인 저분자 히알루론산 세럼 50ml 기획(+멀티패드 10매)",
      "[NEW/단독기획] 토리든 밸런스풀 시카 컨트롤 세럼 50ml 기획 (+크림 20ml)",
    ],
    zigzag: [
      "[직잭픽] 토리든 다이브인 저분자 히알루론산 세럼 50ml+( 다이브인 세럼 2ml*3매)",
      "[2종세트] 토리든 다이브인 저분자 히알루론산 세럼 50ml+40ml (+다이브인 수딩크림 2ml 5매+다이브인 마스크 1매)",
      "[직잭픽] [SET] 토리든 밸런스풀 시카 컨트롤 세럼 50ml + 밸런스풀 진정 크림 80ml (+시카 진정 세럼 10ml+진정크림 20ml)",
    ],
  },
};

// ============================================
// 메인 로직
// ============================================

async function filterProducts(testCase: TestCase): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 Product Filtering Test");
  console.log("=".repeat(60));

  console.log("\n📥 입력:");
  console.log(`  brand: "${testCase.brand}"`);
  console.log(`  product_name: "${testCase.product_name}"`);
  console.log(`  platforms: ${Object.keys(testCase.product_names).join(", ")}`);

  // 각 플랫폼별 상품 출력
  for (const [platform, products] of Object.entries(testCase.product_names)) {
    console.log(`\n  📦 ${platform}:`);
    products.forEach((p, i) => console.log(`    [${i}] ${p}`));
  }

  const client = new GoogleGenAIClient();
  const model = "gemini-2.5-flash";

  const userPrompt = `brand: "${testCase.brand}"
product_name: "${testCase.product_name}"
product_names: ${JSON.stringify(testCase.product_names, null, 2)}`;

  console.log("\n⏳ LLM 호출 중...");
  const startTime = Date.now();

  try {
    const response =
      await client.generateStructuredOutput<ProductFilteringResult>({
        model,
        systemPrompt: productFilteringPrompt,
        userPrompt,
        schema: ProductFilteringSchema,
        thinkingBudget: 0,
      });

    const elapsed = Date.now() - startTime;

    // Raw Output
    console.log("\n📤 LLM 출력 (Raw JSON):");
    console.log(JSON.stringify(response.result, null, 2));

    // 플랫폼별 유효 인덱스 맵 생성
    const validIndicesMap = new Map<string, Set<number>>();
    for (const { platform, valid_indices } of response.result.platforms) {
      validIndicesMap.set(platform, new Set(valid_indices));
    }

    // 유효한 상품 출력
    console.log("\n✅ 유효한 상품:");
    for (const { platform, valid_indices } of response.result.platforms) {
      const products = testCase.product_names[platform] ?? [];
      console.log(`\n  📦 ${platform}:`);
      if (valid_indices.length === 0) {
        console.log("    (없음)");
      } else {
        valid_indices.forEach((idx) => {
          const product = products[idx] ?? "(인덱스 오류)";
          console.log(`    [${idx}] ${product}`);
        });
      }
    }

    // 무효한 상품 출력
    console.log("\n❌ 무효한 상품 (필터링됨):");
    for (const [platform, products] of Object.entries(testCase.product_names)) {
      const validIndices = validIndicesMap.get(platform) ?? new Set();
      const hasInvalid = products.some((_, i) => !validIndices.has(i));

      if (hasInvalid) {
        console.log(`\n  📦 ${platform}:`);
        products.forEach((p, i) => {
          if (!validIndices.has(i)) {
            console.log(`    [${i}] ${p}`);
          }
        });
      }
    }

    // 토큰 & 비용 정보
    const { usage } = response;
    const cost = calculateCost(
      model,
      usage.promptTokenCount,
      usage.candidatesTokenCount,
    );

    console.log("\n💰 토큰 & 비용 정보:");
    console.log(`  모델: ${model}`);
    console.log(`  입력 토큰: ${usage.promptTokenCount.toLocaleString()}`);
    console.log(`  출력 토큰: ${usage.candidatesTokenCount.toLocaleString()}`);
    console.log(`  총 토큰: ${usage.totalTokenCount.toLocaleString()}`);
    console.log(
      `  비용: $${cost.toFixed(6)} (약 ₩${(cost * 1400).toFixed(2)})`,
    );
    console.log(`  소요 시간: ${elapsed}ms`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ 테스트 완료");
    console.log("=".repeat(60) + "\n");
  } catch (err) {
    console.error("\n❌ 에러 발생:", err);
    process.exit(1);
  }
}

// ============================================
// 엔트리포인트
// ============================================

async function main(): Promise<void> {
  await filterProducts(TEST_CASE);
}

main().catch(console.error);

/**
 * Product Set Parsing 테스트 스크립트
 *
 * 사용법:
 *   npx tsx scripts/test-product-set-parsing.ts "[직잭픽] 토리든 다이브인 저분자 히알루론산 세럼 50ml+( 다이브인 세럼 2ml*3매)" "다이브인 저분자 히알루론산 세럼"
 *
 * 또는 대화형 모드:
 *   npx tsx scripts/test-product-set-parsing.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as readline from "readline";
import { GoogleGenAIClient } from "@/llm/GoogleGenAIClient";
import { ProductSetParsingSchema } from "@/llm/schemas";
import type { ProductSetParsingResult } from "@/llm/schemas";
import { productSetParsingPrompt } from "@/llm/prompts/productSetParsingPrompt";
import { buildProductSetColumns } from "@/llm/postprocessors/productSetPostprocessor";

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
// 메인 로직
// ============================================

async function parseProductSet(
  productName: string,
  mainProductName: string,
): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 Product Set Parsing Test");
  console.log("=".repeat(60));

  console.log("\n📥 입력:");
  console.log(`  product_name: "${productName}"`);
  console.log(`  main_product_name: "${mainProductName}"`);

  const client = new GoogleGenAIClient();
  const model = "gemini-2.5-flash";

  const userPrompt = `product_name: "${productName}"
main_product_name: "${mainProductName}"`;

  console.log("\n⏳ LLM 호출 중...");
  const startTime = Date.now();

  try {
    const response =
      await client.generateStructuredOutput<ProductSetParsingResult>({
        model,
        systemPrompt: productSetParsingPrompt,
        userPrompt,
        schema: ProductSetParsingSchema,
        thinkingBudget: 0, // thinking 비활성화
      });

    const elapsed = Date.now() - startTime;

    // Raw Output
    console.log("\n📤 LLM 출력 (Raw JSON):");
    console.log(JSON.stringify(response.result, null, 2));

    // Postprocessing 결과
    const columns = buildProductSetColumns(response.result);
    console.log("\n📊 Postprocessing 결과:");
    console.log(`  set_name: "${columns.set_name}"`);
    console.log(`  sanitized_item_name: "${columns.sanitized_item_name}"`);
    console.log(`  structured_item_name: "${columns.structured_item_name}"`);

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

async function interactiveMode(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log("\n🎯 Product Set Parsing 대화형 테스트");
  console.log("종료하려면 Ctrl+C를 누르세요.\n");

  while (true) {
    const productName = await question("product_name: ");
    if (!productName.trim()) continue;

    const mainProductName = await question("main_product_name: ");
    if (!mainProductName.trim()) continue;

    await parseProductSet(productName.trim(), mainProductName.trim());
  }
}

// ============================================
// 엔트리포인트
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length >= 2) {
    // CLI 인자 모드
    const [productName, mainProductName] = args;
    await parseProductSet(productName, mainProductName);
  } else if (args.length === 1) {
    console.error("❌ main_product_name 인자가 필요합니다.");
    console.error(
      "사용법: npx tsx scripts/test-product-set-parsing.ts <product_name> <main_product_name>",
    );
    process.exit(1);
  } else {
    // 대화형 모드
    await interactiveMode();
  }
}

main().catch(console.error);

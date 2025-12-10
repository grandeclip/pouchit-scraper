/**
 * Product Set Parsing 테스트 (ID 기반)
 *
 * product_set_id를 입력받아 DB에서 정보를 조회하고 LLM 파싱 실행
 *
 * 사용법:
 *   npx tsx scripts/test-product-set-parsing-by-id.ts <product_set_id>
 *
 * 예시:
 *   npx tsx scripts/test-product-set-parsing-by-id.ts 12345
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAIClient } from "@/llm/GoogleGenAIClient";
import { ProductSetParsingSchema } from "@/llm/schemas";
import type { ProductSetParsingResult } from "@/llm/schemas";
import { productSetParsingPrompt } from "@/llm/prompts/productSetParsingPrompt";
import { buildProductSetColumns } from "@/llm/postprocessors/productSetPostprocessor";

// ============================================
// Supabase 클라이언트
// ============================================

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 환경변수에 설정되지 않았습니다.",
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

// ============================================
// DB 조회
// ============================================

interface ProductSetInfo {
  product_set_id: string;
  product_name: string;
  product_id: string;
}

interface ProductInfo {
  product_id: string;
  name: string;
}

async function fetchProductSetById(
  client: SupabaseClient,
  productSetId: string,
): Promise<ProductSetInfo | null> {
  const { data, error } = await client
    .from("product_sets")
    .select("product_set_id, product_name, product_id")
    .eq("product_set_id", productSetId)
    .single();

  if (error) {
    console.error("❌ product_sets 조회 실패:", error.message);
    return null;
  }

  return data as ProductSetInfo;
}

async function fetchProductById(
  client: SupabaseClient,
  productId: string,
): Promise<ProductInfo | null> {
  const { data, error } = await client
    .from("products")
    .select("product_id, name")
    .eq("product_id", productId)
    .single();

  if (error) {
    console.error("❌ products 조회 실패:", error.message);
    return null;
  }

  return data as ProductInfo;
}

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

async function parseProductSetById(productSetId: string): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 Product Set Parsing Test (ID 기반)");
  console.log("=".repeat(60));

  // 1. Supabase 클라이언트 초기화
  const supabase = getSupabaseClient();
  console.log("\n✅ Supabase 연결 완료");

  // 2. product_sets 조회
  console.log(`\n📥 product_sets 조회 (id: ${productSetId})...`);
  const productSet = await fetchProductSetById(supabase, productSetId);

  if (!productSet) {
    console.error(`❌ product_set_id ${productSetId}를 찾을 수 없습니다.`);
    process.exit(1);
  }

  console.log(`  product_set_id: ${productSet.product_set_id}`);
  console.log(`  product_name: "${productSet.product_name}"`);
  console.log(`  product_id: ${productSet.product_id}`);

  // 3. products 조회
  console.log(`\n📥 products 조회 (id: ${productSet.product_id})...`);
  const product = await fetchProductById(supabase, productSet.product_id);

  if (!product) {
    console.error(`❌ product_id ${productSet.product_id}를 찾을 수 없습니다.`);
    process.exit(1);
  }

  console.log(`  name (main_product_name): "${product.name}"`);

  // 4. LLM 호출
  const llmClient = new GoogleGenAIClient();
  const model = "gemini-2.5-flash";

  const userPrompt = `product_name: "${productSet.product_name}"
main_product_name: "${product.name}"`;

  console.log("\n⏳ LLM 호출 중...");
  const startTime = Date.now();

  try {
    const response =
      await llmClient.generateStructuredOutput<ProductSetParsingResult>({
        model,
        systemPrompt: productSetParsingPrompt,
        userPrompt,
        schema: ProductSetParsingSchema,
        thinkingBudget: 0,
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
    console.log(`  volume: ${columns.volume}`);
    console.log(
      `  volume_unit: ${columns.volume_unit ? `"${columns.volume_unit}"` : null}`,
    );

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
    console.error("\n❌ LLM 호출 에러:", err);
    process.exit(1);
  }
}

// ============================================
// 엔트리포인트
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("❌ product_set_id 인자가 필요합니다.");
    console.error(
      "사용법: npx tsx scripts/test-product-set-parsing-by-id.ts <product_set_id>",
    );
    process.exit(1);
  }

  const productSetId = args[0].trim();

  if (!productSetId) {
    console.error("❌ product_set_id가 비어있습니다.");
    process.exit(1);
  }

  await parseProductSetById(productSetId);
}

main().catch(console.error);

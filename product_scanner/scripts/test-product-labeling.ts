/**
 * Product Labeling 테스트 스크립트
 *
 * product_set_id를 입력받아 product_name을 조회하고,
 * Gemini API를 사용하여 normalized_product_name과 label을 생성합니다.
 *
 * 사용법:
 *   npx tsx scripts/test-product-labeling.ts <product_set_id>
 *
 * 예시:
 *   npx tsx scripts/test-product-labeling.ts abc123-def456
 */

import { SupabaseProductRepository } from "@/repositories/SupabaseProductRepository";
import { processProductLabeling } from "@/llm";

async function main(): Promise<void> {
  const productSetId = process.argv[2];

  if (!productSetId) {
    console.error("❌ product_set_id를 입력해주세요.");
    console.error(
      "사용법: npx tsx scripts/test-product-labeling.ts <product_set_id>",
    );
    process.exit(1);
  }

  // GEMINI_API_KEY 확인
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  console.log(`\n🔍 조회 중: product_set_id = ${productSetId}\n`);

  try {
    // 1. Supabase에서 product_name 조회
    const repository = new SupabaseProductRepository();
    const product = await repository.findById(productSetId);

    if (!product) {
      console.error(
        `❌ product_set_id "${productSetId}"에 해당하는 제품을 찾을 수 없습니다.`,
      );
      process.exit(1);
    }

    const productName = product.product_name;
    console.log(`📦 product_name: ${productName}\n`);

    // 2. LLM으로 normalized_product_name, label 생성
    console.log("🤖 Gemini API 호출 중...\n");
    const result = await processProductLabeling(productName);

    // 3. 결과 출력
    console.log("✅ 결과:");
    console.log("─".repeat(50));
    console.log(JSON.stringify(result, null, 2));
    console.log("─".repeat(50));

    console.log(`\n📋 요약:`);
    console.log(`  - product_name:            ${result.productName}`);
    console.log(
      `  - normalized_product_name: ${result.normalizedProductName || "(빈 문자열)"}`,
    );
    console.log(`  - label:                   ${result.label}`);
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

main();

/**
 * Product Labeling 업데이트 스크립트
 *
 * product_set_id를 입력받아 product_name을 조회하고,
 * Gemini API를 사용하여 normalized_product_name과 label을 생성한 후
 * test_normalized_product_name과 test_label 컬럼에 저장합니다.
 *
 * 사용법:
 *   npx tsx scripts/update-product-labeling.ts <product_set_id>
 *
 * 환경변수:
 *   - GEMINI_API_KEY: Gemini API 키
 *   - SUPABASE_URL: Supabase URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Supabase 서비스 롤 키
 */

import { createClient } from "@supabase/supabase-js";
import { SupabaseProductRepository } from "@/repositories/SupabaseProductRepository";
import { processProductLabeling } from "@/llm";

async function main(): Promise<void> {
  const productSetId = process.argv[2];

  if (!productSetId) {
    console.error("❌ product_set_id를 입력해주세요.");
    console.error(
      "사용법: npx tsx scripts/update-product-labeling.ts <product_set_id>",
    );
    process.exit(1);
  }

  // 환경변수 확인
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
    );
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

    if (!productName) {
      console.error("❌ product_name이 비어있습니다.");
      process.exit(1);
    }

    // 2. LLM으로 normalized_product_name, label 생성
    console.log("🤖 Gemini API 호출 중...\n");
    const result = await processProductLabeling(productName);

    console.log("✅ LLM 결과:");
    console.log("─".repeat(50));
    console.log(
      `  normalized_product_name: ${result.normalizedProductName || "(빈 문자열)"}`,
    );
    console.log(`  label: ${result.label}`);
    console.log("─".repeat(50));

    // 3. Supabase에 테스트 컬럼 업데이트
    console.log("\n💾 DB 업데이트 중...");

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { error } = await supabase
      .from("product_sets")
      .update({
        test_normalized_product_name: result.normalizedProductName,
        test_label: result.label,
      })
      .eq("product_set_id", productSetId);

    if (error) {
      console.error("❌ DB 업데이트 실패:", error.message);
      process.exit(1);
    }

    console.log("✅ DB 업데이트 완료!\n");

    // 4. 최종 결과 요약
    console.log("📋 최종 요약:");
    console.log("─".repeat(50));
    console.log(`  product_set_id:               ${productSetId}`);
    console.log(`  product_name:                 ${productName}`);
    console.log(
      `  test_normalized_product_name: ${result.normalizedProductName || "(빈 문자열)"}`,
    );
    console.log(`  test_label:                   ${result.label}`);
    console.log("─".repeat(50));
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

main();

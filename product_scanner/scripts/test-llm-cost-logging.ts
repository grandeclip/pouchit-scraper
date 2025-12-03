/**
 * LLM 비용 로깅 테스트
 *
 * processProductLabelingWithUsage를 사용하여 비용 로깅을 테스트합니다.
 *
 * 사용법:
 *   npx tsx scripts/test-llm-cost-logging.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  processProductLabelingWithUsage,
  logLlmCost,
  getTodayCostStats,
} from "@/llm";

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("LLM 비용 로깅 테스트");
  console.log("=".repeat(60));

  const testProducts = [
    "[1+1] 에스티로더 더블웨어 파운데이션 SPF10 30ml 본품 + 미니어처 7ml 증정",
    "설화수 자음생크림 60ml 리필",
    "라네즈 워터뱅크 크림 50ml",
  ];

  console.log("\n📦 테스트 상품:", testProducts.length, "개\n");

  for (let i = 0; i < testProducts.length; i++) {
    const productName = testProducts[i];
    console.log(
      `\n[${i + 1}/${testProducts.length}] ${productName.substring(0, 40)}...`,
    );

    try {
      const result = await processProductLabelingWithUsage(productName);

      console.log("  ✅ 성공");
      console.log(`     normalized: ${result.normalizedProductName}`);
      console.log(`     label: ${result.label}`);
      console.log(
        `     tokens: ${result.totalInputTokens} in / ${result.totalOutputTokens} out`,
      );

      // 비용 로깅
      for (const usage of result.usages) {
        logLlmCost({
          job_id: "test-job-001",
          platform: "test",
          product_set_id: `test-product-${i + 1}`,
          operation: usage.operation,
          model: usage.model,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        });
      }
    } catch (error) {
      console.log(
        "  ❌ 실패:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // 오늘 비용 통계
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 오늘 비용 통계");
  console.log("=".repeat(60));

  const stats = getTodayCostStats();
  console.log(`\n총 비용: $${stats.total_cost_usd.toFixed(6)}`);
  console.log(`총 레코드: ${stats.total_records}개`);
  console.log(`총 입력 토큰: ${stats.total_input_tokens}`);
  console.log(`총 출력 토큰: ${stats.total_output_tokens}`);

  console.log("\n작업별:");
  for (const [op, data] of Object.entries(stats.by_operation)) {
    console.log(`  ${op}: ${data.count}건, $${data.cost_usd.toFixed(6)}`);
  }

  console.log("\n플랫폼별:");
  for (const [platform, data] of Object.entries(stats.by_platform)) {
    console.log(`  ${platform}: ${data.count}건, $${data.cost_usd.toFixed(6)}`);
  }

  // JSONL 파일 위치 안내
  const dateStr = new Date().toISOString().split("T")[0];
  console.log(
    `\n📁 비용 로그 파일: results/${dateStr}/llm_cost__${dateStr}.jsonl`,
  );
}

main().catch(console.error);

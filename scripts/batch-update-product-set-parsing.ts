/**
 * Product Set Parsing 배치 업데이트 스크립트
 *
 * 모든 product_sets에 대해 (product_name이 있는 경우)
 * LLM 파싱을 수행하여 set_name, sanitized_item_name, structured_item_name 컬럼을 업데이트합니다.
 *
 * 사용법:
 *   npx tsx scripts/batch-update-product-set-parsing.ts [LIMIT]
 *
 * 예시:
 *   npx tsx scripts/batch-update-product-set-parsing.ts        # 전체 실행
 *   npx tsx scripts/batch-update-product-set-parsing.ts 100    # 100개만 실행
 *
 * 환경변수:
 *   - GEMINI_API_KEY
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

// 배치 실행 시 로그 최소화 (모듈 import 전에 설정)
process.env.LOG_LEVEL = "error";

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ProductSetParsingService } from "@/llm/ProductSetParsingService";
import { buildProductSetColumns } from "@/llm/postprocessors/productSetPostprocessor";
import type { GenAIUsageMetadata } from "@/llm/GoogleGenAIClient";

// Gemini 2.5 Flash 가격 (per 1M tokens)
const PRICE_INPUT_PER_1M = 0.3;
const PRICE_OUTPUT_PER_1M = 2.5;

/**
 * 토큰 사용량으로 비용 계산
 */
function calculateCost(usage: GenAIUsageMetadata): number {
  const inputCost = (usage.promptTokenCount / 1_000_000) * PRICE_INPUT_PER_1M;
  const outputCost =
    (usage.candidatesTokenCount / 1_000_000) * PRICE_OUTPUT_PER_1M;
  return inputCost + outputCost;
}

interface ProductSetRow {
  product_set_id: string;
  product_name: string | null;
  product_id: string | null;
}

interface ProductRow {
  product_id: string;
  name: string;
}

interface BatchStats {
  total: number;
  processed: number;
  success: number;
  skipped: number;
  failed: number;
  startTime: number;
  totalCost: number;
}

/**
 * 시간 포맷팅 (ms → 읽기 쉬운 형식)
 */
function formatTime(ms: number): string {
  if (ms < 60000) {
    return `${Math.ceil(ms / 1000)}초`;
  } else if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.ceil((ms % 60000) / 1000);
    return `${mins}분 ${secs}초`;
  } else {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.ceil((ms % 3600000) / 60000);
    return `${hours}시간 ${mins}분`;
  }
}

/**
 * 경과 시간 및 예상 종료 시간 계산
 */
function getTimeStats(stats: BatchStats): { elapsed: string; eta: string } {
  const elapsedMs = Date.now() - stats.startTime;
  const elapsed = formatTime(elapsedMs);

  if (stats.processed === 0) {
    return { elapsed, eta: "계산 중..." };
  }

  const avgTimePerItem = elapsedMs / stats.processed;
  const remaining = stats.total - stats.processed;
  const etaMs = remaining * avgTimePerItem;

  return { elapsed, eta: formatTime(etaMs) };
}

/**
 * 진행 상태 출력
 */
function printProgress(
  stats: BatchStats,
  currentId: string,
  status: "✓" | "✗" | "-",
): void {
  const percent = ((stats.processed / stats.total) * 100).toFixed(1);
  const { elapsed, eta } = getTimeStats(stats);
  const shortId = currentId.substring(0, 8);
  const cost = stats.totalCost.toFixed(4);

  process.stdout.write(
    `\r[${stats.processed}/${stats.total}] ${percent}% | ${status} ${shortId}... | ⏱${elapsed} → ${eta} | ✓${stats.success} -${stats.skipped} ✗${stats.failed} | $${cost}   `,
  );
}

/**
 * 대상 product_sets 조회 (pagination으로 전체 조회)
 */
async function fetchTargetProductSets(
  supabase: SupabaseClient,
  limit?: number,
): Promise<ProductSetRow[]> {
  const PAGE_SIZE = 1000;
  const allProducts: ProductSetRow[] = [];
  let offset = 0;
  let hasMore = true;

  // limit 지정시 해당 개수만 조회
  if (limit) {
    const { data, error } = await supabase
      .from("product_sets")
      .select("product_set_id, product_name, product_id")
      // .not("product_name", "is", null)
      // .neq("product_name", "")
      // .not("product_id", "is", null)
      .limit(limit);

    if (error) {
      throw new Error(`product_sets 조회 실패: ${error.message}`);
    }
    return data || [];
  }

  // limit 미지정시 pagination으로 전체 조회
  while (hasMore) {
    const { data, error } = await supabase
      .from("product_sets")
      .select("product_set_id, product_name, product_id")
      // .not("product_name", "is", null)
      // .neq("product_name", "")
      // .not("product_id", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`product_sets 조회 실패: ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allProducts.push(...data);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
      process.stdout.write(`\r   ${allProducts.length}개 조회됨...`);
    }
  }

  console.log();
  return allProducts;
}

/**
 * products 테이블에서 name 조회 (캐싱용 Map 반환)
 */
async function fetchProductNames(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  const uniqueIds = [...new Set(productIds)];
  const PAGE_SIZE = 500;

  for (let i = 0; i < uniqueIds.length; i += PAGE_SIZE) {
    const chunk = uniqueIds.slice(i, i + PAGE_SIZE);
    const { data, error } = await supabase
      .from("products")
      .select("product_id, name")
      .in("product_id", chunk);

    if (error) {
      console.warn(`products 조회 경고: ${error.message}`);
      continue;
    }

    if (data) {
      for (const row of data as ProductRow[]) {
        nameMap.set(row.product_id, row.name);
      }
    }

    process.stdout.write(
      `\r   products 조회: ${Math.min(i + PAGE_SIZE, uniqueIds.length)}/${uniqueIds.length}`,
    );
  }

  console.log();
  return nameMap;
}

/**
 * 단일 product_set 업데이트
 */
async function updateSingleProductSet(
  supabase: SupabaseClient,
  parsingService: ProductSetParsingService,
  productSet: ProductSetRow,
  mainProductName: string | undefined,
): Promise<{ success: boolean; skipped: boolean; cost: number }> {
  try {
    if (!productSet.product_name) {
      return { success: false, skipped: true, cost: 0 };
    }

    // main_product_name이 없으면 빈 문자열로 처리
    const mainName = mainProductName || "";

    const response = await parsingService.parse({
      productName: productSet.product_name,
      mainProductName: mainName,
    });

    const cost = calculateCost(response.usage);

    // Postprocessing
    const columns = buildProductSetColumns(response.result);

    // DB 업데이트
    const { error: updateError } = await supabase
      .from("product_sets")
      .update({
        set_name: columns.set_name,
        sanitized_item_name: columns.sanitized_item_name,
        structured_item_name: columns.structured_item_name,
        volume: columns.volume,
        volume_unit: columns.volume_unit,
      })
      .eq("product_set_id", productSet.product_set_id);

    if (updateError) {
      return { success: false, skipped: false, cost };
    }

    // 업데이트 검증 (select로 확인)
    const { data: verified, error: verifyError } = await supabase
      .from("product_sets")
      .select("set_name")
      .eq("product_set_id", productSet.product_set_id)
      .single();

    if (verifyError || verified?.set_name !== columns.set_name) {
      return { success: false, skipped: false, cost };
    }

    return { success: true, skipped: false, cost };
  } catch {
    return { success: false, skipped: false, cost: 0 };
  }
}

async function main(): Promise<void> {
  const limitArg = process.argv[2];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  // 환경변수 확인
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY 필요");
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const parsingService = new ProductSetParsingService();

  console.log("\n" + "═".repeat(60));
  console.log("🔄 Product Set Parsing 배치 업데이트");
  console.log("   업데이트 컬럼: set_name, sanitized_item_name,");
  console.log("                  structured_item_name, volume, volume_unit");
  console.log("═".repeat(60));

  // 1. product_sets 조회
  console.log(
    `\n📦 product_sets 조회 중... (product_name 있는 데이터${limit ? `, LIMIT ${limit}` : ""})`,
  );

  const productSets = await fetchTargetProductSets(supabase, limit);

  if (productSets.length === 0) {
    console.log("📭 대상 상품이 없습니다.");
    process.exit(0);
  }

  // 2. products 이름 조회 (캐싱)
  console.log(`\n📋 products 이름 조회 중...`);
  const productIds = productSets
    .map((ps) => ps.product_id)
    .filter((id): id is string => id !== null);
  const productNameMap = await fetchProductNames(supabase, productIds);

  console.log(`\n🚀 총 ${productSets.length}개 처리 시작\n`);

  const stats: BatchStats = {
    total: productSets.length,
    processed: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    startTime: Date.now(),
    totalCost: 0,
  };

  // 순차 처리
  for (const productSet of productSets) {
    const mainProductName = productSet.product_id
      ? productNameMap.get(productSet.product_id)
      : undefined;

    const result = await updateSingleProductSet(
      supabase,
      parsingService,
      productSet,
      mainProductName,
    );

    stats.processed++;
    stats.totalCost += result.cost;

    if (result.skipped) {
      stats.skipped++;
      printProgress(stats, productSet.product_set_id, "-");
    } else if (result.success) {
      stats.success++;
      printProgress(stats, productSet.product_set_id, "✓");
    } else {
      stats.failed++;
      printProgress(stats, productSet.product_set_id, "✗");
    }
  }

  // 최종 결과
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const avgTime = (
    (Date.now() - stats.startTime) /
    stats.processed /
    1000
  ).toFixed(2);

  console.log(`\n\n${"═".repeat(60)}`);
  console.log(`✅ 완료!`);
  console.log(`${"─".repeat(60)}`);
  console.log(`   총 처리: ${stats.total}개`);
  console.log(`   성공: ${stats.success}개`);
  console.log(`   스킵: ${stats.skipped}개`);
  console.log(`   실패: ${stats.failed}개`);
  console.log(`${"─".repeat(60)}`);
  console.log(`   소요 시간: ${elapsed}초 (평균 ${avgTime}초/건)`);
  console.log(
    `   총 비용: $${stats.totalCost.toFixed(4)} (약 ₩${(stats.totalCost * 1400).toFixed(0)})`,
  );
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((error) => {
  console.error("\n❌ 오류:", error.message);
  process.exit(1);
});

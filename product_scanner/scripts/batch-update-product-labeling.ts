/**
 * Product Labeling 배치 업데이트 스크립트
 *
 * sale_status가 'on_sale'인 모든 상품에 대해 LLM 라벨링을 수행합니다.
 *
 * 사용법:
 *   npx tsx scripts/batch-update-product-labeling.ts [LIMIT]
 *
 * 예시:
 *   npx tsx scripts/batch-update-product-labeling.ts        # 전체 실행
 *   npx tsx scripts/batch-update-product-labeling.ts 100    # 100개만 실행
 *
 * 환경변수:
 *   - GEMINI_API_KEY
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { processProductLabeling } from "@/llm";

interface ProductSetRow {
  product_set_id: string;
  product_name: string | null;
}

interface BatchStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
  startTime: number;
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
  status: "✓" | "✗",
): void {
  const percent = ((stats.processed / stats.total) * 100).toFixed(1);
  const { elapsed, eta } = getTimeStats(stats);
  const shortId = currentId.substring(0, 8);

  // 한 줄로 출력 (carriage return으로 덮어쓰기)
  process.stdout.write(
    `\r[${stats.processed}/${stats.total}] ${percent}% | ${status} ${shortId}... | ⏱${elapsed} → ${eta} | ✓${stats.success} ✗${stats.failed}   `,
  );
}

/**
 * 대상 상품 조회 (pagination으로 전체 조회)
 */
async function fetchTargetProducts(
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
      .select("product_set_id, product_name")
      .eq("sale_status", "on_sale")
      .not("product_name", "is", null)
      .limit(limit);

    if (error) {
      throw new Error(`조회 실패: ${error.message}`);
    }
    return data || [];
  }

  // limit 미지정시 pagination으로 전체 조회
  while (hasMore) {
    const { data, error } = await supabase
      .from("product_sets")
      .select("product_set_id, product_name")
      .eq("sale_status", "on_sale")
      .not("product_name", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`조회 실패: ${error.message}`);
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

  console.log(); // 줄바꿈
  return allProducts;
}

/**
 * 단일 상품 업데이트
 */
async function updateSingleProduct(
  supabase: SupabaseClient,
  product: ProductSetRow,
): Promise<boolean> {
  try {
    if (!product.product_name) {
      return false;
    }

    const result = await processProductLabeling(product.product_name);

    const { error } = await supabase
      .from("product_sets")
      .update({
        test_normalized_product_name: result.normalizedProductName,
        test_label: result.label,
      })
      .eq("product_set_id", product.product_set_id);

    if (error) {
      return false;
    }

    return true;
  } catch {
    return false;
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

  // 대상 조회
  console.log(
    `\n🔍 대상 조회 중... (sale_status='on_sale'${limit ? `, LIMIT ${limit}` : ""})`,
  );

  const products = await fetchTargetProducts(supabase, limit);

  if (products.length === 0) {
    console.log("📭 대상 상품이 없습니다.");
    process.exit(0);
  }

  console.log(`📦 총 ${products.length}개 상품 처리 시작\n`);

  const stats: BatchStats = {
    total: products.length,
    processed: 0,
    success: 0,
    failed: 0,
    startTime: Date.now(),
  };

  // 순차 처리
  for (const product of products) {
    const success = await updateSingleProduct(supabase, product);

    stats.processed++;
    if (success) {
      stats.success++;
    } else {
      stats.failed++;
    }

    printProgress(stats, product.product_set_id, success ? "✓" : "✗");
  }

  // 최종 결과
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log(`\n\n${"─".repeat(50)}`);
  console.log(`✅ 완료!`);
  console.log(`   총 처리: ${stats.total}개`);
  console.log(`   성공: ${stats.success}개`);
  console.log(`   실패: ${stats.failed}개`);
  console.log(`   소요 시간: ${elapsed}초`);
  console.log(`${"─".repeat(50)}\n`);
}

main().catch((error) => {
  console.error("\n❌ 오류:", error.message);
  process.exit(1);
});

/**
 * Daily Planning Product Sync 테스트 스크립트
 *
 * products 테이블을 순회하며 새로운 기획상품을 자동 등록합니다.
 *
 * 사용법:
 *   npx tsx scripts/daily-planning-product-sync.ts [OPTIONS]
 *
 * 옵션:
 *   --dry-run             실제 INSERT/enqueue 없이 시뮬레이션만 실행
 *   --product-id <id>     특정 product_id만 처리 (쉼표로 여러 개 지정 가능)
 *   --batch-size <n>      배치 크기 (기본값: 10)
 *   --delay <ms>          요청 간 딜레이 (기본값: 2000ms)
 *
 * 예시:
 *   npx tsx scripts/daily-planning-product-sync.ts --dry-run
 *   npx tsx scripts/daily-planning-product-sync.ts --product-id abc123
 *   npx tsx scripts/daily-planning-product-sync.ts --product-id abc123,def456 --dry-run
 *   npx tsx scripts/daily-planning-product-sync.ts --batch-size 5 --delay 3000
 *
 * 환경변수:
 *   - GEMINI_API_KEY
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - REDIS_HOST (optional, default: localhost)
 *   - REDIS_PORT (optional, default: 6379)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  DailyPlanningProductSyncService,
  type SyncConfig,
  type SyncResult,
} from "@/services/DailyPlanningProductSyncService";

// ============================================
// CLI 인자 파싱
// ============================================

function parseArgs(): SyncConfig {
  const args = process.argv.slice(2);
  const config: SyncConfig = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--dry-run") {
      config.dryRun = true;
    } else if (arg === "--product-id" && args[i + 1]) {
      // --product-id value 형식
      config.productIds = args[++i].split(",").map((id) => id.trim());
    } else if (arg.startsWith("--product-id=")) {
      // --product-id=value 형식
      const value = arg.substring("--product-id=".length);
      config.productIds = value.split(",").map((id) => id.trim());
    } else if (arg === "--batch-size" && args[i + 1]) {
      config.batchSize = parseInt(args[++i], 10);
    } else if (arg.startsWith("--batch-size=")) {
      config.batchSize = parseInt(arg.substring("--batch-size=".length), 10);
    } else if (arg === "--delay" && args[i + 1]) {
      config.delayMs = parseInt(args[++i], 10);
    } else if (arg.startsWith("--delay=")) {
      config.delayMs = parseInt(arg.substring("--delay=".length), 10);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return config;
}

function printUsage(): void {
  console.log(`
Daily Planning Product Sync

사용법:
  npx tsx scripts/daily-planning-product-sync.ts [OPTIONS]

옵션:
  --dry-run             실제 INSERT/enqueue 없이 시뮬레이션만 실행
  --product-id <id>     특정 product_id만 처리 (쉼표로 여러 개 지정 가능)
  --batch-size <n>      배치 크기 (기본값: 10)
  --delay <ms>          요청 간 딜레이 (기본값: 2000ms)
  --help, -h            이 도움말 출력

예시:
  npx tsx scripts/daily-planning-product-sync.ts --dry-run
  npx tsx scripts/daily-planning-product-sync.ts --product-id abc123
  npx tsx scripts/daily-planning-product-sync.ts --product-id abc123,def456 --dry-run
`);
}

// ============================================
// 결과 출력
// ============================================

function printResult(result: SyncResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("동기화 결과");
  console.log("=".repeat(60));

  console.log(`
총 처리 Products:     ${result.totalProducts}
  - 성공:             ${result.successCount}
  - 스킵:             ${result.skippedCount}
  - 실패:             ${result.failedCount}

신규 Product Sets:    ${result.newProductSetsCount}
Enqueued Jobs:        ${result.enqueuedJobsCount}

소요 시간:            ${(result.durationMs / 1000).toFixed(2)}s
`);

  if (result.errors.length > 0) {
    console.log("에러 목록:");
    for (const error of result.errors) {
      console.log(`  - ${error.product_id}: ${error.error}`);
    }
  }

  console.log("=".repeat(60) + "\n");
}

// ============================================
// 메인 실행
// ============================================

async function main(): Promise<void> {
  const config = parseArgs();

  console.log("\n" + "=".repeat(60));
  console.log("Daily Planning Product Sync");
  console.log("=".repeat(60));
  console.log(`설정:`);
  console.log(`  - Dry Run:      ${config.dryRun ?? false}`);
  console.log(`  - Batch Size:   ${config.batchSize ?? 10}`);
  console.log(`  - Delay:        ${config.delayMs ?? 2000}ms`);
  if (config.productIds) {
    console.log(`  - Product IDs:  ${config.productIds.join(", ")}`);
  }
  console.log("=".repeat(60) + "\n");

  try {
    const service = new DailyPlanningProductSyncService();
    const result = await service.sync(config);
    printResult(result);

    // 에러가 있으면 exit code 1
    if (result.failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("동기화 실패:", error);
    process.exit(1);
  }
}

main().catch(console.error);

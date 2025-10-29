/**
 * Hwahae Data Validator
 *
 * CSV 데이터와 API 응답을 비교하여 차이점을 검증하는 스크립트
 *
 * 리팩토링 완료: 새로운 아키텍처 (HwahaeScanService) 사용
 */

import * as fs from "fs";
import * as path from "path";
import { HwahaeScanService } from "@/services/HwahaeScanService";
import {
  ValidationRequest,
  ValidationResult,
} from "@/core/domain/HwahaeConfig";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * CSV 행 데이터 구조
 */
interface CsvProduct {
  product_set_id: string;
  product_id: string;
  platform_id: string;
  product_name: string;
  link_url: string;
  md_pick: string;
  created_at: string;
  updated_at: string;
  thumbnail: string | null;
  normalized_product_name: string | null;
  label: string | null;
  volume: string | null;
  volume_unit: string | null;
  sale_status: string;
  original_price: string | null;
  discounted_price: string | null;
}

/**
 * 비교 결과 (확장)
 */
interface ExtendedComparisonResult extends ValidationResult {
  csv_data: CsvProduct;
  elapsed_time?: number; // 처리 시간 (ms)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * link_url에서 goods_id 추출
 * 예: https://www.hwahae.co.kr/goods/61560 → 61560
 */
function extractGoodsId(linkUrl: string): string | null {
  const match = linkUrl.match(/\/goods\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * CSV 파일 파싱
 */
function parseCsv(filePath: string): CsvProduct[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");

  // 헤더 제거
  const [header, ...rows] = lines;

  return rows.map((row) => {
    const columns = row.split(",");
    return {
      product_set_id: columns[0] || "",
      product_id: columns[1] || "",
      platform_id: columns[2] || "",
      product_name: columns[3] || "",
      link_url: columns[4] || "",
      md_pick: columns[5] || "false",
      created_at: columns[6] || "",
      updated_at: columns[7] || "",
      thumbnail: columns[8] || null,
      normalized_product_name: columns[9] || null,
      label: columns[10] || null,
      volume: columns[11] || null,
      volume_unit: columns[12] || null,
      sale_status: columns[13] || "",
      original_price: columns[14] || null,
      discounted_price: columns[15] || null,
    };
  });
}

/**
 * 1초 대기 (rate limiting)
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 진행률 표시 헬퍼
 */
function displayProgress(current: number, total: number, status: string): void {
  const percentage = ((current / total) * 100).toFixed(1);
  const barLength = 30;
  const filled = Math.round((current / total) * barLength);
  const bar = "█".repeat(filled) + "░".repeat(barLength - filled);

  process.stdout.write(
    `\r[${bar}] ${percentage}% (${current}/${total}) - ${status}`,
  );
}

/**
 * CSV를 ValidationRequest로 변환
 */
function csvToValidationRequest(
  csvProduct: CsvProduct,
  goodsId: string,
): ValidationRequest {
  return {
    goodsId,
    productName: csvProduct.product_name,
    thumbnail: csvProduct.thumbnail || "",
    originalPrice: csvProduct.original_price
      ? parseInt(csvProduct.original_price)
      : 0,
    discountedPrice: csvProduct.discounted_price
      ? parseInt(csvProduct.discounted_price)
      : 0,
    saleStatus: csvProduct.sale_status,
  };
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("🚀 Hwahae Data Validator Starting...\n");
  console.log("📝 Using New Architecture (HwahaeScanService)\n");

  // CSV 파일 경로
  const csvPath = path.join(
    __dirname,
    "..",
    "assets",
    "data",
    "hwahae_sample.csv",
  );

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  // CSV 파싱
  console.log(`📂 Reading CSV: ${csvPath}`);
  const csvProducts = parseCsv(csvPath);
  console.log(`✅ Parsed ${csvProducts.length} products from CSV\n`);

  // 서비스 초기화
  console.log("🔧 Initializing HwahaeScanService...");
  const service = new HwahaeScanService();
  const strategies = service.getAvailableStrategies();
  console.log(`✅ Available strategies: ${strategies.join(", ")}\n`);

  // 결과 저장
  const results: ExtendedComparisonResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  console.log("🔍 Starting validation process...\n");

  // 각 상품에 대해 검증 실행
  for (let i = 0; i < csvProducts.length; i++) {
    const csvProduct = csvProducts[i];
    const goodsId = extractGoodsId(csvProduct.link_url);

    // 진행률 표시
    displayProgress(
      i + 1,
      csvProducts.length,
      `Processing goods_id: ${goodsId || "unknown"}`,
    );

    // goods_id 추출 실패
    if (!goodsId) {
      errorCount++;
      results.push({
        success: false,
        goodsId: "unknown",
        productName: csvProduct.product_name,
        differences: [],
        summary: {
          totalFields: 0,
          matchedFields: 0,
          mismatchedFields: 0,
        },
        error: "Cannot extract goods_id from link_url",
        csv_data: csvProduct,
      });
      await sleep(1000); // 1초 대기
      continue;
    }

    // ValidationRequest 생성
    const validationRequest = csvToValidationRequest(csvProduct, goodsId);

    // 검증 실행 (새 아키텍처 사용)
    const startTime = Date.now();
    let result: ValidationResult;

    try {
      result = await service.validateProduct(
        goodsId,
        validationRequest,
        "api", // API 전략 사용
      );

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (error) {
      // 예외 발생 시 에러 메시지로 처리
      errorCount++;
      result = {
        success: false,
        goodsId,
        productName: csvProduct.product_name,
        differences: [],
        summary: {
          totalFields: 0,
          matchedFields: 0,
          mismatchedFields: 0,
        },
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during validation",
      };
    }

    const elapsedTime = Date.now() - startTime;

    // 확장된 결과 저장
    results.push({
      ...result,
      csv_data: csvProduct,
      elapsed_time: elapsedTime,
    });

    // Rate limiting: 1초 대기
    await sleep(1000);
  }

  // 진행률 완료
  console.log("\n");

  // ============================================================================
  // Summary Report
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log("📊 VALIDATION SUMMARY");
  console.log("=".repeat(80));

  console.log(`\n📈 Status Distribution:`);
  console.log(`   ✅ Success:    ${successCount}`);
  console.log(`   ❌ Error:      ${errorCount}`);
  console.log(`   📦 Total:      ${results.length}`);

  // 필드별 불일치 통계
  console.log(`\n📋 Field Mismatch Statistics:`);
  const fieldStats: Record<string, number> = {};

  results.forEach((result) => {
    result.differences.forEach((diff) => {
      if (!diff.matched) {
        fieldStats[diff.field] = (fieldStats[diff.field] || 0) + 1;
      }
    });
  });

  if (Object.keys(fieldStats).length > 0) {
    Object.entries(fieldStats)
      .sort(([, a], [, b]) => b - a)
      .forEach(([field, count]) => {
        console.log(`   - ${field}: ${count} mismatches`);
      });
  } else {
    console.log(`   ✅ No field mismatches found!`);
  }

  // 에러 타입 통계
  console.log(`\n⚠️  Error Statistics:`);
  const errorStats: Record<string, number> = {};

  results
    .filter((r) => !r.success)
    .forEach((result) => {
      const errorType = result.error || "Validation Failed";
      errorStats[errorType] = (errorStats[errorType] || 0) + 1;
    });

  if (Object.keys(errorStats).length > 0) {
    Object.entries(errorStats)
      .sort(([, a], [, b]) => b - a)
      .forEach(([errorType, count]) => {
        console.log(`   - ${errorType}: ${count} occurrences`);
      });
  } else {
    console.log(`   ✅ No errors!`);
  }

  // 평균 처리 시간
  const avgTime =
    results.reduce((sum, r) => sum + (r.elapsed_time || 0), 0) / results.length;
  console.log(`\n⏱️  Average Processing Time: ${avgTime.toFixed(0)}ms`);

  // 결과를 JSON 파일로 저장
  const outputDir = path.join(__dirname, "..", "results", "hwahae");
  const outputPath = path.join(outputDir, "validation-results.json");

  // 디렉토리가 없으면 생성
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);

  // 리소스 정리
  console.log(`\n🧹 Cleaning up resources...`);
  await service.cleanup();

  console.log("\n✅ Validation Complete!\n");
}

// Run
main().catch((error) => {
  console.error("Fatal Error:", error);
  process.exit(1);
});

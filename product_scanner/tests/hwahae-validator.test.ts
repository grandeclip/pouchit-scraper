/**
 * 화해 검증 테스트 코드
 * 예시 row 데이터를 사용하여 필드 매핑 및 검증 결과 출력
 *
 * 리팩토링 완료: 새로운 아키텍처 (Strategy Pattern + SOLID) 사용
 */

import { HwahaeScanService } from "@/services/HwahaeScanService";
import { ValidationRequest } from "@/core/domain/HwahaeConfig";

/**
 * CSV Row 데이터 파싱
 */
interface CsvRow {
  product_set_id: string;
  product_id: string;
  platform_id: string;
  product_name: string;
  link_url: string;
  md_pick: boolean;
  created_at: string;
  updated_at: string;
  thumbnail: string;
  normalized_product_name: string;
  label: string;
  volume: number;
  volume_unit: string;
  sale_status: string;
  original_price: number;
  discounted_price: number;
}

/**
 * goods_id 추출 (link_url에서)
 */
function extractGoodsId(linkUrl: string): string | null {
  const match = linkUrl.match(/\/goods\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * CSV Row를 ValidationRequest로 변환
 */
function csvToValidationRequest(row: CsvRow): ValidationRequest {
  const goodsId = extractGoodsId(row.link_url);
  if (!goodsId) {
    throw new Error("Cannot extract goods_id from link_url");
  }

  return {
    goodsId,
    productName: row.product_name,
    thumbnail: row.thumbnail,
    originalPrice: row.original_price,
    discountedPrice: row.discounted_price,
    saleStatus: row.sale_status,
  };
}

/**
 * 메인 테스트 함수
 */
async function testValidation() {
  console.log("🚀 화해 검증 테스트 시작\n");

  // 예시 CSV Row 데이터
  const csvRow: CsvRow = {
    product_set_id: "35539c46-f364-4175-b533-48d6362eb9ae",
    product_id: "6dba6741-f140-45d5-a602-2a16571eff83",
    platform_id: "2a623b9f-fda7-409b-9391-f239fb72e04a",
    product_name: "블랙 쿠션 파운데이션 본품 15g+리필 15g [21N1 바닐라]",
    link_url: "https://www.hwahae.co.kr/goods/61560",
    md_pick: false,
    created_at: "2025-06-25 06:49:41.46663+00",
    updated_at: "2025-10-24 00:24:59.447+00",
    thumbnail:
      "https://img.hwahae.co.kr/commerce/goods/20240401_101447_1_21n1.jpg?format=webp&size=600x600&fit=inside",
    normalized_product_name: "리필",
    label: "리필",
    volume: 15,
    volume_unit: "g",
    sale_status: "on_sale",
    original_price: 74000,
    discounted_price: 66600,
  };

  try {
    // 1. 서비스 생성
    console.log("📂 화해 스캔 서비스 초기화...");
    const service = new HwahaeScanService();
    const strategies = service.getAvailableStrategies();
    console.log(`✅ 사용 가능한 전략: ${strategies.join(", ")}\n`);

    // 2. ValidationRequest 생성
    const validationRequest = csvToValidationRequest(csvRow);
    console.log("📋 CSV 데이터:");
    console.log(`  - goodsId: ${validationRequest.goodsId}`);
    console.log(`  - productName: ${validationRequest.productName}`);
    console.log(`  - thumbnail: ${validationRequest.thumbnail}`);
    console.log(`  - originalPrice: ${validationRequest.originalPrice}`);
    console.log(`  - discountedPrice: ${validationRequest.discountedPrice}`);
    console.log(`  - saleStatus: ${validationRequest.saleStatus}\n`);

    // 3. 검증 수행 (Strategy: API - 기본 전략)
    console.log("🔍 상품 검증 중 (전략: API)...\n");
    const result = await service.validateProduct(
      validationRequest.goodsId,
      validationRequest,
      "api", // 명시적으로 API 전략 사용
    );

    // 6. 결과 출력
    console.log("=".repeat(80));
    console.log("📊 검증 결과");
    console.log("=".repeat(80));
    console.log(`\n✅ 성공: ${result.success ? "YES" : "NO"}`);
    console.log(`📋 상품명: ${result.productName}`);
    console.log(
      `📈 통계: ${result.summary.matchedFields}/${result.summary.totalFields} 일치 (불일치: ${result.summary.mismatchedFields})\n`,
    );

    console.log("🔍 필드별 상세:");
    result.differences.forEach((diff) => {
      const icon = diff.matched ? "✅" : "❌";
      console.log(`\n  ${icon} ${diff.field}:`);
      console.log(`     CSV: ${JSON.stringify(diff.csvValue)}`);
      console.log(`     API: ${JSON.stringify(diff.apiValue)}`);
      if (diff.message) {
        console.log(`     💬 ${diff.message}`);
      }
    });

    console.log("\n" + "=".repeat(80));
    console.log("✅ 테스트 완료!\n");

    // 리소스 정리
    await service.cleanup();
  } catch (error) {
    console.error("\n❌ 테스트 실패:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// 실행
testValidation();

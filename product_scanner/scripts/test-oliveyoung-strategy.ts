#!/usr/bin/env tsx

/**
 * 올리브영 전략 검증 스크립트
 * 3가지 케이스 테스트:
 * 1. 정상 판매 상품
 * 2. 품절 상품
 * 3. 삭제된 상품
 */

import { ConfigLoader } from "@/config/ConfigLoader";
import { ScannerRegistry } from "@/services/ScannerRegistry";

const TEST_CASES = [
  {
    name: "정상 판매 상품",
    goodsNo: "A000000231822",
    expected: {
      sale_status: "SELNG",
      hasName: true,
      hasPrice: true,
    },
  },
  {
    name: "품절 상품",
    goodsNo: "A000000207761",
    expected: {
      sale_status: "SLDOT",
      hasName: true,
      hasPrice: true,
    },
  },
  {
    name: "삭제된 상품",
    goodsNo: "A000000228859",
    expected: {
      sale_status: "STSEL",
      hasName: true, // "삭제된 상품"이라는 placeholder 이름 존재
      hasPrice: false, // 가격은 0
    },
  },
];

async function testOliveyoungStrategy() {
  console.log("🧪 올리브영 전략 검증 시작\n");

  const platform = "oliveyoung";

  try {
    // 1. Config 로드
    console.log("📋 Config 로드...");
    const config = ConfigLoader.getInstance().loadConfig(platform);
    console.log(`✅ Platform: ${config.platform}`);
    console.log(`✅ Name: ${config.name}`);
    console.log(`✅ Strategies: ${config.strategies.length}개\n`);

    // 2. 각 케이스 테스트
    let passCount = 0;
    let failCount = 0;

    for (const testCase of TEST_CASES) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📦 테스트: ${testCase.name}`);
      console.log(`🔗 goodsNo: ${testCase.goodsNo}`);
      console.log(`${"=".repeat(60)}\n`);

      try {
        // 각 테스트마다 캐시 제거 후 새 스캐너 생성
        await ScannerRegistry.getInstance().removeScanner(platform);
        const scanner = ScannerRegistry.getInstance().getScanner(platform);

        const result = await scanner.scan(testCase.goodsNo);

        console.log("📊 스캔 결과:");
        console.log(`  - productName: ${result.productName || "(없음)"}`);
        console.log(`  - originalPrice: ${result.originalPrice}`);
        console.log(`  - discountedPrice: ${result.discountedPrice}`);
        console.log(`  - saleStatus: ${result.saleStatus}`);
        console.log(`  - thumbnail: ${result.thumbnail ? "있음" : "없음"}`);

        // 검증 (API 상태를 CSV 상태로 변환)
        const apiToExpected: Record<string, string> = {
          on_sale: "SELNG",
          sold_out: "SLDOT",
          off_sale: "STSEL",
        };

        const checks = {
          sale_status:
            apiToExpected[result.saleStatus] === testCase.expected.sale_status,
          hasName: testCase.expected.hasName
            ? result.productName.length > 0
            : result.productName.length === 0,
          hasPrice: testCase.expected.hasPrice
            ? result.discountedPrice > 0
            : result.discountedPrice === 0,
        };

        const allPassed = Object.values(checks).every((v) => v);

        console.log("\n🔍 검증 결과:");
        console.log(
          `  ${checks.sale_status ? "✅" : "❌"} saleStatus: ${result.saleStatus} → ${apiToExpected[result.saleStatus]} (기대값: ${testCase.expected.sale_status})`,
        );
        console.log(
          `  ${checks.hasName ? "✅" : "❌"} productName: ${result.productName ? "있음" : "없음"} (기대값: ${testCase.expected.hasName ? "있음" : "없음"})`,
        );
        console.log(
          `  ${checks.hasPrice ? "✅" : "❌"} discountedPrice: ${result.discountedPrice} (기대값: ${testCase.expected.hasPrice ? ">0" : "0"})`,
        );

        if (allPassed) {
          console.log("\n🎉 테스트 통과!");
          passCount++;
        } else {
          console.log("\n❌ 테스트 실패!");
          failCount++;
        }
      } catch (error) {
        console.error("\n💥 스캔 에러:", error);
        failCount++;
      }
    }

    // 4. 최종 결과
    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 최종 결과");
    console.log(`${"=".repeat(60)}`);
    console.log(`✅ 통과: ${passCount}/${TEST_CASES.length}`);
    console.log(`❌ 실패: ${failCount}/${TEST_CASES.length}`);

    if (failCount === 0) {
      console.log("\n🎉 모든 테스트 통과! 올리브영 전략이 정상 작동합니다.");
      process.exit(0);
    } else {
      console.log("\n⚠️ 일부 테스트 실패. YAML 전략을 확인하세요.");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 치명적 에러:", error);
    process.exit(1);
  }
}

testOliveyoungStrategy();

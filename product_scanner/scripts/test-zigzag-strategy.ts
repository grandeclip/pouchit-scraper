#!/usr/bin/env tsx

/**
 * ZigZag 전략 검증 스크립트
 * 6가지 케이스 테스트 (기존 test-zigzag-playwright.ts 결과 기반):
 * 1. 정상 판매 상품 (157001205)
 * 2. 정상 판매 상품 (111018539)
 * 3. 잘못된 ID (1570012055)
 * 4. 판매 중단 상품 (110848364)
 * 5. 판매 중단 상품 (164410989)
 * 6. 품절 상품 (162525042)
 */

import { ConfigLoader } from "@/config/ConfigLoader";
import { ScannerRegistry } from "@/services/ScannerRegistry";

const TEST_CASES = [
  {
    name: "정상 판매 - 토리버치 백",
    productId: "157001205",
    expected: {
      sale_status: "on_sale",
      isPurchasable: true,
      hasName: true,
      hasPrice: true,
    },
  },
  {
    name: "정상 판매 - 마리떼 프랑소와저버 탑",
    productId: "111018539",
    expected: {
      sale_status: "on_sale",
      isPurchasable: true,
      hasName: true,
      hasPrice: true,
    },
  },
  {
    name: "잘못된 상품 ID",
    productId: "1570012055",
    expected: {
      sale_status: "off_sale",
      isPurchasable: false,
      hasName: false, // 에러 시 placeholder
      hasPrice: false,
    },
  },
  {
    name: "판매 중단 - 칼하트 WIP 니트",
    productId: "110848364",
    expected: {
      sale_status: "off_sale",
      isPurchasable: false,
      hasName: true,
      hasPrice: true, // 가격은 존재하지만 구매 불가
    },
  },
  {
    name: "판매 중단 - 그레이프 스커트",
    productId: "164410989",
    expected: {
      sale_status: "off_sale",
      isPurchasable: false,
      hasName: true,
      hasPrice: true,
    },
  },
  {
    name: "품절 상품",
    productId: "162525042",
    expected: {
      sale_status: "sold_out",
      isPurchasable: false,
      hasName: true,
      hasPrice: true,
    },
  },
];

async function testZigzagStrategy() {
  console.log("🧪 ZigZag 전략 검증 시작\n");

  const platform = "zigzag";

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
      console.log(`🔗 productId: ${testCase.productId}`);
      console.log(`${"=".repeat(60)}\n`);

      try {
        // 각 테스트마다 캐시 제거 후 새 스캐너 생성
        await ScannerRegistry.getInstance().removeScanner(platform);
        const scanner = ScannerRegistry.getInstance().getScanner(platform);

        const result = await scanner.scan(testCase.productId);

        console.log("📊 스캔 결과:");
        console.log(`  - productName: ${result.productName || "(없음)"}`);
        console.log(`  - brand: ${result.brand || "(없음)"}`);
        console.log(`  - originalPrice: ${result.originalPrice}`);
        console.log(`  - discountedPrice: ${result.discountedPrice}`);
        console.log(`  - saleStatus: ${result.saleStatus}`);
        console.log(`  - thumbnail: ${result.thumbnail || "(없음)"}`);

        // ZigzagProduct에서 추가 정보 확인
        if ("isPurchasable" in result) {
          console.log(`  - isPurchasable: ${(result as any).isPurchasable}`);
        }
        if ("displayStatus" in result) {
          console.log(`  - displayStatus: ${(result as any).displayStatus}`);
        }

        // 검증
        const checks = {
          sale_status: result.saleStatus === testCase.expected.sale_status,
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
          `  ${checks.sale_status ? "✅" : "❌"} saleStatus: ${result.saleStatus} (기대값: ${testCase.expected.sale_status})`,
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

      // 테스트 간 대기 (2초)
      if (testCase !== TEST_CASES[TEST_CASES.length - 1]) {
        console.log("\n⏳ 다음 테스트까지 2초 대기...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // 3. 최종 결과
    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 최종 결과");
    console.log(`${"=".repeat(60)}`);
    console.log(`✅ 통과: ${passCount}/${TEST_CASES.length}`);
    console.log(`❌ 실패: ${failCount}/${TEST_CASES.length}`);

    if (failCount === 0) {
      console.log("\n🎉 모든 테스트 통과! ZigZag 전략이 정상 작동합니다.");
      process.exit(0);
    } else {
      console.log("\n⚠️ 일부 테스트 실패. YAML 전략을 확인하세요.");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 치명적 에러:", error);
    process.exit(1);
  } finally {
    // 정리
    await ScannerRegistry.getInstance().clearAll();
  }
}

testZigzagStrategy();

#!/usr/bin/env tsx

/**
 * 컬리 전략 검증 스크립트
 * 4가지 케이스 테스트:
 * 1. 판매중 상품
 * 2. 품절/재고없음 상품
 * 3. 상품정보변경
 * 4. 상품정보없음
 */

import { ConfigLoader } from "@/config/ConfigLoader";
import { ScannerRegistry } from "@/services/ScannerRegistry";

const TEST_CASES = [
  {
    name: "판매중 상품 (일리윤)",
    productId: "1000284986",
    url: "https://www.kurly.com/goods/1000284986",
    expected: {
      status: "ON_SALE",
      hasName: true,
      hasPrice: true,
      hasImage: true,
    },
  },
  {
    name: "판매중 상품 (롬앤 - basePrice 사용)",
    productId: "1001244384",
    url: "https://www.kurly.com/goods/1001244384",
    expected: {
      status: "ON_SALE",
      hasName: true,
      hasPrice: true,
      hasImage: true,
      expectedDiscountedPrice: 20800, // basePrice 검증
      retailPrice: 26000,
      discountRate: 20,
    },
  },
  {
    name: "품절/재고없음 상품",
    productId: "1000741467",
    url: "https://www.kurly.com/goods/1000741467",
    expected: {
      status: "SOLD_OUT",
      hasName: true,
      hasPrice: true, // 품절이어도 basePrice는 존재
      hasImage: true,
    },
  },
  {
    name: "상품정보변경",
    productId: "1001164253",
    url: "https://www.kurly.com/goods/1001164253",
    expected: {
      status: "INFO_CHANGED",
      hasName: false, // __NEXT_DATA__에 정보 없을 수 있음
      hasPrice: false,
      hasImage: false,
    },
  },
  {
    name: "상품정보없음",
    productId: "5070081",
    url: "https://www.kurly.com/goods/5070081",
    expected: {
      status: "NOT_FOUND",
      hasName: false,
      hasPrice: false,
      hasImage: false,
    },
  },
];

async function testKurlyStrategy() {
  console.log("🧪 컬리 전략 검증 시작\n");

  const platform = "kurly";

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
      console.log(`🔗 URL: ${testCase.url}`);
      console.log(`🔗 productId: ${testCase.productId}`);
      console.log(`${"=".repeat(60)}\n`);

      try {
        // 각 테스트마다 캐시 제거 후 새 스캐너 생성
        await ScannerRegistry.getInstance().removeScanner(platform);
        const scanner = ScannerRegistry.getInstance().getScanner(platform);

        const result = await scanner.scan(testCase.productId);

        console.log("📊 스캔 결과:");
        console.log(`  - productName: ${result.productName || "(없음)"}`);
        console.log(`  - originalPrice: ${result.originalPrice}`);
        console.log(`  - discountedPrice: ${result.discountedPrice}`);
        console.log(`  - saleStatus: ${result.saleStatus}`);
        console.log(`  - thumbnail: ${result.thumbnail ? "있음" : "없음"}`);

        // 할인율 검증 (expectedDiscountedPrice가 있는 경우)
        if (testCase.expected.expectedDiscountedPrice) {
          const calculatedPrice = Math.floor(
            testCase.expected.retailPrice *
              (1 - testCase.expected.discountRate / 100),
          );
          console.log(`\n💰 가격 검증:`);
          console.log(
            `  - 기대 discountedPrice: ${testCase.expected.expectedDiscountedPrice}`,
          );
          console.log(`  - 실제 discountedPrice: ${result.discountedPrice}`);
          console.log(`  - retailPrice: ${testCase.expected.retailPrice}`);
          console.log(`  - discountRate: ${testCase.expected.discountRate}%`);
          console.log(
            `  - 계산된 가격: ${calculatedPrice} (retailPrice * (1 - discountRate/100))`,
          );
          console.log(
            `  - 계산 일치 여부: ${calculatedPrice === result.discountedPrice ? "✅" : "❌"}`,
          );
        }

        console.log("\n📄 전체 결과:");
        console.log(JSON.stringify(result, null, 2));

        // 검증 (API 상태를 CSV 상태로 변환)
        const apiToExpected: Record<string, string> = {
          on_sale: "ON_SALE",
          sold_out: "SOLD_OUT",
          off_sale: "INFO_CHANGED", // INFO_CHANGED, NOT_FOUND 모두 off_sale로 매핑됨
        };

        // off_sale의 경우 INFO_CHANGED 또는 NOT_FOUND 둘 다 허용
        const expectedStatuses =
          testCase.expected.status === "INFO_CHANGED" ||
          testCase.expected.status === "NOT_FOUND"
            ? ["INFO_CHANGED", "NOT_FOUND"]
            : [testCase.expected.status];

        const actualStatus = apiToExpected[result.saleStatus] || "UNKNOWN";

        const checks = {
          status: expectedStatuses.includes(actualStatus),
          hasName: testCase.expected.hasName
            ? result.productName.length > 0 &&
              !result.productName.includes("없음") &&
              !result.productName.includes("실패")
            : result.productName.length === 0 ||
              result.productName.includes("없음") ||
              result.productName.includes("실패"),
          hasPrice: testCase.expected.hasPrice
            ? result.discountedPrice > 0
            : result.discountedPrice === 0,
          hasImage: testCase.expected.hasImage
            ? result.thumbnail.length > 0 &&
              !result.thumbnail.includes("placeholder")
            : result.thumbnail.length === 0 ||
              result.thumbnail.includes("placeholder"),
          priceCalculation:
            testCase.expected.expectedDiscountedPrice !== undefined
              ? (() => {
                  const calculatedPrice = Math.floor(
                    testCase.expected.retailPrice *
                      (1 - testCase.expected.discountRate / 100),
                  );
                  return (
                    result.discountedPrice ===
                      testCase.expected.expectedDiscountedPrice &&
                    result.discountedPrice === calculatedPrice
                  );
                })()
              : true, // expectedDiscountedPrice 없으면 통과
        };

        const allPassed = Object.values(checks).every((v) => v);

        console.log("\n🔍 검증 결과:");
        console.log(
          `  ${checks.status ? "✅" : "❌"} saleStatus: ${result.saleStatus} → ${actualStatus} (기대값: ${expectedStatuses.join(" or ")})`,
        );
        console.log(
          `  ${checks.hasName ? "✅" : "❌"} productName: "${result.productName}" (기대값: ${testCase.expected.hasName ? "있음" : "없음"})`,
        );
        console.log(
          `  ${checks.hasPrice ? "✅" : "❌"} discountedPrice: ${result.discountedPrice} (기대값: ${testCase.expected.hasPrice ? ">0" : "0"})`,
        );
        console.log(
          `  ${checks.hasImage ? "✅" : "❌"} thumbnail: ${result.thumbnail ? "있음" : "없음"} (기대값: ${testCase.expected.hasImage ? "있음" : "없음"})`,
        );
        if (testCase.expected.expectedDiscountedPrice !== undefined) {
          console.log(
            `  ${checks.priceCalculation ? "✅" : "❌"} priceCalculation: 할인율 계산 일치`,
          );
        }

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

    // 3. 최종 결과
    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 최종 결과");
    console.log(`${"=".repeat(60)}`);
    console.log(`✅ 통과: ${passCount}/${TEST_CASES.length}`);
    console.log(`❌ 실패: ${failCount}/${TEST_CASES.length}`);

    if (failCount === 0) {
      console.log("\n🎉 모든 테스트 통과! 컬리 전략이 정상 작동합니다.");
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

testKurlyStrategy();

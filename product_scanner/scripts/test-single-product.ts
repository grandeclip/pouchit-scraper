#!/usr/bin/env tsx

import { ConfigLoader } from "@/config/ConfigLoader";
import { ScannerRegistry } from "@/services/ScannerRegistry";

const goodsNo = process.argv[2] || "A000000185362";

async function testSingleProduct() {
  console.log(`\n테스트 상품: ${goodsNo}\n`);

  const platform = "oliveyoung";

  try {
    await ScannerRegistry.getInstance().removeScanner(platform);
    const scanner = ScannerRegistry.getInstance().getScanner(platform);

    const result = await scanner.scan(goodsNo);

    console.log("📊 스캔 결과:");
    console.log(`  - productName: ${result.productName || "(없음)"}`);
    console.log(`  - originalPrice: ${result.originalPrice}`);
    console.log(`  - discountedPrice: ${result.discountedPrice}`);
    console.log(`  - saleStatus: ${result.saleStatus}`);
    console.log(`  - thumbnail: ${result.thumbnail ? "있음" : "없음"}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ 테스트 실패:", error);
    process.exit(1);
  }
}

testSingleProduct();

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function query() {
  const { data, error } = await client
    .from("products")
    .select("id, name, name_ko, brand_id")
    .eq("status", "PUBLISHED")
    .not("brand_id", "is", null)
    .not("name", "like", "%테스트%")
    .not("name", "like", "%매핑%")
    .limit(10);

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("결과 없음 - 테스트 데이터만 존재");
    return;
  }

  // Get brand info
  const brandIds = [...new Set(data.map((p) => p.brand_id))];
  const { data: brands } = await client
    .from("brands")
    .select("id, name, name_ko")
    .in("id", brandIds);

  const brandMap = new Map(brands?.map((b) => [b.id, b]) || []);

  console.log("\n=== 실제 상품 10개 ===\n");
  data.forEach((p, i) => {
    const brand = brandMap.get(p.brand_id);
    console.log(`${i + 1}. ${p.name_ko || p.name}`);
    console.log(`   브랜드: ${brand?.name_ko || brand?.name || "N/A"}`);
    console.log(`   ID: ${p.id}\n`);
  });
}

query();

/**
 * Supabase 연결 테스트 스크립트
 *
 * product_sets 테이블의 row 개수를 카운팅합니다.
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// .env.local 파일 로드
const envPath = resolve(__dirname, ".env.local");
config({ path: envPath });

// 환경 변수 검증
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ 환경 변수가 설정되지 않았습니다.");
  console.error("필요한 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log("🔗 Supabase 연결 정보:");
console.log(`  URL: ${SUPABASE_URL}`);
console.log(
  `  Service Role Key: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...`,
);
console.log("");

// Supabase 클라이언트 생성
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function testSupabaseConnection() {
  try {
    console.log("📊 product_sets 테이블 조회 중...");

    // count 쿼리 실행
    const { count, error } = await supabase
      .from("product_sets")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("❌ 쿼리 실패:", error);
      process.exit(1);
    }

    console.log("✅ 연결 성공!");
    console.log("");
    console.log("📈 결과:");
    console.log(`  테이블: product_sets`);
    console.log(`  총 레코드 수: ${count}개`);

    // 추가: 샘플 데이터 1개 조회
    console.log("");
    console.log("🔍 샘플 데이터 조회 중...");

    const { data: sampleData, error: sampleError } = await supabase
      .from("product_sets")
      .select("*")
      .limit(1);

    if (sampleError) {
      console.error("❌ 샘플 데이터 조회 실패:", sampleError);
    } else if (sampleData && sampleData.length > 0) {
      console.log("✅ 샘플 데이터:");
      console.log(JSON.stringify(sampleData[0], null, 2));
    } else {
      console.log("ℹ️  테이블에 데이터가 없습니다.");
    }
  } catch (error) {
    console.error("❌ 예상치 못한 오류:", error);
    process.exit(1);
  }
}

// 실행
testSupabaseConnection();

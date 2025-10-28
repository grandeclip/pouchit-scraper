/**
 * Product Scanner 서버
 * 임시 엔트리포인트 - Supabase 연결 테스트용
 */

import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 헬스체크 엔드포인트
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Product Scanner is running" });
});

// 서버 시작
app.listen(PORT, () => {
  console.log("✅ Product Scanner 서버 시작");
  console.log(`📍 포트: ${PORT}`);
  console.log(`🔗 헬스체크: http://localhost:${PORT}/health`);
  console.log("📝 아직 구현 중입니다.");
});

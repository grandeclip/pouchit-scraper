/**
 * Product Scanner 서버
 * 리팩토링 완료: Strategy Pattern + SOLID 원칙
 */

import express from "express";
import { ScanController } from "@/controllers/ScanController";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import {
  validateScanRequest,
  validateGoodsIdParam,
} from "@/middleware/validation";

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());

// 컨트롤러 인스턴스
const scanController = new ScanController();

// 헬스체크 엔드포인트
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Product Scanner is running",
    version: "2.0.0",
    architecture: "Strategy Pattern + SOLID",
  });
});

// API 라우트
app.post("/api/scan/validate", validateScanRequest, (req, res) =>
  scanController.validate(req, res),
);

app.post("/api/scan/:goodsId", validateGoodsIdParam, (req, res) =>
  scanController.scan(req, res),
);

app.get("/api/scan/strategies", (req, res) =>
  scanController.getStrategies(req, res),
);

// 404 핸들러
app.use(notFoundHandler);

// 전역 에러 핸들러
app.use(errorHandler);

// 서버 시작
const server = app.listen(PORT, () => {
  console.log("✅ Product Scanner 서버 시작");
  console.log(`📍 포트: ${PORT}`);
  console.log(`🔗 헬스체크: http://localhost:${PORT}/health`);
  console.log(`\n📚 API 엔드포인트:`);
  console.log(`  POST /api/scan/validate - 상품 검증 (CSV vs API)`);
  console.log(`  POST /api/scan/:goodsId - 상품 스캔`);
  console.log(`  GET  /api/scan/strategies - 사용 가능한 전략 목록`);
  console.log(`\n🎯 지원 전략: API (priority 1), Playwright (priority 2)`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\n🛑 SIGTERM 수신, 서버 종료 중...");

  server.close(async () => {
    console.log("📡 HTTP 서버 종료");

    // 리소스 정리
    await scanController.cleanup();

    console.log("✅ 서버 정상 종료");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("\n🛑 SIGINT 수신, 서버 종료 중...");

  server.close(async () => {
    console.log("📡 HTTP 서버 종료");

    // 리소스 정리
    await scanController.cleanup();

    console.log("✅ 서버 정상 종료");
    process.exit(0);
  });
});

/**
 * Product Scanner 서버
 * API v1 with Platform-based Routing
 */

import "dotenv/config";
import express from "express";
import v1Router from "@/routes/v1";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import { requestLogger } from "@/middleware/requestLogger";
import { createServiceLogger, logImportant } from "@/utils/logger-context";
import { SERVICE_NAMES, APP_METADATA } from "@/config/constants";
import { ConfigLoader } from "@/config/ConfigLoader";
import { ScannerRegistry } from "@/services/ScannerRegistry";

const logger = createServiceLogger(SERVICE_NAMES.SERVER);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// 플랫폼 설정 상태 추적
let platformsLoaded = false;
let platformCount = 0;

try {
  const configLoader = ConfigLoader.getInstance();
  const platforms = configLoader.getAvailablePlatforms();
  platformsLoaded = platforms.length > 0;
  platformCount = platforms.length;
} catch (error) {
  logger.error({ error }, "[Server] Platform configuration load failed");
  platformsLoaded = false;
  platformCount = 0;
}

// 미들웨어
app.use(express.json());
app.use(requestLogger);

// 헬스체크 엔드포인트
app.get("/health", (_req, res) => {
  const status = platformsLoaded ? "ok" : "degraded";
  const statusCode = platformsLoaded ? 200 : 503;

  res.status(statusCode).json({
    status,
    message: `${APP_METADATA.NAME} is running`,
    version: APP_METADATA.VERSION,
    architecture: APP_METADATA.ARCHITECTURE,
    platforms: {
      loaded: platformsLoaded,
      count: platformCount,
    },
  });
});

// API v1 라우터
app.use("/api/v1", v1Router);

// 404 핸들러
app.use(notFoundHandler);

// 전역 에러 핸들러
app.use(errorHandler);

// 서버 시작
const server = app.listen(PORT, () => {
  logImportant(logger, `${APP_METADATA.NAME} 서버 시작`, {
    port: PORT,
    env: process.env.NODE_ENV || "development",
    version: APP_METADATA.VERSION,
  });

  logger.info(
    {
      baseUrl: BASE_URL,
      endpoints: {
        health: `${BASE_URL}/health`,
        platforms: "GET /api/v1/platforms",
        scan: "POST /api/v1/platforms/:platform/scan/:goodsId",
        products: "GET /api/v1/products/search",
        workflows: "POST /api/v1/workflows/execute",
      },
    },
    "API v1 엔드포인트 등록 완료",
  );
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.warn("SIGTERM 수신, 서버 종료 중...");

  server.close(async () => {
    logger.info("HTTP 서버 종료");

    // 리소스 정리 (모든 Playwright 브라우저 인스턴스)
    await ScannerRegistry.getInstance().clearAll();

    logImportant(logger, "서버 종료 완료", {});
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.warn("SIGINT 수신, 서버 종료 중...");

  server.close(async () => {
    logger.info("HTTP 서버 종료");

    // 리소스 정리 (모든 Playwright 브라우저 인스턴스)
    await ScannerRegistry.getInstance().clearAll();

    logImportant(logger, "서버 종료 완료", {});
    process.exit(0);
  });
});

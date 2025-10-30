/**
 * Product Scanner 서버
 * 리팩토링 완료: Strategy Pattern + SOLID 원칙
 */

import "dotenv/config";
import express from "express";
import { ScanController } from "@/controllers/ScanController";
import { ProductSearchController } from "@/controllers/ProductSearchController";
import { WorkflowController } from "@/controllers/WorkflowController";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import { requestLogger } from "@/middleware/requestLogger";
import {
  validateScanRequest,
  validateGoodsIdParam,
  validateProductSearchQuery,
  validateProductSetIdParam,
} from "@/middleware/validation";
import { createServiceLogger, logImportant } from "@/utils/logger-context";
import { SERVICE_NAMES } from "@/config/constants";

const logger = createServiceLogger(SERVICE_NAMES.SERVER);

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(requestLogger);

// 컨트롤러 인스턴스
const scanController = new ScanController();
const productSearchController = new ProductSearchController();
const workflowController = new WorkflowController();

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

// Product Search API 라우트
app.get("/api/products/search", validateProductSearchQuery, (req, res) =>
  productSearchController.search(req, res),
);

app.get("/api/products/health", (req, res) =>
  productSearchController.health(req, res),
);

app.get("/api/products/:productSetId", validateProductSetIdParam, (req, res) =>
  productSearchController.getById(req, res),
);

// Workflow API 라우트
app.post("/api/workflows/execute", (req, res) =>
  workflowController.execute(req, res),
);

app.get("/api/workflows/jobs/:jobId", (req, res) =>
  workflowController.getJobStatus(req, res),
);

app.get("/api/workflows", (req, res) =>
  workflowController.listWorkflows(req, res),
);

app.get("/api/workflows/health", (req, res) =>
  workflowController.healthCheck(req, res),
);

// 404 핸들러
app.use(notFoundHandler);

// 전역 에러 핸들러
app.use(errorHandler);

// 서버 시작
const server = app.listen(PORT, () => {
  logImportant(logger, "Product Scanner 서버 시작", {
    port: PORT,
    env: process.env.NODE_ENV || "development",
    version: "2.0.0",
  });

  logger.info(
    {
      endpoints: {
        health: `http://localhost:${PORT}/health`,
        scan: {
          validate: "POST /api/scan/validate",
          scan: "POST /api/scan/:goodsId",
          strategies: "GET /api/scan/strategies",
        },
        products: {
          search: "GET /api/products/search",
          getById: "GET /api/products/:productSetId",
          health: "GET /api/products/health",
        },
        workflows: {
          execute: "POST /api/workflows/execute",
          jobStatus: "GET /api/workflows/jobs/:jobId",
          list: "GET /api/workflows",
          health: "GET /api/workflows/health",
        },
      },
    },
    "API 엔드포인트 등록 완료",
  );
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.warn("SIGTERM 수신, 서버 종료 중...");

  server.close(async () => {
    logger.info("HTTP 서버 종료");

    // 리소스 정리
    await scanController.cleanup();

    logImportant(logger, "서버 종료 완료", {});
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.warn("SIGINT 수신, 서버 종료 중...");

  server.close(async () => {
    logger.info("HTTP 서버 종료");

    // 리소스 정리
    await scanController.cleanup();

    logImportant(logger, "서버 종료 완료", {});
    process.exit(0);
  });
});

/**
 * API v2 메인 라우터
 *
 * v2 API 특징:
 * - 상품 추출 전용 엔드포인트
 * - 3가지 추출 모드 지원 (product-set, url, id)
 */

import { Router } from "express";
import productsRouter from "./products.router";
import workflowsRouter from "./workflows.router";
import jobsRouter from "./jobs.router";
import schedulerRouter from "./scheduler.router";
import alertWatcherRouter from "./alert-watcher.router";
import workersRouter from "./workers.router";
import { logger } from "@/config/logger";

const router = Router();

// Products API (추출 엔드포인트)
router.use("/products", productsRouter);

// Workflows API (워크플로우 실행/조회)
router.use("/workflows", workflowsRouter);

// Jobs API (모니터링)
router.use("/jobs", jobsRouter);

// Scheduler API (스케줄러 제어)
router.use("/scheduler", schedulerRouter);

// Alert Watcher API (테이블 모니터링 제어)
router.use("/alert-watcher", alertWatcherRouter);

// Workers API (Worker 컨테이너 관리)
router.use("/workers", workersRouter);

logger.info(
  {
    endpoints: [
      "POST /api/v2/products/extract-by-product-set",
      "POST /api/v2/products/extract-by-url",
      "POST /api/v2/workflows/execute",
      "GET /api/v2/workflows/jobs/:jobId",
      "GET /api/v2/workflows",
      "GET /api/v2/jobs/running",
      "POST /api/v2/jobs/platform/:platform/force-release",
      "GET /api/v2/scheduler/status",
      "POST /api/v2/scheduler/start",
      "POST /api/v2/scheduler/stop",
      "GET /api/v2/alert-watcher/status",
      "POST /api/v2/alert-watcher/start",
      "POST /api/v2/alert-watcher/stop",
      "GET /api/v2/workers/status",
      "POST /api/v2/workers/:platform/restart",
    ],
  },
  "[v2Router] API v2 라우터 등록",
);

export default router;

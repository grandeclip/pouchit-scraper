/**
 * API v1 메인 라우터
 * 모든 v1 엔드포인트 통합
 *
 * Architecture:
 * - 플랫폼별 동적 라우팅 (ConfigLoader 기반)
 * - 공통 리소스 (products, workflows)
 *
 * SOLID 원칙:
 * - SRP: 라우터 조립만 담당 (fs 로직 → ConfigLoader 위임)
 * - DIP: ConfigLoader 추상화에 의존
 */

import { Router } from "express";
import { ConfigLoader } from "@/config/ConfigLoader";
import { logger } from "@/config/logger";
import platformsRouter from "./platforms.router";
import { createPlatformScanRouter } from "./platform-scan.router";
import productsRouter from "./products.router";
import workflowsRouter from "./workflows.router";

const router = Router();

// 1. 플랫폼 목록 API
router.use("/platforms", platformsRouter);

// 2. 플랫폼별 스캔 라우터 동적 생성
try {
  const configLoader = ConfigLoader.getInstance();
  const platforms = configLoader.getAvailablePlatforms();

  if (platforms.length === 0) {
    logger.warn(
      "[v1Router] No platforms found. Scan endpoints not registered.",
    );
  } else {
    platforms.forEach((platform) => {
      const platformScanRouter = createPlatformScanRouter(platform);
      router.use(`/platforms/${platform}/scan`, platformScanRouter);
    });

    logger.info(
      { platforms, count: platforms.length },
      "[v1Router] Platform scan routers registered",
    );
  }
} catch (error) {
  logger.error(
    { error },
    "[v1Router] Failed to initialize platform scan routers",
  );
  // 에러 발생 시에도 서버는 계속 실행 (다른 API는 동작)
}

// 3. 공통 리소스 라우터
router.use("/products", productsRouter);
router.use("/workflows", workflowsRouter);

export default router;

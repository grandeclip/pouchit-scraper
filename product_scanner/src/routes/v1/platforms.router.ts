/**
 * 플랫폼 목록 라우터
 * GET /api/v1/platforms - 지원 플랫폼 목록
 *
 * SOLID 원칙:
 * - SRP: HTTP 응답만 담당 (fs 로직 → ConfigLoader 위임)
 * - DIP: ConfigLoader 추상화에 의존
 */

import { Router } from "express";
import { ConfigLoader } from "@/config/ConfigLoader";
import { logger } from "@/config/logger";

const router = Router();

/**
 * GET /api/v1/platforms
 * 사용 가능한 플랫폼 목록 반환
 */
router.get("/", (_req, res) => {
  try {
    const configLoader = ConfigLoader.getInstance();
    const platforms = configLoader.getAvailablePlatforms();

    res.status(200).json({
      platforms,
      count: platforms.length,
    });
  } catch (error) {
    logger.error({ error }, "[PlatformsRouter] Failed to get platforms");
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;

/**
 * 에러 핸들러 미들웨어
 * Express 전역 에러 처리
 *
 * SOLID 원칙:
 * - SRP: 에러 처리만 담당
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "@/config/logger";

/**
 * 전역 에러 핸들러
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // 에러 로깅
  logger.error(
    {
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      request_id: req.id,
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
    },
    "처리되지 않은 오류",
  );

  // 에러 응답
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
}

/**
 * 404 핸들러
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  logger.warn(
    {
      request_id: req.id,
      method: req.method,
      path: req.path,
    },
    "경로를 찾을 수 없음",
  );

  res.status(404).json({
    error: "Not found",
    path: req.path,
  });
}

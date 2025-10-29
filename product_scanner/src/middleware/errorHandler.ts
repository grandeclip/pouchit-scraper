/**
 * 에러 핸들러 미들웨어
 * Express 전역 에러 처리
 *
 * SOLID 원칙:
 * - SRP: 에러 처리만 담당
 */

import { Request, Response, NextFunction } from "express";

/**
 * 전역 에러 핸들러
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.error("[ErrorHandler] Unhandled error:", err);

  // 에러 로깅
  console.error("Stack trace:", err.stack);

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
  res.status(404).json({
    error: "Not found",
    path: req.path,
  });
}

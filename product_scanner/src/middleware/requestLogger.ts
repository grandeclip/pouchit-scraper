/**
 * Request Logger 미들웨어
 * Pino HTTP 요청 로깅 미들웨어
 *
 * 기능:
 * - 모든 HTTP 요청 자동 로깅
 * - Request ID 생성 및 추적
 * - 응답 시간 측정
 * - 요청/응답 컨텍스트 자동 첨부
 * - Health check 요청은 파일 로그 제외 (콘솔만)
 */

import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { createRequestLogger } from "@/utils/logger-context";

/**
 * 파일 로그에서 제외할 경로 목록
 */
const SKIP_FILE_LOG_PATHS = [
  "/health",
  "/api/workflows/health",
  "/api/products/health",
];

/**
 * Request Logger 미들웨어
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = uuidv4();
  const startTime = Date.now();

  // Health check 요청은 파일 로그 제외
  const skipFileLog = SKIP_FILE_LOG_PATHS.includes(req.path);

  // Request에 로거 추가
  const logger = createRequestLogger(requestId, req.method, req.path);
  req.log = logger;
  req.id = requestId;

  // 요청 로그 (health check는 파일 제외)
  logger.info(
    {
      query: req.query,
      body: req.body,
      ip: req.ip,
      skip_file_log: skipFileLog, // 파일 로그 제외 플래그
    },
    "요청 수신",
  );

  // 응답 완료 시 로그
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? "error" : "info";

    logger[logLevel](
      {
        status: res.statusCode,
        duration_ms: duration,
        skip_file_log: skipFileLog, // 파일 로그 제외 플래그
      },
      "요청 완료",
    );
  });

  next();
}

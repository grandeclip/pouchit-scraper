/**
 * 에러 핸들링 미들웨어
 * 
 * 역할:
 * - 전역 에러 처리
 * - 에러 타입별 HTTP 상태 코드 매핑
 * - 에러 로깅
 */

import { Request, Response, NextFunction } from 'express';

/**
 * 에러 핸들러 미들웨어
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[Error Handler]', err);

  // 에러 응답 구조
  const errorResponse = {
    success: false,
    products: [],
    error: err.message || '알 수 없는 오류가 발생했습니다',
  };

  // 상태 코드 결정
  let statusCode = 500;

  if (err.message?.includes('지원하지 않는 쇼핑몰')) {
    statusCode = 404;
  } else if (err.message?.includes('필수')) {
    statusCode = 400;
  } else if (err.message?.includes('타임아웃')) {
    statusCode = 504;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 핸들러
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    products: [],
    error: `라우트를 찾을 수 없습니다: ${req.method} ${req.path}`,
  });
}


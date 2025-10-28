/**
 * 요청 검증 미들웨어
 * 
 * 역할:
 * - 필수 파라미터 체크
 * - 타입 검증
 */

import { Request, Response, NextFunction } from 'express';

/**
 * 스크래핑 요청 검증 미들웨어
 */
export function validateScrapeRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { brand, productName } = req.body;

  // 필수 파라미터 체크
  if (!brand || typeof brand !== 'string' || brand.trim().length === 0) {
    res.status(400).json({
      error: 'brand는 필수이며 빈 문자열일 수 없습니다',
      success: false,
      products: [],
    });
    return;
  }

  if (
    !productName ||
    typeof productName !== 'string' ||
    productName.trim().length === 0
  ) {
    res.status(400).json({
      error: 'productName은 필수이며 빈 문자열일 수 없습니다',
      success: false,
      products: [],
    });
    return;
  }

  next();
}


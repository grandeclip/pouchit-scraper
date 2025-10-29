/**
 * 요청 검증 미들웨어
 * Request body 검증
 *
 * SOLID 원칙:
 * - SRP: 요청 검증만 담당
 */

import { Request, Response, NextFunction } from "express";

/**
 * ValidationRequest 검증
 */
export function validateScanRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { goodsId, csvData } = req.body;

  if (!goodsId) {
    res.status(400).json({
      error: "Validation failed",
      details: ["goodsId is required"],
    });
    return;
  }

  if (!csvData) {
    res.status(400).json({
      error: "Validation failed",
      details: ["csvData is required"],
    });
    return;
  }

  // csvData 필드 검증
  const requiredFields = [
    "goodsId",
    "productName",
    "thumbnail",
    "originalPrice",
    "discountedPrice",
    "saleStatus",
  ];

  const missingFields = requiredFields.filter(
    (field) => csvData[field] === undefined || csvData[field] === null,
  );

  if (missingFields.length > 0) {
    res.status(400).json({
      error: "Validation failed",
      details: missingFields.map((field) => `csvData.${field} is required`),
    });
    return;
  }

  next();
}

/**
 * goodsId 파라미터 검증
 */
export function validateGoodsIdParam(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { goodsId } = req.params;

  if (!goodsId || goodsId.trim() === "") {
    res.status(400).json({
      error: "Validation failed",
      details: ["goodsId parameter is required"],
    });
    return;
  }

  next();
}

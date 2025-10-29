/**
 * 요청 검증 미들웨어
 * Request body 검증
 *
 * SOLID 원칙:
 * - SRP: 요청 검증만 담당
 */

import { Request, Response, NextFunction } from "express";
import { API_CONFIG } from "@/config/constants";

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

/**
 * Product Search 쿼리 파라미터 검증
 */
export function validateProductSearchQuery(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { link_url, sale_status, limit } = req.query;

  // limit 검증 (옵션)
  if (limit !== undefined) {
    const limitNum = Number(limit);
    const maxLimit = API_CONFIG.MAX_SEARCH_LIMIT;
    if (isNaN(limitNum) || limitNum <= 0 || limitNum > maxLimit) {
      res.status(400).json({
        error: "Validation failed",
        details: [`limit must be a positive number between 1 and ${maxLimit}`],
      });
      return;
    }
  }

  // link_url 또는 sale_status 중 최소 하나는 있어야 함 (옵션)
  // 둘 다 없으면 전체 조회가 되므로 성능 이슈 가능
  if (!link_url && !sale_status) {
    res.status(400).json({
      error: "Validation failed",
      details: ["At least one of link_url or sale_status is required"],
    });
    return;
  }

  next();
}

/**
 * productSetId 파라미터 검증 (UUID)
 */
export function validateProductSetIdParam(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { productSetId } = req.params;

  if (!productSetId || productSetId.trim() === "") {
    res.status(400).json({
      error: "Validation failed",
      details: ["productSetId parameter is required"],
    });
    return;
  }

  // UUID 형식 간단 검증 (UUID v4 형식)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(productSetId)) {
    res.status(400).json({
      error: "Validation failed",
      details: ["productSetId must be a valid UUID"],
    });
    return;
  }

  next();
}

/**
 * 상품 필터링 결과 Zod 스키마
 *
 * LLM의 구조화된 출력을 위한 스키마 정의
 * 각 플랫폼별로 유효한 상품의 인덱스 배열을 반환
 */

import { z } from "zod";

/**
 * 플랫폼별 필터링 결과 스키마
 */
export const PlatformFilteringResultSchema = z.object({
  /** 플랫폼명 */
  platform: z.string().describe("플랫폼명 (oliveyoung, zigzag 등)"),
  /** 유효한 상품의 인덱스 배열 */
  valid_indices: z
    .array(z.number().int().min(0))
    .describe("유효한 상품의 인덱스 배열"),
});

/**
 * 상품 필터링 결과 스키마
 *
 * @example
 * {
 *   "platforms": [
 *     { "platform": "oliveyoung", "valid_indices": [0, 2] },
 *     { "platform": "zigzag", "valid_indices": [0] }
 *   ]
 * }
 */
export const ProductFilteringSchema = z.object({
  platforms: z
    .array(PlatformFilteringResultSchema)
    .describe("플랫폼별 필터링 결과 배열"),
});

/**
 * 플랫폼별 필터링 결과 타입
 */
export type PlatformFilteringResult = z.infer<
  typeof PlatformFilteringResultSchema
>;

/**
 * 상품 필터링 결과 타입
 */
export type ProductFilteringResult = z.infer<typeof ProductFilteringSchema>;

/**
 * 상품 필터링 입력 타입
 */
export interface ProductFilteringInput {
  /** 브랜드명 */
  brand: string;
  /** 상품명 (기준 상품) */
  product_name: string;
  /** 플랫폼별 상품명 목록 */
  product_names: Record<string, string[]>;
}

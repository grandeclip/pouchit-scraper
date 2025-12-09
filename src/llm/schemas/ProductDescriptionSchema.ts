/**
 * 상품 설명 생성 결과 Zod 스키마
 *
 * URL Context를 활용한 LLM의 구조화된 출력을 위한 스키마 정의
 * - 홍보 목적의 상품 설명 (1문장)
 * - 카테고리 분류 (ID + 경로 텍스트)
 *
 * @note 모델: gemini-2.5-flash (기본)
 * @note thinking budget: 0 (기본, 필요시 조절 가능)
 */

import { z } from "zod";

/**
 * 카테고리 분류 결과 스키마
 *
 * @example
 * {
 *   "id": 5,
 *   "path": "스킨케어 > 에센스/세럼/앰플"
 * }
 */
export const CategoryClassificationSchema = z.object({
  /** 최종 카테고리 ID (Supabase product_categories.id) */
  id: z.number().describe("최종 카테고리 ID (가장 하위 depth의 카테고리)"),
  /** 카테고리 경로 (대분류 > 중분류 > 소분류) */
  path: z.string().describe("카테고리 경로 (예: 스킨케어 > 에센스/세럼/앰플)"),
});

/**
 * 상품 설명 생성 결과 스키마
 *
 * @example
 * {
 *   "description": "피부 깊숙이 수분을 채워주는 저분자 히알루론산이 함유된 고보습 세럼입니다.",
 *   "category": {
 *     "id": 5,
 *     "path": "스킨케어 > 에센스/세럼/앰플"
 *   }
 * }
 */
export const ProductDescriptionSchema = z.object({
  /** 홍보 목적의 상품 설명 (1문장) */
  description: z.string().describe("홍보 목적의 상품 설명 (1문장, 한국어)"),
  /** 카테고리 분류 */
  category: CategoryClassificationSchema.describe("상품 카테고리 분류"),
});

/**
 * 카테고리 분류 결과 타입
 */
export type CategoryClassification = z.infer<
  typeof CategoryClassificationSchema
>;

/**
 * 상품 설명 생성 결과 타입
 */
export type ProductDescriptionResult = z.infer<typeof ProductDescriptionSchema>;

/**
 * 상품 설명 생성 입력 타입
 */
export interface ProductDescriptionInput {
  /** 브랜드명 */
  brand: string;
  /** 상품명 */
  product_name: string;
  /** 참조 URL 목록 (최대 20개) */
  urls: string[];
}

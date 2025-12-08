/**
 * Product Set 파싱 결과 Zod 스키마
 *
 * LLM의 구조화된 출력을 위한 스키마 정의
 * Gemini API의 responseSchema로 사용됨
 */

import { z } from "zod";

/**
 * 개별 상품 아이템 스키마
 *
 * 메인 상품 또는 증정품 하나를 나타냄
 */
export const ProductItemSchema = z.object({
  /** 라인명 + 제품 상세명 (브랜드 제외) */
  full_name: z.string().describe("라인명 + 제품 상세명 (브랜드 제외)"),

  /** 제품 타입 (세럼, 크림, 토너 등) */
  type: z.string().describe("제품 타입 (세럼, 크림, 토너 등)"),

  /** 용량 숫자 (없으면 null) */
  volume: z.number().nullable().describe("용량 숫자"),

  /**
   * 단위
   * - 부피/무게: ml, g, L, kg (영어)
   * - 개수: 매, 개, 장, 팩 (한글)
   */
  unit: z
    .string()
    .describe(
      "단위 - 부피/무게: ml, g, L, kg (영어) / 개수: 매, 개, 장, 팩 (한글)",
    ),

  /** 개수 (기본값 1) */
  count: z.number().describe("개수"),
});

/**
 * Product Set 파싱 결과 스키마
 *
 * LLM이 반환하는 전체 구조
 */
export const ProductSetParsingSchema = z.object({
  /** 메인 상품 목록 */
  main_products: z.array(ProductItemSchema).describe("메인 상품 목록"),

  /** 증정품 목록 */
  gifts: z.array(ProductItemSchema).describe("증정품 목록"),
});

/**
 * 개별 상품 아이템 타입
 */
export type ProductItem = z.infer<typeof ProductItemSchema>;

/**
 * Product Set 파싱 결과 타입
 */
export type ProductSetParsingResult = z.infer<typeof ProductSetParsingSchema>;

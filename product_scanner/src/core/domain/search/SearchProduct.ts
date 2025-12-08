/**
 * SearchProduct - 검색 결과 상품 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: 검색 결과 상품 데이터만 담당
 * - OCP: 확장 가능한 구조 (추가 필드는 optional)
 */

import { z } from "zod";

/**
 * 검색 결과 상품 스키마 (Zod)
 */
export const SearchProductSchema = z.object({
  /** 플랫폼 상품 ID */
  productId: z.string(),

  /** 상품명 */
  productName: z.string(),

  /** 브랜드명 */
  brand: z.string().optional(),

  /** 썸네일 URL */
  thumbnail: z.string().url().optional(),

  /** 상품 상세 URL */
  productUrl: z.string().url(),

  /** 판매가 (할인 적용) */
  price: z.number().optional(),

  /** 정가 */
  originalPrice: z.number().optional(),

  /** 할인율 (%) */
  discountRate: z.number().optional(),

  /** 플랫폼 식별자 */
  platform: z.string(),
});

/**
 * 검색 결과 상품 타입
 */
export type SearchProduct = z.infer<typeof SearchProductSchema>;

/**
 * 검색 요청 스키마
 */
export const SearchRequestSchema = z.object({
  /** 검색 키워드 */
  keyword: z.string().min(1),

  /** 결과 제한 수 */
  limit: z.number().min(1).max(100).default(10),
});

/**
 * 검색 요청 타입
 */
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/**
 * 검색 결과 스키마
 */
export const SearchResultSchema = z.object({
  /** 검색 키워드 */
  keyword: z.string(),

  /** 총 결과 수 */
  totalCount: z.number(),

  /** 검색 결과 상품 목록 */
  products: z.array(SearchProductSchema),

  /** 플랫폼 */
  platform: z.string(),
});

/**
 * 검색 결과 타입
 */
export type SearchResult = z.infer<typeof SearchResultSchema>;

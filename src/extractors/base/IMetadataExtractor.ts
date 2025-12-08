/**
 * IMetadataExtractor Interface
 *
 * 목적: 메타데이터 정보 추출 인터페이스
 * 패턴: Strategy Pattern
 */

import type { Page } from "playwright";

/**
 * 메타데이터 구조
 */
export interface MetadataData {
  /** 상품명 (필수) */
  productName: string;

  /** 브랜드명 (선택) */
  brand?: string;

  /** 썸네일 이미지 URL (선택) */
  thumbnail?: string;

  /** 상세 이미지 URL 목록 (선택) */
  images?: string[];
}

/**
 * 메타데이터 추출기 인터페이스
 *
 * Generic 타입으로 다양한 입력 형식 지원:
 * - Page: Playwright DOM 기반 추출 (oliveyoung, ably, kurly)
 * - ApiResponse: HTTP API 기반 추출 (hwahae, musinsa)
 * - GraphQLResponse: GraphQL 기반 추출 (zigzag)
 *
 * @template TInput 입력 데이터 타입 (기본값: Page)
 */
export interface IMetadataExtractor<TInput = Page> {
  /**
   * 메타데이터 정보 추출
   *
   * @param input 입력 데이터 (Page, ApiResponse, GraphQLResponse 등)
   * @returns 추출된 메타데이터
   */
  extract(input: TInput): Promise<MetadataData>;
}

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
 * 구현체는 Playwright Page에서 상품 메타데이터를 추출하여
 * MetadataData 구조로 반환해야 함
 */
export interface IMetadataExtractor {
  /**
   * 메타데이터 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 메타데이터
   */
  extract(page: Page): Promise<MetadataData>;
}

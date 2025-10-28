/**
 * 데이터 추출기 인터페이스
 * 페이지에서 상품 데이터를 추출하는 로직을 담당
 * 
 * SOLID 원칙:
 * - SRP: 데이터 추출만 담당
 * - ISP: 추출 관련 메서드만 정의
 */

import type { Page } from 'playwright';
import { ExtractionConfig } from '../domain/ScraperConfig';

/**
 * 데이터 추출기 인터페이스
 */
export interface IDataExtractor {
  /**
   * 데이터 추출
   * @param page Playwright Page 객체
   * @param config 추출 설정
   * @param context 변수 치환을 위한 컨텍스트
   * @returns 추출된 데이터 배열
   */
  extract(
    page: Page,
    config: ExtractionConfig,
    context: Record<string, any>
  ): Promise<any[]>;
}


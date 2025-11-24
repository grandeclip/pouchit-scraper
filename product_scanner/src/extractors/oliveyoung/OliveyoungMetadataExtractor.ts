/**
 * OliveyoungMetadataExtractor
 *
 * 목적: 올리브영 메타데이터 정보 추출
 * 패턴: Strategy Pattern
 * 참고: docs/analysis/oliveyoung-logic-analysis.md L135-190
 */

import type { Page } from "playwright";
import type { IMetadataExtractor, MetadataData } from "@/extractors/base";
import { DOMHelper } from "@/extractors/common/DOMHelper";

/**
 * 올리브영 메타데이터 추출기
 *
 * 전략 (oliveyoung.yaml 원본 로직):
 * - 상품명: 7개 selector 순차 시도 (3글자 이상)
 * - 브랜드: 4개 selector 순차 시도
 * - 썸네일: 5가지 전략 + 상품번호 검증 (A\d{12})
 */
import { OliveyoungSelectors } from "@/core/domain/OliveyoungConfig";

export class OliveyoungMetadataExtractor implements IMetadataExtractor {
  /**
   * 상품명 Selector 우선순위
   */
  private readonly PRODUCT_NAME_SELECTORS: string[];

  /**
   * 브랜드 Selector 우선순위
   */
  private readonly BRAND_SELECTORS: string[];

  /**
   * 썸네일 Selector 우선순위
   */
  private readonly THUMBNAIL_SELECTORS: string[];

  /**
   * Error Messages & Patterns from YAML
   */
  private readonly ERROR_MESSAGES: string[];
  private readonly THUMBNAIL_EXCLUSIONS: string[];
  private readonly PRODUCT_NUMBER_PATTERN: RegExp;

  constructor(
    selectors?: OliveyoungSelectors,
    errorMessages?: string[],
    thumbnailExclusions?: string[],
    productNumberPattern?: string,
  ) {
    // Load from YAML (no hardcoded defaults)
    this.PRODUCT_NAME_SELECTORS = selectors?.productName || [];
    this.BRAND_SELECTORS = selectors?.brand || [];
    this.THUMBNAIL_SELECTORS = selectors?.thumbnail || [];

    this.ERROR_MESSAGES = errorMessages || [];
    this.THUMBNAIL_EXCLUSIONS = thumbnailExclusions || [];
    this.PRODUCT_NUMBER_PATTERN = productNumberPattern
      ? new RegExp(productNumberPattern)
      : /.^/; // Never match pattern (빈 패턴 대신)
  }

  /**
   * 메타데이터 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 메타데이터
   */
  async extract(page: Page): Promise<MetadataData> {
    const [productName, brand, thumbnail] = await Promise.all([
      this.extractProductName(page),
      this.extractBrand(page),
      this.extractThumbnail(page),
    ]);

    return {
      productName,
      brand,
      thumbnail,
    };
  }

  /**
   * 상품명 추출 (7개 selector 순차 시도)
   *
   * 전략:
   * 1. Selector 우선순위:
   *    - .info-group__title (모바일 1순위)
   *    - .prd_name (데스크톱 1순위)
   *    - [class*="goods"][class*="name"] (하이브리드 패턴)
   * 2. 유효성 검증:
   *    - 3글자 이상 (공백 제거 후)
   *    - 에러 메시지 필터링 (404 페이지 대응)
   *
   * 에러 메시지 처리:
   * - "상품을 찾을 수 없어요" (10글자) → 3글자 이상 조건 통과
   * - ERROR_MESSAGES로 필터링하여 상품명으로 오인 방지
   *
   * @param page Playwright Page 객체
   * @returns 상품명 또는 빈 문자열
   */
  private async extractProductName(page: Page): Promise<string> {
    for (const selector of this.PRODUCT_NAME_SELECTORS) {
      const text = await DOMHelper.safeText(page, selector);

      // 3글자 이상 && 에러 메시지가 아닌 경우만 유효
      if (text && text.length >= 3) {
        // 에러 메시지 체크
        const isErrorMessage = this.ERROR_MESSAGES.some((pattern) =>
          text.includes(pattern),
        );

        if (!isErrorMessage) {
          return text;
        }
      }
    }

    return "";
  }

  /**
   * 브랜드 추출 (4개 selector 순차 시도)
   *
   * @param page Playwright Page 객체
   * @returns 브랜드명 또는 undefined
   */
  private async extractBrand(page: Page): Promise<string | undefined> {
    for (const selector of this.BRAND_SELECTORS) {
      const text = await DOMHelper.safeText(page, selector);

      if (text) {
        return text;
      }
    }

    return undefined;
  }

  /**
   * 썸네일 추출 (5가지 전략 + 상품번호 검증)
   *
   * 전략:
   * 1. 5개 selector 순차 시도
   * 2. URL 필터링:
   *    - oliveyoung.co.kr 도메인만
   *    - options/item 경로 제외
   *    - 상품번호(A\d{12}) 포함 필수
   *
   * @param page Playwright Page 객체
   * @returns 썸네일 URL 또는 undefined
   */
  private async extractThumbnail(page: Page): Promise<string | undefined> {
    for (const selector of this.THUMBNAIL_SELECTORS) {
      const rawUrl = await DOMHelper.safeAttribute(page, selector, "src");
      let url = rawUrl.trim(); // 공백 제거

      if (this.isValidThumbnail(url)) {
        // 쿼리 파라미터 제거 (예: ?l=ko&QT=85&SF=webp → 제거)
        const urlWithoutQuery = url.split("?")[0];
        return urlWithoutQuery;
      }
    }

    return undefined;
  }

  /**
   * 썸네일 URL 유효성 검증
   *
   * 조건:
   * - oliveyoung.co.kr 도메인
   * - THUMBNAIL_EXCLUSIONS 경로 제외
   * - 상품번호(PRODUCT_NUMBER_PATTERN) 포함
   *
   * @param url 썸네일 URL
   * @returns 유효 여부
   */
  private isValidThumbnail(url: string): boolean {
    if (!url) {
      return false;
    }

    // oliveyoung.co.kr 도메인만
    if (!url.includes("oliveyoung.co.kr")) {
      return false;
    }

    // THUMBNAIL_EXCLUSIONS 경로 제외
    const hasExclusion = this.THUMBNAIL_EXCLUSIONS.some((exclusion) =>
      url.includes(exclusion),
    );
    if (hasExclusion) {
      return false;
    }

    // 상품번호 패턴 포함 필수
    if (!this.PRODUCT_NUMBER_PATTERN.test(url)) {
      return false;
    }

    return true;
  }
}

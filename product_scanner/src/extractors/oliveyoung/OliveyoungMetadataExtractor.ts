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
export class OliveyoungMetadataExtractor implements IMetadataExtractor {
  /**
   * 상품명 Selector 우선순위 (oliveyoung.yaml L209-235 기준)
   */
  private readonly PRODUCT_NAME_SELECTORS = [
    ".info-group__title", // 1순위: Mobile
    ".prd_name", // 2순위: Desktop
    '[class*="goods"][class*="name"]', // 3순위
    '[class*="product"][class*="name"]', // 4순위
    '[class*="title"]', // 5순위
    "h1", // 6순위
    ".goods_name", // 7순위
  ];

  /**
   * 브랜드 Selector 우선순위 (oliveyoung.yaml L253-272 기준)
   */
  private readonly BRAND_SELECTORS = [
    ".top-utils__brand-link", // 1순위: Mobile
    ".prd_brand", // 2순위: Desktop
    '[class*="brand"]', // 3순위
    ".brand-name", // 4순위
  ];

  /**
   * 썸네일 Selector 우선순위 (oliveyoung.yaml L274-342 기준)
   */
  private readonly THUMBNAIL_SELECTORS = [
    ".swiper-slide-active img", // 1순위: Swiper 활성
    ".swiper-slide img", // 2순위: Swiper 첫 슬라이드
    ".prd_img img", // 3순위: Desktop
    "#mainImg", // 4순위: Desktop 메인
    "img", // 5순위: Fallback
  ];

  /**
   * 올리브영 상품번호 패턴 (A + 12자리 숫자)
   */
  private readonly PRODUCT_NUMBER_PATTERN = /A\d{12}/;

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
   * - 3글자 이상만 유효
   * - 공백 제거 후 검증
   *
   * @param page Playwright Page 객체
   * @returns 상품명 또는 빈 문자열
   */
  private async extractProductName(page: Page): Promise<string> {
    for (const selector of this.PRODUCT_NAME_SELECTORS) {
      const text = await DOMHelper.safeText(page, selector);

      // 3글자 이상만 유효
      if (text && text.length >= 3) {
        return text;
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
      const url = rawUrl.trim(); // 공백 제거

      if (this.isValidThumbnail(url)) {
        return url;
      }
    }

    return undefined;
  }

  /**
   * 썸네일 URL 유효성 검증
   *
   * 조건:
   * - oliveyoung.co.kr 도메인
   * - options/item 경로 제외
   * - 상품번호(A\d{12}) 포함
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

    // options/item 경로 제외
    if (url.includes("options/item")) {
      return false;
    }

    // 상품번호(A\d{12}) 포함 필수
    if (!this.PRODUCT_NUMBER_PATTERN.test(url)) {
      return false;
    }

    return true;
  }
}

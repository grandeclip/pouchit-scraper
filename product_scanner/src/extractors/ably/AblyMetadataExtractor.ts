/**
 * AblyMetadataExtractor
 *
 * 목적: 에이블리 메타데이터 정보 추출
 * 패턴: Strategy Pattern
 * 참고: docs/analysis/ably-strategy-analysis.md L404-463
 */

import type { Page } from "playwright";
import type { IMetadataExtractor, MetadataData } from "@/extractors/base";
import { DOMHelper } from "@/extractors/common/DOMHelper";
import { logger } from "@/config/logger";

/**
 * 에이블리 메타데이터 추출기
 *
 * 전략 (ably.yaml 원본 로직):
 * 1. SSR (__NEXT_DATA__) 우선 시도
 *    - goods.name: 상품명
 *    - goods.market.name: 브랜드
 *    - goods.cover_images: 이미지 배열
 * 2. Meta tag fallback:
 *    - og:title → 상품명 (- 에이블리 제거)
 *    - og:image → 썸네일
 *    - brand: ""
 *
 * @implements {IMetadataExtractor<Page>} Playwright Page 기반 추출
 */
export class AblyMetadataExtractor implements IMetadataExtractor<Page> {
  /**
   * 메타데이터 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 메타데이터
   */
  async extract(page: Page): Promise<MetadataData> {
    const url = page.url();
    logger.debug({ url }, "[AblyMetadataExtractor] 메타데이터 추출 시작");

    // 1단계: SSR 데이터 우선
    const ssrMetadata = await this.extractFromSSR(page);
    if (ssrMetadata) {
      logger.debug(
        { url, productName: ssrMetadata.productName, brand: ssrMetadata.brand },
        "[AblyMetadataExtractor] SSR 메타데이터 추출 성공",
      );
      return ssrMetadata;
    }

    // 2단계: Meta tag fallback
    const metaData = await this.extractFromMeta(page);
    logger.debug(
      { url, productName: metaData.productName },
      "[AblyMetadataExtractor] Meta tag fallback 사용",
    );
    return metaData;
  }

  /**
   * SSR 데이터에서 메타데이터 추출
   *
   * 전략:
   * - __NEXT_DATA__ script 태그 파싱
   * - goods.name (상품명)
   * - goods.market.name (브랜드)
   * - goods.cover_images (이미지 배열)
   *
   * @param page Playwright Page 객체
   * @returns 메타데이터 또는 null
   */
  private async extractFromSSR(page: Page): Promise<MetadataData | null> {
    try {
      const goodsData = await page.evaluate(() => {
        const script = document.getElementById("__NEXT_DATA__");
        if (!script || !script.textContent) {
          return null;
        }

        const data = JSON.parse(script.textContent);
        const queries = data.props?.pageProps?.dehydratedState?.queries || [];

        for (const query of queries) {
          const goods = query.state?.data?.goods;
          if (goods && goods.name) {
            return {
              name: goods.name,
              brand: goods.market?.name || "",
              coverImages: goods.cover_images || [],
            };
          }
        }

        return null;
      });

      if (!goodsData) {
        return null;
      }

      return {
        productName: goodsData.name,
        brand: goodsData.brand || undefined,
        thumbnail: goodsData.coverImages[0] || undefined,
        images: goodsData.coverImages.slice(1),
      };
    } catch (error) {
      // SSR 파싱 실패 시 null 반환
      return null;
    }
  }

  /**
   * Meta tag에서 메타데이터 추출
   *
   * 전략 (ably.yaml L98-120):
   * - og:title → 상품명 (- 에이블리 제거)
   * - og:image → 썸네일
   * - brand: "" (브랜드 정보 없음)
   *
   * @param page Playwright Page 객체
   * @returns 메타데이터
   */
  private async extractFromMeta(page: Page): Promise<MetadataData> {
    const [metaTitle, metaImage] = await Promise.all([
      DOMHelper.safeAttribute(page, 'meta[property="og:title"]', "content"),
      DOMHelper.safeAttribute(page, 'meta[property="og:image"]', "content"),
    ]);

    // og:title에서 "- 에이블리" 제거
    const cleanTitle = metaTitle
      ? metaTitle.replace(/\s*-\s*에이블리.*$/, "").trim()
      : "";

    return {
      productName: cleanTitle,
      brand: undefined,
      thumbnail: metaImage || undefined,
      images: [],
    };
  }
}

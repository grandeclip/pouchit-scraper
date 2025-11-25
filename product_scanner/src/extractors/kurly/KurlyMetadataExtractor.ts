/**
 * KurlyMetadataExtractor
 *
 * 목적: 마켓컬리 메타데이터 정보 추출
 * 패턴: Strategy Pattern
 * 참고: docs/analysis/kurly-strategy-analysis.md
 */

import type { Page } from "playwright";
import type { IMetadataExtractor, MetadataData } from "@/extractors/base";
import { DOMHelper } from "@/extractors/common/DOMHelper";
import { logger } from "@/config/logger";

/**
 * SSR에서 추출한 메타데이터 타입
 */
interface KurlySSRMetadata {
  name: string;
  mainImageUrl: string;
  brand?: string;
}

/**
 * 마켓컬리 메타데이터 추출기
 *
 * 전략 (kurly.yaml 원본 로직):
 * 1. SSR (__NEXT_DATA__) 우선 시도
 *    - product.name: 상품명
 *    - product.mainImageUrl: 썸네일
 *    - product.brandInfo.nameGate.name: 브랜드
 * 2. Meta tag fallback:
 *    - og:title → 상품명
 *    - og:image → 썸네일
 *
 * @implements {IMetadataExtractor<Page>} Playwright Page 기반 추출
 */
export class KurlyMetadataExtractor implements IMetadataExtractor<Page> {
  /**
   * 메타데이터 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 메타데이터
   */
  async extract(page: Page): Promise<MetadataData> {
    const url = page.url();
    logger.debug({ url }, "[KurlyMetadataExtractor] 메타데이터 추출 시작");

    // 1단계: SSR 데이터 우선
    const ssrMetadata = await this.extractFromSSR(page);
    if (ssrMetadata) {
      logger.debug(
        { url, productName: ssrMetadata.productName, brand: ssrMetadata.brand },
        "[KurlyMetadataExtractor] SSR 메타데이터 추출 성공",
      );
      return ssrMetadata;
    }

    // 2단계: Meta tag fallback
    const metaData = await this.extractFromMeta(page);
    logger.debug(
      { url, productName: metaData.productName },
      "[KurlyMetadataExtractor] Meta tag fallback 사용",
    );
    return metaData;
  }

  /**
   * SSR 데이터에서 메타데이터 추출
   *
   * 전략:
   * - __NEXT_DATA__ script 태그 파싱
   * - product.name (상품명)
   * - product.mainImageUrl (썸네일)
   * - product.brandInfo.nameGate.name (브랜드)
   *
   * @param page Playwright Page 객체
   * @returns 메타데이터 또는 null
   */
  private async extractFromSSR(page: Page): Promise<MetadataData | null> {
    try {
      const productData = await page.evaluate((): KurlySSRMetadata | null => {
        const script = document.getElementById("__NEXT_DATA__");
        if (!script || !script.textContent) {
          return null;
        }

        try {
          const data = JSON.parse(script.textContent);
          const product = data.props?.pageProps?.product;

          if (!product || !product.name) {
            return null;
          }

          return {
            name: product.name,
            mainImageUrl: product.mainImageUrl || "",
            brand: product.brandInfo?.nameGate?.name || undefined,
          };
        } catch {
          return null;
        }
      });

      if (!productData) {
        return null;
      }

      return {
        productName: productData.name,
        brand: productData.brand || undefined,
        thumbnail: productData.mainImageUrl
          ? this.normalizeUrl(productData.mainImageUrl)
          : undefined,
        images: [],
      };
    } catch (error) {
      // SSR 파싱 실패 시 null 반환
      logger.warn(
        { error },
        "[KurlyMetadataExtractor] SSR 파싱 실패, Meta fallback 시도",
      );
      return null;
    }
  }

  /**
   * Meta tag에서 메타데이터 추출
   *
   * 전략:
   * - og:title → 상품명
   * - og:image → 썸네일
   * - brand: undefined (Meta에서 브랜드 정보 없음)
   *
   * @param page Playwright Page 객체
   * @returns 메타데이터
   */
  private async extractFromMeta(page: Page): Promise<MetadataData> {
    const [metaTitle, metaImage] = await Promise.all([
      DOMHelper.safeAttribute(page, 'meta[property="og:title"]', "content"),
      DOMHelper.safeAttribute(page, 'meta[property="og:image"]', "content"),
    ]);

    return {
      productName: metaTitle || "",
      brand: undefined,
      thumbnail: metaImage ? this.normalizeUrl(metaImage) : undefined,
      images: [],
    };
  }

  /**
   * URL 정규화 (쿼리 파라미터 제거)
   *
   * @param url 원본 URL
   * @returns 정규화된 URL
   */
  private normalizeUrl(url: string): string {
    return url.split("?")[0];
  }
}

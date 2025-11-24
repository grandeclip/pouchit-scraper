/**
 * HwahaeMetadataExtractor
 *
 * 목적: 화해 메타데이터 정보 추출 (API 기반)
 * 패턴: Strategy Pattern
 */

import type { IMetadataExtractor, MetadataData } from "@/extractors/base";
import type { HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

/**
 * 화해 메타데이터 추출기 (API 기반)
 *
 * 전략:
 * - API response에서 직접 메타데이터 추출
 * - name → productName
 * - title_images[0] → thumbnail
 * - title_images → images
 * - brand는 API에 없음 (undefined)
 *
 * @implements {IMetadataExtractor<HwahaeApiResponse>} HTTP API 기반 추출
 */
export class HwahaeMetadataExtractor
  implements IMetadataExtractor<HwahaeApiResponse>
{
  /**
   * 메타데이터 정보 추출
   *
   * @param response 화해 API 응답 객체
   * @returns 추출된 메타데이터
   */
  async extract(response: HwahaeApiResponse): Promise<MetadataData> {
    return {
      productName: response.name,
      brand: undefined, // 화해 API는 브랜드 정보 미제공
      thumbnail: this.extractThumbnail(response.title_images),
      images: this.extractImages(response.title_images),
    };
  }

  /**
   * 썸네일 이미지 추출
   *
   * @param titleImages 타이틀 이미지 배열
   * @returns 썸네일 URL 또는 undefined
   */
  private extractThumbnail(titleImages: string[]): string | undefined {
    if (!titleImages || titleImages.length === 0) {
      return undefined;
    }

    // 첫 번째 이미지를 썸네일로 사용
    return titleImages[0] || undefined;
  }

  /**
   * 상세 이미지 목록 추출
   *
   * @param titleImages 타이틀 이미지 배열
   * @returns 이미지 URL 배열 또는 undefined
   */
  private extractImages(titleImages: string[]): string[] | undefined {
    if (!titleImages || titleImages.length === 0) {
      return undefined;
    }

    // 빈 문자열 필터링
    const validImages = titleImages.filter((url) => url && url.trim());

    return validImages.length > 0 ? validImages : undefined;
  }
}

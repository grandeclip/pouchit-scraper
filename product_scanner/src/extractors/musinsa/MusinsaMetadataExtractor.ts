/**
 * MusinsaMetadataExtractor
 *
 * 목적: 무신사 메타데이터 추출 (API 기반)
 * 패턴: Strategy Pattern
 * 입력: MusinsaApiResponse (HTTP API JSON)
 */

import type { IMetadataExtractor, MetadataData } from "@/extractors/base";
import type { MusinsaApiResponse } from "./MusinsaPriceExtractor";

/**
 * 무신사 메타데이터 추출기 (API 기반)
 *
 * 전략:
 * - API response에서 메타데이터 직접 추출
 * - goodsNm → productName
 * - thumbnailImageUrl → thumbnail (CDN Base URL 추가)
 * - 브랜드 정보 미제공 (undefined)
 *
 * @implements {IMetadataExtractor<MusinsaApiResponse>} HTTP API 기반 추출
 */
export class MusinsaMetadataExtractor
  implements IMetadataExtractor<MusinsaApiResponse>
{
  /**
   * 무신사 이미지 CDN Base URL
   * Dependency Injection으로 주입받아 테스트 가능
   */
  constructor(private readonly imageCdnBaseUrl: string) {}

  /**
   * 메타데이터 추출
   *
   * @param response 무신사 API 응답 객체
   * @returns 추출된 메타데이터
   */
  async extract(response: MusinsaApiResponse): Promise<MetadataData> {
    const { goodsNm, thumbnailImageUrl } = response.data;

    const thumbnail = this.buildThumbnailUrl(thumbnailImageUrl);

    return {
      productName: goodsNm,
      brand: undefined, // 무신사 API는 브랜드 정보 미제공
      thumbnail,
      images: [thumbnail],
    };
  }

  /**
   * 썸네일 URL 생성
   *
   * API가 상대 경로를 반환하므로 CDN Base URL 추가
   * 예: "/thumbnails/images/..." → "https://image.msscdn.net/thumbnails/images/..."
   *
   * @param path 상대 경로
   * @returns 절대 URL
   */
  private buildThumbnailUrl(path: string): string {
    return `${this.imageCdnBaseUrl}${path}`;
  }
}

/**
 * ZigzagMetadataExtractor
 *
 * 목적: ZigZag GraphQL 응답에서 메타데이터 추출
 * 패턴: Strategy Pattern
 * 입력: ZigzagGraphQLResponse
 *
 * 핵심 로직:
 * - productName: catalog_product.name
 * - brand: catalog_product.shop_name
 * - thumbnail: product_image_list에서 MAIN 타입 필터링
 */

import type { IMetadataExtractor, MetadataData } from "@/extractors/base";
import type {
  ZigzagGraphQLResponse,
  ProductImage,
} from "./ZigzagPriceExtractor";

/**
 * ZigZag 메타데이터 추출기
 *
 * 전략:
 * - GraphQL 응답에서 직접 추출
 * - MAIN 이미지 타입 필터링
 *
 * @implements {IMetadataExtractor<ZigzagGraphQLResponse>}
 */
export class ZigzagMetadataExtractor
  implements IMetadataExtractor<ZigzagGraphQLResponse>
{
  /**
   * 메타데이터 추출
   *
   * @param response GraphQL 응답
   * @returns 메타데이터
   * @throws Error 상품 데이터 없음
   */
  async extract(response: ZigzagGraphQLResponse): Promise<MetadataData> {
    const product = response.data?.pdp_option_info?.catalog_product;

    if (!product) {
      throw new Error("Product not found in GraphQL response");
    }

    const thumbnail = this.extractMainImage(product.product_image_list);
    const images = this.extractAllImages(product.product_image_list);

    return {
      productName: product.name || "",
      brand: product.shop_name,
      thumbnail,
      images: images.length > 0 ? images : undefined,
    };
  }

  /**
   * MAIN 이미지 URL 추출
   *
   * @param imageList 이미지 목록
   * @returns MAIN 이미지 URL 또는 빈 문자열
   */
  private extractMainImage(imageList: ProductImage[] | undefined): string {
    if (!imageList || imageList.length === 0) {
      return "";
    }

    const mainImage = imageList.find((img) => img.image_type === "MAIN");
    return mainImage?.pdp_thumbnail_url || "";
  }

  /**
   * 모든 이미지 URL 추출
   *
   * @param imageList 이미지 목록
   * @returns 이미지 URL 배열
   */
  private extractAllImages(imageList: ProductImage[] | undefined): string[] {
    if (!imageList || imageList.length === 0) {
      return [];
    }

    return imageList
      .map((img) => img.pdp_thumbnail_url)
      .filter((url) => url && url.length > 0);
  }
}

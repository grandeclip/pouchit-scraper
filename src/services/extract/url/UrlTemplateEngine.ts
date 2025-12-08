/**
 * URL Template Engine
 *
 * YAML urlTemplates 설정을 사용하여 상품 ID → URL 변환
 * 템플릿 변수: ${productId}
 */

import { ConfigLoader } from "@/config/ConfigLoader";
import { logger } from "@/config/logger";
import type { SupportedPlatform } from "./PlatformDetector";

/**
 * URL 템플릿 설정 (YAML에서 로드)
 */
interface UrlTemplatesConfig {
  productDetail?: string;
  search?: string;
}

/**
 * URL Template Engine
 */
export class UrlTemplateEngine {
  /**
   * 템플릿 변수 치환
   * @param template URL 템플릿 (예: "https://.../${productId}")
   * @param variables 치환할 변수들
   * @returns 완성된 URL
   */
  static render(template: string, variables: Record<string, string>): string {
    return template.replace(/\$\{(\w+)\}/g, (match, key) => {
      const value = variables[key];
      if (value === undefined) {
        logger.warn({ template, key }, "Missing template variable");
        return match; // 치환 실패 시 원본 유지
      }
      return value;
    });
  }

  /**
   * 플랫폼 설정에서 상품 상세 URL 생성
   * @param platform 플랫폼 ID
   * @param productId 상품 ID
   * @returns 완성된 URL
   * @throws URL 템플릿 없는 경우 에러
   */
  static buildProductDetailUrl(platform: string, productId: string): string {
    const config = ConfigLoader.getInstance().loadConfig(platform);
    const urlTemplates = config.urlTemplates as UrlTemplatesConfig | undefined;
    const template = urlTemplates?.productDetail;

    if (!template) {
      throw new Error(
        `No productDetail URL template for platform: ${platform}`
      );
    }

    return this.render(template, { productId });
  }

  /**
   * 플랫폼이 URL 템플릿을 지원하는지 확인
   * @param platform 플랫폼 ID
   * @returns URL 템플릿 존재 여부
   */
  static hasProductDetailTemplate(platform: string): boolean {
    try {
      const config = ConfigLoader.getInstance().loadConfig(platform);
      const urlTemplates = config.urlTemplates as
        | UrlTemplatesConfig
        | undefined;
      return !!urlTemplates?.productDetail;
    } catch {
      return false;
    }
  }

  /**
   * 지원되는 모든 플랫폼의 URL 템플릿 목록 반환
   * @returns 플랫폼별 URL 템플릿
   */
  static getAllTemplates(): Record<
    string,
    { productDetail?: string; search?: string }
  > {
    const platforms: SupportedPlatform[] = [
      "oliveyoung",
      "hwahae",
      "musinsa",
      "ably",
      "kurly",
      "zigzag",
    ];

    const templates: Record<
      string,
      { productDetail?: string; search?: string }
    > = {};

    for (const platform of platforms) {
      try {
        const config = ConfigLoader.getInstance().loadConfig(platform);
        const urlTemplates = config.urlTemplates as
          | UrlTemplatesConfig
          | undefined;
        if (urlTemplates) {
          templates[platform] = urlTemplates;
        }
      } catch {
        // 설정 로드 실패 시 스킵
      }
    }

    return templates;
  }
}


/**
 * Platform Detector
 *
 * URL에서 플랫폼 감지 및 상품 ID 추출
 * 기존 ValidationNode들의 extractProductId 로직 통합
 */

import { logger } from "@/config/logger";

/**
 * 지원 플랫폼 목록
 */
export const SUPPORTED_PLATFORMS = [
  "oliveyoung",
  "hwahae",
  "musinsa",
  "ably",
  "kurly",
  "zigzag",
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

/**
 * 플랫폼 감지 결과
 */
export interface PlatformDetectionResult {
  /** 감지된 플랫폼 (null이면 미지원) */
  platform: SupportedPlatform | null;
  /** 추출된 상품 ID (null이면 추출 실패) */
  productId: string | null;
}

/**
 * 플랫폼별 URL 패턴 및 상품 ID 추출 규칙
 */
interface PlatformPattern {
  /** URL 도메인 패턴 */
  domainPattern: string;
  /** 상품 ID 추출 함수 */
  extractId: (url: string) => string | null;
}

/**
 * 플랫폼별 패턴 정의
 */
const PLATFORM_PATTERNS: Record<SupportedPlatform, PlatformPattern> = {
  /**
   * Oliveyoung: goodsNo 쿼리 파라미터
   * 예: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822
   */
  oliveyoung: {
    domainPattern: "oliveyoung.co.kr",
    extractId: (url: string): string | null => {
      try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get("goodsNo");
      } catch {
        return null;
      }
    },
  },

  /**
   * Hwahae: /goods/{id} 또는 /products/{name}/{id} 경로
   * 예: https://www.hwahae.co.kr/goods/21320
   *     https://www.hwahae.co.kr/products/상품명/2099549
   */
  hwahae: {
    domainPattern: "hwahae.co.kr",
    extractId: (url: string): string | null => {
      // Query parameter 제거
      const urlWithoutQuery = url.split("?")[0];

      // /goods/ 또는 /products/ 이후 경로 추출
      const pathMatch = urlWithoutQuery.match(
        /\/(?:goods|products)\/(.+?)(?:\/)?$/
      );
      if (!pathMatch) return null;

      // 마지막 경로 세그먼트에서 숫자 추출
      const pathSegment = pathMatch[1];
      const segments = pathSegment.split("/");
      const lastSegment = segments[segments.length - 1];

      // 숫자만 추출
      const numericMatch = lastSegment.match(/^(\d+)$/);
      return numericMatch ? numericMatch[1] : null;
    },
  },

  /**
   * Musinsa: /products/{id} 경로
   * 예: https://www.musinsa.com/products/4350236
   */
  musinsa: {
    domainPattern: "musinsa.com",
    extractId: (url: string): string | null => {
      try {
        const match = url.match(/\/products\/(\d+)/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    },
  },

  /**
   * Ably: /goods/{id} 경로
   * 예: https://m.a-bly.com/goods/32438971
   */
  ably: {
    domainPattern: "a-bly.com",
    extractId: (url: string): string | null => {
      try {
        const urlObj = new URL(url);
        const match = urlObj.pathname.match(/\/goods\/(\d+)/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    },
  },

  /**
   * Kurly: /goods/{id} 경로
   * 예: https://www.kurly.com/goods/1000284986
   */
  kurly: {
    domainPattern: "kurly.com",
    extractId: (url: string): string | null => {
      try {
        const urlObj = new URL(url);
        const match = urlObj.pathname.match(/\/goods\/(\d+)/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    },
  },

  /**
   * Zigzag: /catalog/products/{id} 경로
   * 예: https://zigzag.kr/catalog/products/157001205
   */
  zigzag: {
    domainPattern: "zigzag.kr",
    extractId: (url: string): string | null => {
      try {
        const match = url.match(/\/catalog\/products\/(\d+)/);
        return match ? match[1] : null;
      } catch {
        return null;
      }
    },
  },
};

/**
 * Platform Detector 클래스
 */
export class PlatformDetector {
  /**
   * URL에서 플랫폼 감지
   * @param url 상품 URL
   * @returns 감지된 플랫폼 (null이면 미지원)
   */
  static detectPlatform(url: string): SupportedPlatform | null {
    for (const platform of SUPPORTED_PLATFORMS) {
      const pattern = PLATFORM_PATTERNS[platform];
      if (url.includes(pattern.domainPattern)) {
        return platform;
      }
    }
    return null;
  }

  /**
   * URL에서 상품 ID 추출
   * @param url 상품 URL
   * @param platform 플랫폼 (미제공 시 자동 감지)
   * @returns 상품 ID (null이면 추출 실패)
   */
  static extractProductId(
    url: string,
    platform?: SupportedPlatform
  ): string | null {
    const detectedPlatform = platform ?? this.detectPlatform(url);
    if (!detectedPlatform) {
      return null;
    }

    const pattern = PLATFORM_PATTERNS[detectedPlatform];
    return pattern.extractId(url);
  }

  /**
   * URL에서 플랫폼 + 상품 ID 동시 추출
   * @param url 상품 URL
   * @returns 플랫폼 및 상품 ID
   */
  static detect(url: string): PlatformDetectionResult {
    const platform = this.detectPlatform(url);

    if (!platform) {
      logger.debug({ url }, "Platform not detected from URL");
      return { platform: null, productId: null };
    }

    const productId = this.extractProductId(url, platform);

    if (!productId) {
      logger.debug({ url, platform }, "ProductId not extracted from URL");
    }

    return { platform, productId };
  }

  /**
   * 플랫폼이 지원되는지 확인
   * @param platform 플랫폼 문자열
   * @returns 지원 여부
   */
  static isSupported(platform: string): platform is SupportedPlatform {
    return SUPPORTED_PLATFORMS.includes(platform as SupportedPlatform);
  }
}


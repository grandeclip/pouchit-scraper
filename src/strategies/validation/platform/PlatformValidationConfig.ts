/**
 * Platform Validation Config
 *
 * Phase 4 Step 4.9
 *
 * SOLID 원칙:
 * - SRP: 플랫폼별 검증 설정만 담당
 * - OCP: 새 플랫폼 추가 시 확장 가능
 *
 * 목적:
 * - 플랫폼별 검증 설정 중앙 관리
 * - Phase 4 노드 구성에서 플랫폼별 설정 조회
 * - BaseValidationNode 의존성 제거
 */

/**
 * 플랫폼별 URL 패턴
 */
export interface UrlPattern {
  /** 도메인 포함 문자열 */
  domain: string;

  /** 상품 ID 추출 패턴 (정규식 문자열) */
  productIdPattern: string;

  /** 상품 ID 추출 그룹 인덱스 */
  productIdGroup?: number;

  /** URL 템플릿 (상품 상세 페이지) */
  detailUrlTemplate?: string;
}

/**
 * 플랫폼별 스캔 설정
 */
export interface ScanConfig {
  /** 스캔 방식 (api | browser) */
  scanMethod: "api" | "browser";

  /** API 기반 스캔 시 스크린샷 불필요 */
  skipScreenshot?: boolean;

  /** 기본 타임아웃 (ms) */
  defaultTimeoutMs?: number;

  /** 동시 처리 수 */
  defaultConcurrency?: number;
}

/**
 * 플랫폼 검증 설정
 */
export interface IPlatformValidationConfig {
  /** 플랫폼 식별자 */
  platform: string;

  /** 플랫폼 표시명 */
  displayName: string;

  /** URL 패턴 */
  urlPattern: UrlPattern;

  /** 스캔 설정 */
  scanConfig: ScanConfig;

  /** Extractor ID (ExtractorRegistry에서 조회) */
  extractorId?: string;
}

/**
 * 지원 플랫폼 목록
 */
export type SupportedPlatform =
  | "hwahae"
  | "oliveyoung"
  | "musinsa"
  | "ably"
  | "kurly"
  | "zigzag"
  | "coupang";

/**
 * 플랫폼별 검증 설정 정의
 */
export const PLATFORM_VALIDATION_CONFIGS: Record<
  SupportedPlatform,
  IPlatformValidationConfig
> = {
  hwahae: {
    platform: "hwahae",
    displayName: "화해",
    urlPattern: {
      domain: "hwahae.co.kr",
      productIdPattern: "/(?:goods|products)/(?:.+/)?(\\d+)",
      productIdGroup: 1,
      detailUrlTemplate: "https://www.hwahae.co.kr/goods/${productId}",
    },
    scanConfig: {
      scanMethod: "api",
      skipScreenshot: true,
      defaultTimeoutMs: 30000,
      defaultConcurrency: 10,
    },
    extractorId: "hwahae",
  },

  oliveyoung: {
    platform: "oliveyoung",
    displayName: "올리브영",
    urlPattern: {
      domain: "oliveyoung.co.kr",
      productIdPattern: "goodsNo=([A-Z0-9]+)",
      productIdGroup: 1,
      detailUrlTemplate:
        "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${productId}",
    },
    scanConfig: {
      scanMethod: "browser",
      skipScreenshot: false,
      defaultTimeoutMs: 30000,
      defaultConcurrency: 5,
    },
    extractorId: "oliveyoung",
  },

  musinsa: {
    platform: "musinsa",
    displayName: "무신사",
    urlPattern: {
      domain: "musinsa.com",
      productIdPattern: "/products/(\\d+)",
      productIdGroup: 1,
      detailUrlTemplate: "https://www.musinsa.com/products/${productId}",
    },
    scanConfig: {
      scanMethod: "browser",
      skipScreenshot: false,
      defaultTimeoutMs: 30000,
      defaultConcurrency: 5,
    },
    extractorId: "musinsa",
  },

  ably: {
    platform: "ably",
    displayName: "에이블리",
    urlPattern: {
      domain: "a-bly.com",
      productIdPattern: "/goods/(\\d+)",
      productIdGroup: 1,
      detailUrlTemplate: "https://m.a-bly.com/goods/${productId}",
    },
    scanConfig: {
      scanMethod: "browser",
      skipScreenshot: false,
      defaultTimeoutMs: 30000,
      defaultConcurrency: 5,
    },
    extractorId: "ably",
  },

  kurly: {
    platform: "kurly",
    displayName: "컬리",
    urlPattern: {
      domain: "kurly.com",
      productIdPattern: "/goods/(\\d+)",
      productIdGroup: 1,
      detailUrlTemplate: "https://www.kurly.com/goods/${productId}",
    },
    scanConfig: {
      scanMethod: "browser",
      skipScreenshot: false,
      defaultTimeoutMs: 30000,
      defaultConcurrency: 5,
    },
    extractorId: "kurly",
  },

  zigzag: {
    platform: "zigzag",
    displayName: "지그재그",
    urlPattern: {
      domain: "zigzag.kr",
      productIdPattern: "/catalog/products/(\\d+)",
      productIdGroup: 1,
      detailUrlTemplate:
        "https://zigzag.kr/catalog/products/${productId}?title=",
    },
    scanConfig: {
      scanMethod: "browser",
      skipScreenshot: false,
      defaultTimeoutMs: 30000,
      defaultConcurrency: 5,
    },
    extractorId: "zigzag",
  },

  coupang: {
    platform: "coupang",
    displayName: "쿠팡",
    urlPattern: {
      domain: "coupang.com",
      productIdPattern: "/products/(\\d+)",
      productIdGroup: 1,
      detailUrlTemplate: "https://www.coupang.com/products/${productId}",
    },
    scanConfig: {
      scanMethod: "browser",
      skipScreenshot: false,
      defaultTimeoutMs: 30000,
      defaultConcurrency: 3, // 쿠팡은 rate limit이 엄격함
    },
    extractorId: undefined, // 아직 미구현
  },
};

/**
 * 플랫폼 설정 조회
 * @param platform 플랫폼 식별자
 * @returns 플랫폼 설정 또는 undefined
 */
export function getPlatformConfig(
  platform: string,
): IPlatformValidationConfig | undefined {
  return PLATFORM_VALIDATION_CONFIGS[platform as SupportedPlatform];
}

/**
 * URL에서 플랫폼 감지
 * @param url 상품 URL
 * @returns 플랫폼 식별자 또는 null
 */
export function detectPlatformFromUrl(url: string): SupportedPlatform | null {
  for (const [platform, config] of Object.entries(
    PLATFORM_VALIDATION_CONFIGS,
  )) {
    if (url.includes(config.urlPattern.domain)) {
      return platform as SupportedPlatform;
    }
  }
  return null;
}

/**
 * URL에서 상품 ID 추출
 * @param url 상품 URL
 * @param platform 플랫폼 식별자
 * @returns 상품 ID 또는 null
 */
export function extractProductIdFromUrl(
  url: string,
  platform: SupportedPlatform,
): string | null {
  const config = PLATFORM_VALIDATION_CONFIGS[platform];
  if (!config) return null;

  const { productIdPattern, productIdGroup = 1 } = config.urlPattern;
  const regex = new RegExp(productIdPattern);
  const match = url.match(regex);

  return match ? match[productIdGroup] : null;
}

/**
 * 상품 상세 URL 생성
 * @param productId 상품 ID
 * @param platform 플랫폼 식별자
 * @returns 상품 상세 URL 또는 null
 */
export function buildProductDetailUrl(
  productId: string,
  platform: SupportedPlatform,
): string | null {
  const config = PLATFORM_VALIDATION_CONFIGS[platform];
  if (!config || !config.urlPattern.detailUrlTemplate) return null;

  return config.urlPattern.detailUrlTemplate.replace("${productId}", productId);
}

/**
 * 지원 플랫폼 목록 조회
 */
export function getSupportedPlatforms(): SupportedPlatform[] {
  return Object.keys(PLATFORM_VALIDATION_CONFIGS) as SupportedPlatform[];
}

/**
 * 플랫폼이 지원되는지 확인
 */
export function isPlatformSupported(platform: string): boolean {
  return platform in PLATFORM_VALIDATION_CONFIGS;
}

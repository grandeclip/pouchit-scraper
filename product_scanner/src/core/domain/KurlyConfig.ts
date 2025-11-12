/**
 * 컬리 설정 도메인 모델
 * YAML 구조를 TypeScript 타입으로 정의
 *
 * SOLID 원칙:
 * - OCP: strategies 배열로 확장 가능
 * - ISP: 전략별 설정 분리
 * - DIP: PlatformConfig 인터페이스 확장
 */

import { PlatformConfig } from "@/core/domain/PlatformConfig";
import { StrategyConfig } from "@/core/domain/StrategyConfig";
import { PLATFORM_IDS } from "@/core/domain/PlatformId";

/**
 * 컬리 플랫폼 전체 설정
 */
export interface KurlyConfig extends PlatformConfig {
  platform: typeof PLATFORM_IDS.KURLY;
  name: string;
  baseUrl: string;
  endpoints: EndpointsConfig;
  strategies: StrategyConfig[];
  fieldMapping: FieldMappingConfig;
  validation: ValidationConfig;
  errorHandling: ErrorHandlingConfig;
}

/**
 * API 엔드포인트 설정
 */
export interface EndpointsConfig {
  [key: string]: string;
}

/**
 * 필드 매핑 설정
 */
export interface FieldMappingConfig {
  productName: FieldMappingRule;
  thumbnail: FieldMappingRule;
  originalPrice: FieldMappingRule;
  discountedPrice: FieldMappingRule;
  saleStatus: SaleStatusMappingRule;
}

/**
 * 개별 필드 매핑 규칙
 */
export interface FieldMappingRule {
  source: string;
  type: "string" | "number" | "enum";
  required: boolean;
  normalize?: boolean;
}

/**
 * 판매 상태 매핑 규칙
 */
export interface SaleStatusMappingRule extends FieldMappingRule {
  type: "enum";
  mapping: {
    ON_SALE: string;
    SOLD_OUT: string;
    INFO_CHANGED: string;
    NOT_FOUND: string;
    ERROR: string;
  };
}

/**
 * 검증 규칙
 */
export interface ValidationConfig {
  priceThreshold: number;
  normalizeUrls: boolean;
  strictMode: boolean;
}

/**
 * 에러 처리 설정
 */
export interface ErrorHandlingConfig {
  notFound: string;
  rateLimitDelay: number;
  serverErrorRetry: boolean;
}

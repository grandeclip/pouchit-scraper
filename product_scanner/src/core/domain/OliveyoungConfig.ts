/**
 * 올리브영 설정 도메인 모델
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
 * 올리브영 플랫폼 전체 설정
 */
export interface OliveyoungConfig extends PlatformConfig {
  platform: typeof PLATFORM_IDS.OLIVEYOUNG;
  name: string;
  baseUrl: string;
  endpoints: EndpointsConfig;
  strategies: StrategyConfig[]; // 다중 전략 지원
  fieldMapping: FieldMappingConfig;
  validation: ValidationConfig;
  errorHandling: ErrorHandlingConfig;
}

/**
 * API 엔드포인트 설정 (현재는 빈 객체, 향후 확장 가능)
 */
export interface EndpointsConfig {
  [key: string]: string;
}

/**
 * 필드 매핑 설정
 */
export interface FieldMappingConfig {
  productName: FieldMappingRule;
  brand?: FieldMappingRule;
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
    SELNG: string;
    SLDOT: string;
    STSEL: string;
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

/**
 * 검증 요청 (Supabase row 데이터)
 */
export interface ValidationRequest {
  goodsNo: string;
  productName: string;
  brand?: string;
  thumbnail: string;
  originalPrice: number;
  discountedPrice: number;
  saleStatus: string;
}

/**
 * 검증 결과
 */
export interface ValidationResult {
  success: boolean;
  goodsNo: string;
  productName: string;
  differences: FieldDifference[];
  summary: {
    totalFields: number;
    matchedFields: number;
    mismatchedFields: number;
  };
  error?: string;
}

/**
 * 필드 차이 상세
 */
export interface FieldDifference {
  field: string;
  csvValue: any;
  apiValue: any;
  matched: boolean;
  message?: string;
}

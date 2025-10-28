/**
 * 상품 검색 설정 도메인 모델
 * YAML 구조를 TypeScript 타입으로 정의
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색 설정
 */

import { ShoppingMall } from './Product';
import { NavigationConfig } from './NavigationStep';

/**
 * 상품 검색 전체 설정
 */
export interface ProductSearchConfig {
  mall: ShoppingMall;
  name: string;
  baseUrl: string;
  searchUrl: string;
  browser: BrowserConfig;
  navigation: NavigationConfig;
  extraction: ExtractionConfig;

  // 쇼핑몰별 커스텀 설정 (선택 사항)
  // 예: ably.maxProductsToCheck, zigzag.scrollDistance 등
  [key: string]: any;
}

/**
 * 브라우저 설정
 */
export interface BrowserConfig {
  headless: boolean;
  args: string[];
  viewport: {
    width: number;
    height: number;
  };
  userAgent: string;
}

/**
 * 데이터 추출 설정
 */
export interface ExtractionConfig {
  type: 'evaluate' | 'selector';
  containerSelector?: string;
  script?: string;
  scriptArgs?: string[];
  fields: FieldExtractionConfig;
}

/**
 * 필드 추출 설정 (맵)
 */
export interface FieldExtractionConfig {
  [fieldName: string]: FieldConfig;
}

/**
 * 개별 필드 설정
 */
export interface FieldConfig {
  selector?: string;
  type?: 'text' | 'attribute' | 'html';
  attribute?: string;
  regex?: string;
  group?: number;
  transform?: TransformType;
  parse?: ParseType;
  required?: boolean;
  nullable?: boolean;
  fallback?: string;
  multiple?: boolean;
}

/**
 * 변환 타입
 */
export type TransformType =
  | 'removeNonDigits'
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'removeCommas';

/**
 * 파싱 타입
 */
export type ParseType = 'int' | 'float' | 'boolean';

/**
 * 상품 검색 요청
 */
export interface ProductSearchRequest {
  brand: string;
  productName: string;
}

/**
 * 상품 검색 결과
 */
export interface ProductSearchResult {
  success: boolean;
  products: any[];
  message: string;          // 결과 메시지 (항상 포함)
  error?: string;           // 에러 상세 (실패 시)
  mall?: ShoppingMall;
  userAgent?: {
    id: string;
    value: string;
    description: string;
    platform: string;
    browser: string;
  };
}


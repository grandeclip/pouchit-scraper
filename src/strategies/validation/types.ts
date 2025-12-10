/**
 * Phase 4 Validation Node Types
 *
 * 목적:
 * - 노드 간 데이터 전달 타입 정의
 * - 파이프라인 타입 안전성 보장
 */

import { ProductSetSearchResult } from "@/core/domain/ProductSet";

// ============================================================
// FetchProductNode Types
// ============================================================

/**
 * FetchProductNode 입력 (Workflow Context에서 추출)
 */
export interface FetchProductInput {
  /** Platform 필터 (link_url ILIKE 패턴) */
  link_url_pattern?: string;

  /** 판매 상태 필터 */
  sale_status?: string;

  /** 특정 product_id 조회 (Multi-Platform) */
  product_id?: string;

  /** 조회 제한 수. undefined면 전체 조회 (자동 pagination) */
  limit?: number;

  /** 배치 크기 (병렬 처리용) */
  batch_size?: number;

  /** auto_crawled=true 제외 (스케줄러용) */
  exclude_auto_crawled?: boolean;
}

/**
 * FetchProductNode 출력
 */
export interface FetchProductOutput {
  /** 조회된 상품 목록 */
  products: ProductSetSearchResult[];

  /** 총 조회 수 */
  count: number;

  /** 배치 정보 (병렬 처리용) */
  batch_info?: {
    batch_size: number;
    total_batches: number;
  };
}

// ============================================================
// ScanProductNode Types
// ============================================================

/**
 * 단일 스캔 결과
 */
export interface SingleScanResult {
  /** 상품 세트 ID */
  product_set_id: string;

  /** 상품 ID */
  product_id: string;

  /** 스캔 성공 여부 */
  success: boolean;

  /** 스캔된 데이터 */
  scanned_data?: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  };

  /** 에러 메시지 (실패 시) */
  error?: string;

  /** 스캔 URL */
  url: string | null;

  /** 스캔 시간 */
  scanned_at: string;
}

/**
 * ScanProductNode 입력
 */
export interface ScanProductInput {
  /** 스캔 대상 상품 목록 */
  products: ProductSetSearchResult[];
}

/**
 * ScanProductNode 출력
 */
export interface ScanProductOutput {
  /** 스캔 결과 목록 */
  results: SingleScanResult[];

  /** 성공 수 */
  success_count: number;

  /** 실패 수 */
  failure_count: number;
}

// ============================================================
// ValidateProductNode Types
// ============================================================

/**
 * 유효성 검증 결과
 */
export interface ValidationCheckResult {
  /** 검증 항목 */
  field: string;

  /** 유효 여부 */
  valid: boolean;

  /** 검증 메시지 */
  message?: string;
}

/**
 * 단일 검증 결과
 */
export interface SingleValidationResult {
  /** 상품 세트 ID */
  product_set_id: string;

  /** 상품 ID */
  product_id: string;

  /** 스캔 결과 참조 */
  scan_result: SingleScanResult;

  /** 검증 통과 여부 */
  is_valid: boolean;

  /** 검증 상세 결과 */
  checks: ValidationCheckResult[];

  /** 검증 시간 */
  validated_at: string;
}

/**
 * ValidateProductNode 입력
 */
export interface ValidateProductInput {
  /** 스캔 결과 목록 */
  results: SingleScanResult[];
}

/**
 * ValidateProductNode 출력
 */
export interface ValidateProductOutput {
  /** 검증 결과 목록 */
  results: SingleValidationResult[];

  /** 유효 수 */
  valid_count: number;

  /** 무효 수 */
  invalid_count: number;
}

// ============================================================
// CompareProductNode Types
// ============================================================

/**
 * 필드 비교 결과
 */
export interface FieldComparison {
  field: string;
  db_value: unknown;
  scanned_value: unknown;
  match: boolean;
}

/**
 * 단일 비교 결과
 */
export interface SingleComparisonResult {
  /** 상품 세트 ID */
  product_set_id: string;

  /** 상품 ID */
  product_id: string;

  /** URL */
  url: string | null;

  /** DB 데이터 */
  db: {
    product_name: string | null;
    thumbnail?: string | null;
    original_price?: number | null;
    discounted_price?: number | null;
    sale_status?: string | null;
  };

  /** 스캔 데이터 */
  fetch: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  } | null;

  /** 필드별 비교 결과 */
  comparison: {
    product_name: boolean;
    thumbnail: boolean;
    original_price: boolean;
    discounted_price: boolean;
    sale_status: boolean;
  };

  /** 전체 일치 여부 */
  match: boolean;

  /** 상태: success, failed, not_found */
  status: "success" | "failed" | "not_found";

  /** 에러 메시지 */
  error?: string;

  /** 비교 시간 */
  compared_at: string;
}

/**
 * CompareProductNode 입력
 */
export interface CompareProductInput {
  /** 검증 결과 목록 */
  results: SingleValidationResult[];

  /** 원본 상품 데이터 (DB) */
  original_products: ProductSetSearchResult[];
}

/**
 * CompareProductNode 출력
 */
export interface CompareProductOutput {
  /** 비교 결과 목록 */
  results: SingleComparisonResult[];

  /** 일치 수 */
  match_count: number;

  /** 불일치 수 */
  mismatch_count: number;

  /** 실패 수 */
  failure_count: number;
}

// ============================================================
// SaveResultNode Types
// ============================================================

/**
 * SaveResultNode 입력
 */
export interface SaveResultInput {
  /** 비교 결과 목록 */
  results: SingleComparisonResult[];

  /** 저장 옵션 */
  options?: {
    save_to_supabase?: boolean;
    save_to_jsonl?: boolean;
    update_product_set?: boolean;
  };
}

/**
 * SaveResultNode 출력
 */
export interface SaveResultOutput {
  /** JSONL 파일 경로 */
  jsonl_path?: string;

  /** 저장된 레코드 수 */
  record_count: number;

  /** Supabase 업데이트 수 */
  supabase_updated?: number;

  /** 요약 */
  summary: {
    total: number;
    success: number;
    failed: number;
    not_found: number;
    match: number;
    mismatch: number;
  };
}

// ============================================================
// NotifyResultNode Types
// ============================================================

/**
 * NotifyResultNode 입력
 */
export interface NotifyResultInput {
  /** 저장 결과 */
  save_result: SaveResultOutput;

  /** Platform */
  platform: string;

  /** Job ID */
  job_id: string;

  /** Workflow ID */
  workflow_id: string;
}

/**
 * NotifyResultNode 출력
 */
export interface NotifyResultOutput {
  /** 알림 전송 여부 */
  notified: boolean;

  /** 알림 채널 */
  channels?: string[];

  /** 에러 메시지 (실패 시) */
  error?: string;
}

// ============================================================
// Phase 4 Extract Node Types (Phase 2 마이그레이션)
// ============================================================

/**
 * 공통 스캔 데이터 (fetch 결과)
 */
export interface ScannedProductData {
  product_name: string | null;
  thumbnail: string | null;
  original_price: number | null;
  discounted_price: number | null;
  sale_status: string | null;
}

/**
 * DB 조회 데이터 (optional - URL 추출 시 null)
 */
export interface DbProductData {
  product_name: string | null;
  thumbnail?: string | null;
  original_price?: number | null;
  discounted_price?: number | null;
  sale_status?: string | null;
}

/**
 * 필드별 비교 결과
 */
export interface FieldComparisonResult {
  product_name: boolean;
  thumbnail: boolean;
  original_price: boolean;
  discounted_price: boolean;
  sale_status: boolean;
}

// ============================================================
// ExtractUrlNode Types (URL 기반 추출 - DB 조회 없음)
// ============================================================

/**
 * ExtractUrlNode 입력
 */
export interface ExtractUrlInput {
  /** 추출 대상 URL */
  url: string;

  /** 결과 출력 디렉토리 (optional) */
  output_dir?: string;
}

/**
 * URL 추출 단일 결과
 */
export interface UrlExtractionResultItem {
  /** 상품 세트 ID (URL 추출 시 빈 문자열) */
  product_set_id: string;

  /** 상품 ID (URL 추출 시 빈 문자열) */
  product_id: string;

  /** 추출 대상 URL */
  url: string;

  /** 감지된 플랫폼 */
  platform: string;

  /** DB 데이터 (URL 추출 시 null) */
  db: DbProductData | null;

  /** 스캔된 데이터 */
  fetch: ScannedProductData | null;

  /** 비교 결과 (URL 추출 시 null) */
  comparison: FieldComparisonResult | null;

  /** 일치 여부 (비교 불가 시 false) */
  match: boolean;

  /** 상태 */
  status: "success" | "failed" | "not_found";

  /** 추출 시간 */
  extracted_at: string;

  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * ExtractUrlNode 출력
 */
export interface ExtractUrlOutput {
  /** JSONL 파일 경로 */
  jsonl_path: string;

  /** 저장된 레코드 수 */
  record_count: number;

  /** 추출 결과 */
  result: UrlExtractionResultItem;

  /** 요약 정보 */
  summary: {
    total: number;
    success: number;
    failed: number;
    not_found: number;
  };
}

// ============================================================
// ExtractProductSetNode Types (ProductSet 기반 추출 - DB 비교 포함)
// ============================================================

/**
 * ExtractProductSetNode 입력
 */
export interface ExtractProductSetInput {
  /** 상품 세트 ID (Supabase product_set.id) */
  product_set_id: string;

  /** 결과 출력 디렉토리 (optional) */
  output_dir?: string;
}

/**
 * ProductSet 추출 단일 결과
 */
export interface ProductSetExtractionResultItem {
  /** 상품 세트 ID */
  product_set_id: string;

  /** 상품 ID */
  product_id: string;

  /** 추출 대상 URL */
  url: string | null;

  /** 감지된 플랫폼 */
  platform: string;

  /** DB 데이터 (조회됨) */
  db: DbProductData;

  /** 스캔된 데이터 */
  fetch: ScannedProductData | null;

  /** 비교 결과 */
  comparison: FieldComparisonResult | null;

  /** 일치 여부 */
  match: boolean;

  /** 상태 */
  status: "success" | "failed" | "not_found";

  /** 추출 시간 */
  extracted_at: string;

  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * ExtractProductSetNode 출력
 */
export interface ExtractProductSetOutput {
  /** JSONL 파일 경로 */
  jsonl_path: string;

  /** 저장된 레코드 수 */
  record_count: number;

  /** 추출 결과 목록 */
  results: ProductSetExtractionResultItem[];

  /** 요약 정보 */
  summary: {
    total: number;
    success: number;
    failed: number;
    not_found: number;
    match: number;
    mismatch: number;
  };

  /** Supabase 업데이트 수 (optional) */
  supabase_updated?: number;
}

// ============================================================
// ExtractMultiPlatformNode Types (Multi-Platform 추출)
// ============================================================

/**
 * ExtractMultiPlatformNode 입력
 */
export interface ExtractMultiPlatformInput {
  /** 상품 ID (Supabase UUID) */
  product_id: string;

  /** 판매 상태 필터 (optional) */
  sale_status?: string;

  /** 결과 출력 디렉토리 (optional) */
  output_dir?: string;
}

/**
 * 플랫폼별 그룹 결과
 */
export interface PlatformGroupResult {
  /** 플랫폼 이름 */
  platform: string;

  /** 처리된 상품 수 */
  count: number;

  /** 성공 수 */
  success_count: number;

  /** 실패 수 */
  failure_count: number;

  /** 일치 수 */
  match_count: number;

  /** 불일치 수 */
  mismatch_count: number;
}

/**
 * ExtractMultiPlatformNode 출력
 */
export interface ExtractMultiPlatformOutput {
  /** JSONL 파일 경로 */
  jsonl_path: string;

  /** 저장된 레코드 수 */
  record_count: number;

  /** 추출 결과 목록 */
  results: ProductSetExtractionResultItem[];

  /** 플랫폼별 결과 */
  platform_results: PlatformGroupResult[];

  /** 요약 정보 */
  summary: {
    total: number;
    success: number;
    failed: number;
    not_found: number;
    match: number;
    mismatch: number;
    platforms_processed: number;
  };

  /** Supabase 업데이트 수 (optional) */
  supabase_updated?: number;
}

// ============================================================
// Phase 4 UpdateProductSetNode Types (Supabase 업데이트)
// ============================================================

/**
 * UpdateProductSetNode 입력
 */
export interface UpdateProductSetInput {
  /** JSONL 파일 경로 (이전 노드 출력) */
  jsonl_path: string;

  /** 플랫폼 (업데이트 예외 설정용) */
  platform: string;

  /** 업데이트 옵션 */
  options?: {
    /** 히스토리 기록 여부 (기본값: true) */
    record_history?: boolean;

    /** 검증 수행 여부 (기본값: true) */
    verify_updates?: boolean;

    /** sale_status 업데이트 여부 (기본값: true) */
    update_sale_status?: boolean;
  };
}

/**
 * 업데이트 제외 설정 (YAML에서 로드)
 */
export interface UpdateExclusionConfig {
  /** 제외할 필드 목록 */
  skip_fields: string[];

  /** 사유 */
  reason?: string;
}

/**
 * 단일 업데이트 결과
 */
export interface SingleUpdateResult {
  /** 상품 세트 ID */
  product_set_id: string;

  /** 업데이트 성공 여부 */
  success: boolean;

  /** 업데이트된 필드 목록 */
  updated_fields: string[];

  /** 스킵된 필드 목록 (예외 설정) */
  skipped_fields: string[];

  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * 히스토리 기록 결과
 */
export interface HistoryRecordResult {
  /** 리뷰 히스토리 기록 수 */
  review_count: number;

  /** 가격 히스토리 기록 수 */
  price_count: number;

  /** 실패 수 */
  failed_count: number;
}

/**
 * 검증 결과
 */
export interface UpdateVerificationResult {
  /** 검증 통과 수 */
  verified_count: number;

  /** 검증 통과 여부 */
  verification_passed: boolean;

  /** 샘플 크기 */
  sample_size: number;
}

/**
 * UpdateProductSetNode 출력
 */
export interface UpdateProductSetOutput {
  /** 총 처리 수 */
  total: number;

  /** 업데이트 성공 수 */
  updated: number;

  /** 스킵 수 (업데이트 대상 아님) */
  skipped: number;

  /** 실패 수 */
  failed: number;

  /** 에러 수 */
  error_count: number;

  /** 히스토리 기록 결과 */
  history?: HistoryRecordResult;

  /** 검증 결과 */
  verification?: UpdateVerificationResult;

  /** JSONL 파일 경로 */
  jsonl_path: string;

  /** 업데이트 시간 */
  updated_at: string;

  /** 플랫폼별 제외 설정 적용 정보 */
  exclusions_applied?: {
    platform: string;
    skip_fields: string[];
    reason?: string;
  };
}

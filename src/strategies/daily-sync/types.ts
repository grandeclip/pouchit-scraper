/**
 * Daily Sync Node Types
 *
 * 목적:
 * - Daily Sync 노드 간 데이터 전달 타입 정의
 * - 파이프라인 타입 안전성 보장
 *
 * 설계:
 * - Resume 없음 (start/stop 만)
 * - 실패 시 다음 product 진행
 * - JSONL로 결과 기록
 */

// ============================================================
// Common Types
// ============================================================

/**
 * Product 엔티티 (products 테이블)
 */
export interface DailySyncProduct {
  product_id: string;
  name: string;
  brand_id: string;
  brand_name?: string; // 매핑 후 추가
}

/**
 * JSONL 메타 레코드 (header/footer)
 */
export interface DailySyncMetaRecord {
  /** 메타 레코드 마커 */
  _meta: true;

  /** 레코드 타입 */
  type: "header" | "footer";

  /** Job ID (header) */
  job_id?: string;

  /** Workflow ID (header) */
  workflow_id?: string;

  /** 총 product 수 (header) */
  total_products?: number;

  /** 시작 시각 (header) */
  started_at?: string;

  /** 완료 시각 (footer) */
  completed_at?: string;

  /** 집계 결과 (footer) */
  summary?: DailySyncSummary;
}

/**
 * JSONL 로그 레코드 (각 product 처리 결과)
 */
export interface DailySyncLogRecord {
  /** Product ID */
  product_id: string;

  /** 처리 상태 */
  status: "success" | "skipped" | "failed";

  /** 스킵 사유 (status=skipped 시) */
  skip_reason?: string;

  /** 에러 메시지 (status=failed 시) */
  error?: string;

  /** 검색된 URL 수 */
  search_result_count?: number;

  /** 필터링 후 유효 URL 수 */
  valid_url_count?: number;

  /** 신규 INSERT된 product_set 수 */
  inserted_count?: number;

  /** enqueue된 update workflow job 수 */
  enqueued_count?: number;

  /** 처리 소요 시간 (ms) */
  duration_ms: number;

  /** 처리 완료 시각 */
  timestamp: string;
}

// ============================================================
// DailySyncInitNode Types
// ============================================================

/**
 * DailySyncInitNode 입력
 */
export interface DailySyncInitInput {
  /** 배치 크기 (한 번에 처리할 product 수, Queue 재등록 단위) */
  batch_size?: number;

  /** 처리할 product 최대 수 (테스트용 limit) */
  limit?: number;

  /** 요청 간 딜레이 (ms) */
  delay_ms?: number;

  /** dry run 모드 */
  dry_run?: boolean;

  /** 특정 product_id만 처리 (테스트용) */
  product_ids?: string[];
}

/**
 * DailySyncInitNode 출력
 */
export interface DailySyncInitOutput {
  /** 전체 product 목록 (brand_name 포함) */
  products: DailySyncProduct[];

  /** 총 product 수 */
  total_products: number;

  /** Platform ID 매핑 */
  platform_id_map: Record<string, number>;

  /** JSONL 로그 파일 경로 */
  job_log_file: string;

  /** 시작 시각 */
  started_at: string;

  /** dry run 모드 (batch로 전달) */
  dry_run?: boolean;
}

// ============================================================
// DailySyncBatchNode Types
// ============================================================

/**
 * DailySyncBatchNode 입력 (init 출력 + 추가 설정)
 */
export interface DailySyncBatchInput {
  /** 남은 product 목록 */
  products: DailySyncProduct[];

  /** 총 product 수 (최초 시작 시 전체 개수) */
  total_products: number;

  /** Platform ID 매핑 */
  platform_id_map: Record<string, number>;

  /** JSONL 로그 파일 경로 */
  job_log_file: string;

  /** 시작 시각 */
  started_at: string;

  /** dry run 모드 */
  dry_run?: boolean;

  /** 플랫폼당 최대 검색 결과 */
  max_per_platform?: number;

  /** update workflow ID */
  update_workflow_id?: string;
}

/**
 * DailySyncBatchNode 출력
 */
export interface DailySyncBatchOutput {
  /** 이번 배치에서 처리된 product 수 */
  processed_count: number;

  /** 성공한 product 수 */
  success_count: number;

  /** 스킵된 product 수 */
  skipped_count: number;

  /** 실패한 product 수 */
  failed_count: number;

  /** 신규 INSERT된 product_set 수 */
  new_product_sets_count: number;

  /** enqueue된 update job 수 */
  enqueued_jobs_count: number;

  /** 전체 처리 완료 여부 */
  completed: boolean;

  /** 남은 product 수 */
  remaining_count: number;

  /** 진행률 (%) */
  progress: number;

  /** JSONL 로그 파일 경로 */
  job_log_file: string;
}

// ============================================================
// DailySyncNotifyNode Types
// ============================================================

/**
 * DailySyncNotifyNode 입력
 */
export interface DailySyncNotifyInput {
  /** JSONL 로그 파일 경로 */
  job_log_file: string;

  /** 총 product 수 */
  total_products: number;

  /** 시작 시각 */
  started_at: string;

  /** Job ID */
  job_id?: string;

  /** Workflow ID */
  workflow_id?: string;
}

/**
 * JSONL 집계 결과 (알림용)
 */
export interface DailySyncSummary {
  /** 총 product 수 */
  total_products: number;

  /** 처리된 product 수 */
  processed_count: number;

  /** 성공한 product 수 */
  success_count: number;

  /** 스킵된 product 수 */
  skipped_count: number;

  /** 실패한 product 수 */
  failed_count: number;

  /** 신규 INSERT된 product_set 수 */
  new_product_sets_count: number;

  /** enqueue된 update job 수 */
  enqueued_jobs_count: number;

  /** 총 소요 시간 (ms) */
  duration_ms: number;

  /** 에러 목록 (최대 10개) */
  errors: Array<{
    product_id: string;
    error: string;
  }>;
}

/**
 * DailySyncNotifyNode 출력
 */
export interface DailySyncNotifyOutput {
  /** 알림 발송 여부 */
  notified: boolean;

  /** 발송 채널 목록 */
  channels?: string[];

  /** 집계 결과 */
  summary: DailySyncSummary;

  /** 에러 메시지 (실패 시) */
  error?: string;
}

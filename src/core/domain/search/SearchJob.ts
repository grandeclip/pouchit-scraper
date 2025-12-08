/**
 * SearchJob - 검색 Job 도메인 모델
 *
 * Workflow Job보다 단순한 구조:
 * - 단일 플랫폼 검색
 * - Node 없음 (단일 작업)
 * - 결과는 SearchResult 형태
 *
 * SOLID 원칙:
 * - SRP: Search Job 타입만 정의
 * - Value Object Pattern: 불변 데이터 구조
 */

import { z } from "zod";
import type { SearchResult } from "./SearchProduct";

/**
 * Search Job 상태
 */
export enum SearchJobStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Search Job 요청 스키마
 */
export const SearchJobRequestSchema = z.object({
  platform: z.string(),
  keyword: z.string(),
  limit: z.number().int().min(1).max(100).default(10),
});

export type SearchJobRequest = z.infer<typeof SearchJobRequestSchema>;

/**
 * Search Job 도메인 모델
 */
export interface SearchJob {
  /** Job ID (UUID) */
  job_id: string;

  /** 플랫폼 */
  platform: string;

  /** 검색 키워드 */
  keyword: string;

  /** 결과 제한 수 */
  limit: number;

  /** 현재 상태 */
  status: SearchJobStatus;

  /** 검색 결과 (완료 시) */
  result: SearchResult | null;

  /** 에러 메시지 (실패 시) */
  error: string | null;

  /** 생성 시각 */
  created_at: string;

  /** 시작 시각 */
  started_at: string | null;

  /** 완료 시각 */
  completed_at: string | null;
}

/**
 * Search Job 상태 응답
 */
export interface SearchJobStatusResponse {
  job_id: string;
  platform: string;
  keyword: string;
  status: SearchJobStatus;
  result: SearchResult | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * SearchJob 생성 헬퍼
 */
export function createSearchJob(
  jobId: string,
  request: SearchJobRequest,
): SearchJob {
  return {
    job_id: jobId,
    platform: request.platform,
    keyword: request.keyword,
    limit: request.limit,
    status: SearchJobStatus.PENDING,
    result: null,
    error: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
  };
}

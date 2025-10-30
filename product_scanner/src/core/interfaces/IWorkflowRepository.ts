/**
 * Workflow Repository 인터페이스
 *
 * SOLID 원칙:
 * - ISP: 워크플로우 저장소 전용 인터페이스
 * - DIP: 추상화에 의존 (구체 구현에 의존하지 않음)
 */

import { Job, JobStatus } from "@/core/domain/Workflow";

/**
 * Workflow Repository 인터페이스
 * Redis 기반 작업 큐 관리
 */
export interface IWorkflowRepository {
  /**
   * Job 생성 및 큐에 추가
   * @param job Job 객체
   */
  enqueueJob(job: Job): Promise<void>;

  /**
   * 대기 중인 Job 가져오기 (우선순위 기반)
   * @returns Job 객체 또는 null
   */
  dequeueJob(): Promise<Job | null>;

  /**
   * Job ID로 조회
   * @param jobId Job ID
   * @returns Job 객체 또는 null
   */
  getJob(jobId: string): Promise<Job | null>;

  /**
   * Job 상태 업데이트
   * @param job 업데이트할 Job 객체
   */
  updateJob(job: Job): Promise<void>;

  /**
   * Job 삭제
   * @param jobId Job ID
   */
  deleteJob(jobId: string): Promise<void>;

  /**
   * Platform별 큐 길이 조회
   * @param platform Platform 식별자 (optional, deprecated without platform)
   * @returns 대기 중인 Job 개수
   */
  getQueueLength(platform?: string): Promise<number>;

  /**
   * Platform별 대기 중인 Job 목록 조회
   * @param platform Platform 식별자 (optional, deprecated without platform)
   * @param limit 조회 개수 제한
   * @returns Job 배열
   */
  getQueuedJobs(platform?: string, limit?: number): Promise<Job[]>;

  /**
   * 연결 상태 확인
   * @returns 연결 여부
   */
  healthCheck(): Promise<boolean>;

  /**
   * Platform별 큐에서 Job 가져오기 (Multi-Queue Architecture)
   * @param platform Platform 식별자
   * @returns Job 객체 또는 null
   */
  dequeueJobByPlatform(platform: string): Promise<Job | null>;

  /**
   * Platform Rate Limit Tracker 조회
   * @param platform Platform 식별자
   * @returns 마지막 실행 시간 (Unix timestamp in ms)
   */
  getRateLimitTracker(platform: string): Promise<number>;

  /**
   * Platform Rate Limit Tracker 업데이트
   * @param platform Platform 식별자
   * @param timestamp Unix timestamp in ms
   */
  setRateLimitTracker(platform: string, timestamp: number): Promise<void>;
}

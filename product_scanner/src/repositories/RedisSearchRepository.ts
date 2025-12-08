/**
 * Redis Search Repository
 * Repository Pattern 구현 - 검색 Job 큐 관리
 *
 * SOLID 원칙:
 * - SRP: Redis 기반 Search Job 데이터 접근만 담당
 * - DIP: Interface에 의존 (추후 확장 가능)
 * - OCP: 새로운 저장소 구현으로 확장 가능
 */

import Redis from "ioredis";
import type {
  SearchJob,
  SearchJobRequest,
} from "@/core/domain/search/SearchJob";
import {
  SearchJobStatus,
  createSearchJob,
} from "@/core/domain/search/SearchJob";
import type { SearchResult } from "@/core/domain/search/SearchProduct";
import { logger } from "@/config/logger";
import { v4 as uuidv4 } from "uuid";

/**
 * Redis 키 패턴
 */
const REDIS_KEYS = {
  // Search 전용 큐 (단일 큐 - 검색은 가벼워서 분리 불필요)
  SEARCH_QUEUE: "search:queue",
  // Job 데이터
  SEARCH_JOB_DATA: (jobId: string) => `search:job:${jobId}`,
} as const;

/**
 * TTL 설정 (초)
 */
const REDIS_TTL = {
  JOB_PENDING: 1800, // 30분 (검색은 짧은 작업)
  JOB_RUNNING: 600, // 10분
  JOB_COMPLETED: 3600, // 1시간
  JOB_FAILED: 3600, // 1시간
} as const;

/**
 * Redis Search Repository (Singleton)
 * RedisWorkflowRepository와 Redis 클라이언트 공유
 */
export class RedisSearchRepository {
  private static instance: RedisSearchRepository | null = null;
  private static sharedClient: Redis | null = null;
  private _client: Redis;

  /**
   * Singleton 인스턴스 가져오기
   */
  static getInstance(): RedisSearchRepository {
    if (!RedisSearchRepository.instance) {
      RedisSearchRepository.instance = new RedisSearchRepository();
    }
    return RedisSearchRepository.instance;
  }

  /**
   * Singleton 인스턴스 초기화 (테스트용)
   */
  static resetInstance(): void {
    // 공유 클라이언트는 다른 Repository에서도 사용할 수 있으므로 disconnect하지 않음
    RedisSearchRepository.instance = null;
  }

  /**
   * Redis client getter
   */
  get client(): Redis {
    return this._client;
  }

  constructor(redisClient?: Redis) {
    if (redisClient) {
      this._client = redisClient;
    } else {
      if (!RedisSearchRepository.sharedClient) {
        const host = process.env.REDIS_HOST || "localhost";
        const port = parseInt(process.env.REDIS_PORT || "6379", 10);

        RedisSearchRepository.sharedClient = new Redis({
          host,
          port,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          lazyConnect: false,
        });

        RedisSearchRepository.sharedClient.on("connect", () => {
          logger.debug({ host, port }, "[SearchRepo] Redis 연결 성공");
        });

        RedisSearchRepository.sharedClient.on("error", (err: Error) => {
          logger.error(
            { error: err.message, host, port },
            "[SearchRepo] Redis 연결 오류",
          );
        });
      }

      this._client = RedisSearchRepository.sharedClient;
    }
  }

  /**
   * Search Job 생성 및 큐에 추가
   * @returns 생성된 Job ID
   */
  async createAndEnqueueJob(request: SearchJobRequest): Promise<string> {
    const jobId = uuidv4();
    const job = createSearchJob(jobId, request);

    const pipeline = this._client.pipeline();

    // 1. 큐에 추가 (FIFO: 생성 시간 기반)
    pipeline.zadd(REDIS_KEYS.SEARCH_QUEUE, Date.now(), job.job_id);

    // 2. Job 데이터 저장
    pipeline.hset(
      REDIS_KEYS.SEARCH_JOB_DATA(job.job_id),
      "data",
      JSON.stringify(job),
    );

    // 3. TTL 설정
    pipeline.expire(
      REDIS_KEYS.SEARCH_JOB_DATA(job.job_id),
      REDIS_TTL.JOB_PENDING,
    );

    await pipeline.exec();

    logger.debug(
      { job_id: job.job_id, platform: job.platform, keyword: job.keyword },
      "[SearchRepo] Search Job 생성 및 큐 추가",
    );

    return job.job_id;
  }

  /**
   * 큐에서 Job 가져오기 (FIFO)
   */
  async dequeueJob(): Promise<SearchJob | null> {
    // 가장 오래된 Job 가져오기 (FIFO)
    const results = await this._client.zrange(REDIS_KEYS.SEARCH_QUEUE, 0, 0);

    if (results.length === 0) {
      return null;
    }

    const jobId = results[0];

    // 큐에서 제거 (Atomic)
    const removed = await this._client.zrem(REDIS_KEYS.SEARCH_QUEUE, jobId);

    if (removed === 0) {
      return null; // 다른 Worker가 이미 가져감
    }

    // Job 데이터 조회
    const jobData = await this._client.hget(
      REDIS_KEYS.SEARCH_JOB_DATA(jobId),
      "data",
    );

    if (!jobData) {
      logger.warn({ job_id: jobId }, "[SearchRepo] Job 데이터 없음");
      return null;
    }

    const job = JSON.parse(jobData) as SearchJob;

    logger.debug(
      { job_id: job.job_id, platform: job.platform },
      "[SearchRepo] Job dequeued",
    );

    return job;
  }

  /**
   * Job 조회
   */
  async getJob(jobId: string): Promise<SearchJob | null> {
    const jobData = await this._client.hget(
      REDIS_KEYS.SEARCH_JOB_DATA(jobId),
      "data",
    );

    if (!jobData) {
      return null;
    }

    return JSON.parse(jobData) as SearchJob;
  }

  /**
   * Job 상태 업데이트 - RUNNING
   */
  async markJobRunning(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = SearchJobStatus.RUNNING;
    job.started_at = new Date().toISOString();

    await this.updateJob(job, REDIS_TTL.JOB_RUNNING);
  }

  /**
   * Job 상태 업데이트 - COMPLETED
   */
  async markJobCompleted(jobId: string, result: SearchResult): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = SearchJobStatus.COMPLETED;
    job.result = result;
    job.completed_at = new Date().toISOString();

    await this.updateJob(job, REDIS_TTL.JOB_COMPLETED);
  }

  /**
   * Job 상태 업데이트 - FAILED
   */
  async markJobFailed(jobId: string, error: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = SearchJobStatus.FAILED;
    job.error = error;
    job.completed_at = new Date().toISOString();

    await this.updateJob(job, REDIS_TTL.JOB_FAILED);
  }

  /**
   * Job 업데이트 (내부용)
   */
  private async updateJob(job: SearchJob, ttl: number): Promise<void> {
    const key = REDIS_KEYS.SEARCH_JOB_DATA(job.job_id);

    const pipeline = this._client.pipeline();
    pipeline.hset(key, "data", JSON.stringify(job));
    pipeline.expire(key, ttl);
    await pipeline.exec();
  }

  /**
   * 큐 길이 조회
   */
  async getQueueLength(): Promise<number> {
    return await this._client.zcard(REDIS_KEYS.SEARCH_QUEUE);
  }

  /**
   * 대기 중인 Job 목록 조회
   */
  async getQueuedJobs(limit: number = 100): Promise<SearchJob[]> {
    const jobIds = await this._client.zrange(
      REDIS_KEYS.SEARCH_QUEUE,
      0,
      limit - 1,
    );

    if (jobIds.length === 0) {
      return [];
    }

    const jobs: SearchJob[] = [];
    for (const jobId of jobIds) {
      const job = await this.getJob(jobId);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  }

  /**
   * 연결 상태 확인
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this._client.ping();
      return result === "PONG";
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[SearchRepo] Redis 상태 확인 실패",
      );
      return false;
    }
  }

  /**
   * 큐 비우기
   */
  async clearQueue(): Promise<number> {
    const jobIds = await this._client.zrange(REDIS_KEYS.SEARCH_QUEUE, 0, -1);

    if (jobIds.length === 0) {
      return 0;
    }

    const pipeline = this._client.pipeline();
    pipeline.del(REDIS_KEYS.SEARCH_QUEUE);

    for (const jobId of jobIds) {
      pipeline.del(REDIS_KEYS.SEARCH_JOB_DATA(jobId));
    }

    await pipeline.exec();

    logger.info(
      { deleted_count: jobIds.length },
      "[SearchRepo] 큐 비우기 완료",
    );

    return jobIds.length;
  }
}

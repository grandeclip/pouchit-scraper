/**
 * Redis Workflow Repository
 * Repository Pattern 구현
 *
 * SOLID 원칙:
 * - SRP: Redis 기반 워크플로우 데이터 접근만 담당
 * - DIP: IWorkflowRepository 인터페이스 구현
 * - OCP: 새로운 저장소 구현으로 확장 가능
 */

import Redis from "ioredis";
import { IWorkflowRepository } from "@/core/interfaces/IWorkflowRepository";
import { Job, JobStatus } from "@/core/domain/Workflow";
import { logger } from "@/config/logger";

/**
 * Redis 키 패턴
 */
const REDIS_KEYS = {
  // Platform별 독립 큐 (Multi-Queue Architecture)
  JOB_QUEUE_PLATFORM: (platform: string) =>
    `workflow:queue:platform:${platform}`,
  JOB_DATA: (jobId: string) => `workflow:job:${jobId}`,
  // Platform별 Rate Limit Tracker
  RATE_LIMIT_TRACKER: (platform: string) =>
    `workflow:tracker:ratelimit:${platform}`,
} as const;

/**
 * TTL 설정 (초)
 */
const REDIS_TTL = {
  JOB_PENDING: 3600,
  JOB_RUNNING: 7200,
  JOB_COMPLETED: 86400,
  JOB_FAILED: 86400,
} as const;

/**
 * Redis Workflow Repository (Singleton)
 */
export class RedisWorkflowRepository implements IWorkflowRepository {
  private static instance: RedisWorkflowRepository | null = null;
  private static sharedClient: Redis | null = null;
  private _client: Redis;

  /**
   * Singleton 인스턴스 가져오기
   */
  static getInstance(): RedisWorkflowRepository {
    if (!RedisWorkflowRepository.instance) {
      RedisWorkflowRepository.instance = new RedisWorkflowRepository();
    }
    return RedisWorkflowRepository.instance;
  }

  /**
   * Singleton 인스턴스 초기화 (테스트용)
   */
  static resetInstance(): void {
    if (RedisWorkflowRepository.sharedClient) {
      RedisWorkflowRepository.sharedClient.disconnect();
      RedisWorkflowRepository.sharedClient = null;
    }
    RedisWorkflowRepository.instance = null;
  }

  /**
   * Redis client getter
   * PlatformLock 등 외부에서 Redis 접근 필요 시 사용
   */
  get client(): Redis {
    return this._client;
  }

  constructor(redisClient?: Redis) {
    // Dependency Injection (테스트 가능하도록)
    if (redisClient) {
      this._client = redisClient;
    } else {
      // Singleton 패턴: 공유 클라이언트 사용
      if (!RedisWorkflowRepository.sharedClient) {
        const host = process.env.REDIS_HOST || "localhost";
        const port = parseInt(process.env.REDIS_PORT || "6379", 10);

        RedisWorkflowRepository.sharedClient = new Redis({
          host,
          port,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          lazyConnect: false,
        });

        RedisWorkflowRepository.sharedClient.on("connect", () => {
          logger.info({ host, port }, "Redis 연결 성공");
        });

        RedisWorkflowRepository.sharedClient.on("ready", () => {
          logger.info({ host, port }, "Redis 사용 준비 완료");
        });

        RedisWorkflowRepository.sharedClient.on("error", (err: Error) => {
          logger.error({ error: err.message, host, port }, "Redis 연결 오류");
        });

        RedisWorkflowRepository.sharedClient.on("close", () => {
          logger.warn({ host, port }, "Redis 연결 종료");
        });

        RedisWorkflowRepository.sharedClient.on("reconnecting", () => {
          logger.warn({ host, port }, "Redis 재연결 시도 중");
        });
      }

      this._client = RedisWorkflowRepository.sharedClient;
    }
  }

  /**
   * Job 큐에 추가 (Platform별 큐)
   */
  async enqueueJob(job: Job): Promise<void> {
    // Platform 필수 검증
    if (!job.platform) {
      throw new Error("Job.platform is required for multi-queue architecture");
    }

    const queueKey = REDIS_KEYS.JOB_QUEUE_PLATFORM(job.platform);
    const pipeline = this._client.pipeline();

    // 1. Platform별 Sorted Set에 추가 (우선순위 기반)
    pipeline.zadd(queueKey, job.priority, job.job_id);

    // 2. Job 데이터 저장
    pipeline.hset(REDIS_KEYS.JOB_DATA(job.job_id), "data", JSON.stringify(job));

    // 3. TTL 설정
    pipeline.expire(REDIS_KEYS.JOB_DATA(job.job_id), REDIS_TTL.JOB_PENDING);

    await pipeline.exec();

    logger.debug(
      { job_id: job.job_id, platform: job.platform, priority: job.priority },
      "Job enqueued to platform queue",
    );
  }

  /**
   * 큐에서 Job 가져오기 (Legacy - 하위 호환성)
   * @deprecated Use dequeueJobByPlatform() instead
   */
  async dequeueJob(): Promise<Job | null> {
    logger.warn(
      "dequeueJob() is deprecated. Use dequeueJobByPlatform() for multi-queue architecture",
    );
    return null; // Legacy method disabled
  }

  /**
   * Platform별 큐에서 Job 가져오기 (Multi-Queue Architecture)
   */
  async dequeueJobByPlatform(platform: string): Promise<Job | null> {
    const queueKey = REDIS_KEYS.JOB_QUEUE_PLATFORM(platform);

    // 가장 높은 우선순위 Job 가져오기
    const results = await this._client.zrevrange(queueKey, 0, 0);

    if (results.length === 0) {
      return null; // 큐가 비어있음
    }

    const jobId = results[0];

    // 큐에서 제거 (Atomic operation)
    const removed = await this._client.zrem(queueKey, jobId);

    if (removed === 0) {
      return null; // 다른 Worker가 이미 가져감
    }

    // Job 데이터 조회
    const jobData = await this._client.hget(REDIS_KEYS.JOB_DATA(jobId), "data");

    if (!jobData) {
      logger.warn({ job_id: jobId, platform }, "Redis에서 Job을 찾을 수 없음");
      return null;
    }

    const job = JSON.parse(jobData) as Job;

    logger.debug(
      { job_id: job.job_id, platform: job.platform },
      "Job dequeued from platform queue",
    );

    return job;
  }

  /**
   * Job 조회
   */
  async getJob(jobId: string): Promise<Job | null> {
    const jobData = await this._client.hget(REDIS_KEYS.JOB_DATA(jobId), "data");

    if (!jobData) {
      return null;
    }

    return JSON.parse(jobData) as Job;
  }

  /**
   * Job 업데이트
   */
  async updateJob(job: Job): Promise<void> {
    const key = REDIS_KEYS.JOB_DATA(job.job_id);

    // Job 데이터 업데이트
    await this._client.hset(key, "data", JSON.stringify(job));

    // 상태별 TTL 설정
    let ttl: number;
    switch (job.status) {
      case JobStatus.PENDING:
        ttl = REDIS_TTL.JOB_PENDING;
        break;
      case JobStatus.RUNNING:
        ttl = REDIS_TTL.JOB_RUNNING;
        break;
      case JobStatus.COMPLETED:
        ttl = REDIS_TTL.JOB_COMPLETED;
        break;
      case JobStatus.FAILED:
      case JobStatus.CANCELLED:
        ttl = REDIS_TTL.JOB_FAILED;
        break;
      default:
        ttl = REDIS_TTL.JOB_PENDING;
    }

    await this._client.expire(key, ttl);
  }

  /**
   * Job 삭제 (Platform 큐에서 제거)
   */
  async deleteJob(jobId: string): Promise<void> {
    // Job 데이터 먼저 조회 (platform 정보 필요)
    const job = await this.getJob(jobId);

    if (!job) {
      logger.warn({ job_id: jobId }, "삭제할 Job을 찾을 수 없음");
      return;
    }

    const queueKey = REDIS_KEYS.JOB_QUEUE_PLATFORM(job.platform);
    const pipeline = this._client.pipeline();

    // Platform 큐에서 제거
    pipeline.zrem(queueKey, jobId);

    // 데이터 삭제
    pipeline.del(REDIS_KEYS.JOB_DATA(jobId));

    await pipeline.exec();
  }

  /**
   * Platform별 큐 길이 조회
   */
  async getQueueLength(platform?: string): Promise<number> {
    if (platform) {
      const queueKey = REDIS_KEYS.JOB_QUEUE_PLATFORM(platform);
      return await this._client.zcard(queueKey);
    }

    // Platform 지정 안하면 deprecated warning
    logger.warn("getQueueLength() without platform is deprecated");
    return 0;
  }

  /**
   * Platform별 대기 중인 Job 목록 조회
   */
  async getQueuedJobs(platform?: string, limit: number = 100): Promise<Job[]> {
    if (!platform) {
      logger.warn("getQueuedJobs() without platform is deprecated");
      return [];
    }

    const queueKey = REDIS_KEYS.JOB_QUEUE_PLATFORM(platform);
    const jobIds = await this._client.zrevrange(queueKey, 0, limit - 1);

    if (jobIds.length === 0) {
      return [];
    }

    const jobs: Job[] = [];
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
        {
          error: error instanceof Error ? error.message : String(error),
        },
        "Redis 상태 확인 실패",
      );
      return false;
    }
  }

  /**
   * 연결 종료
   */
  async disconnect(): Promise<void> {
    await this._client.quit();
  }

  /**
   * Platform Rate Limit Tracker 조회
   */
  async getRateLimitTracker(platform: string): Promise<number> {
    const key = REDIS_KEYS.RATE_LIMIT_TRACKER(platform);
    const value = await this._client.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Platform Rate Limit Tracker 업데이트
   */
  async setRateLimitTracker(
    platform: string,
    timestamp: number,
  ): Promise<void> {
    const key = REDIS_KEYS.RATE_LIMIT_TRACKER(platform);
    await this._client.set(key, timestamp.toString());

    logger.debug({ platform, timestamp }, "Rate limit tracker updated");
  }

  /**
   * Platform별 큐 비우기
   * @param platform - 플랫폼명
   * @returns 삭제된 Job 수
   */
  async clearQueue(platform: string): Promise<number> {
    const queueKey = REDIS_KEYS.JOB_QUEUE_PLATFORM(platform);

    // 큐에 있는 모든 Job ID 조회
    const jobIds = await this._client.zrange(queueKey, 0, -1);

    if (jobIds.length === 0) {
      return 0;
    }

    const pipeline = this._client.pipeline();

    // 큐 비우기
    pipeline.del(queueKey);

    // 각 Job 데이터 삭제
    for (const jobId of jobIds) {
      pipeline.del(REDIS_KEYS.JOB_DATA(jobId));
    }

    await pipeline.exec();

    logger.info(
      { platform, deleted_count: jobIds.length },
      "Platform 큐 비우기 완료",
    );

    return jobIds.length;
  }

  /**
   * 모든 Platform 큐 비우기
   * @param platforms - 플랫폼 목록
   * @returns 플랫폼별 삭제된 Job 수
   */
  async clearAllQueues(platforms: string[]): Promise<Record<string, number>> {
    const results: Record<string, number> = {};

    for (const platform of platforms) {
      results[platform] = await this.clearQueue(platform);
    }

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    logger.info(
      { platforms, total_deleted: totalDeleted, results },
      "모든 큐 비우기 완료",
    );

    return results;
  }
}

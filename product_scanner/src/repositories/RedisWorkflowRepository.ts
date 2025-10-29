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

/**
 * Redis 키 패턴
 */
const REDIS_KEYS = {
  JOB_QUEUE: "workflow:queue:jobs",
  JOB_DATA: (jobId: string) => `workflow:job:${jobId}`,
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
 * Redis Workflow Repository
 */
export class RedisWorkflowRepository implements IWorkflowRepository {
  private client: Redis;

  constructor(redisClient?: Redis) {
    // Dependency Injection (테스트 가능하도록)
    if (redisClient) {
      this.client = redisClient;
    } else {
      const host = process.env.REDIS_HOST || "localhost";
      const port = parseInt(process.env.REDIS_PORT || "6379", 10);

      this.client = new Redis({
        host,
        port,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: false,
      });

      this.client.on("error", (err: Error) => {
        console.error("[Redis] Connection error:", err);
      });
    }
  }

  /**
   * Job 큐에 추가
   */
  async enqueueJob(job: Job): Promise<void> {
    const pipeline = this.client.pipeline();

    // 1. Sorted Set에 추가 (우선순위 기반)
    pipeline.zadd(REDIS_KEYS.JOB_QUEUE, job.priority, job.job_id);

    // 2. Job 데이터 저장
    pipeline.hset(REDIS_KEYS.JOB_DATA(job.job_id), "data", JSON.stringify(job));

    // 3. TTL 설정
    pipeline.expire(REDIS_KEYS.JOB_DATA(job.job_id), REDIS_TTL.JOB_PENDING);

    await pipeline.exec();
  }

  /**
   * 큐에서 Job 가져오기
   */
  async dequeueJob(): Promise<Job | null> {
    // 가장 높은 우선순위 Job 가져오기
    const results = await this.client.zrevrange(REDIS_KEYS.JOB_QUEUE, 0, 0);

    if (results.length === 0) {
      return null;
    }

    const jobId = results[0];

    // 큐에서 제거
    const removed = await this.client.zrem(REDIS_KEYS.JOB_QUEUE, jobId);

    if (removed === 0) {
      return null; // 다른 워커가 이미 가져감
    }

    // Job 데이터 조회
    const jobData = await this.client.hget(REDIS_KEYS.JOB_DATA(jobId), "data");

    if (!jobData) {
      console.warn(`[Redis] Job ${jobId} not found`);
      return null;
    }

    return JSON.parse(jobData) as Job;
  }

  /**
   * Job 조회
   */
  async getJob(jobId: string): Promise<Job | null> {
    const jobData = await this.client.hget(REDIS_KEYS.JOB_DATA(jobId), "data");

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
    await this.client.hset(key, "data", JSON.stringify(job));

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

    await this.client.expire(key, ttl);
  }

  /**
   * Job 삭제
   */
  async deleteJob(jobId: string): Promise<void> {
    const pipeline = this.client.pipeline();

    // 큐에서 제거
    pipeline.zrem(REDIS_KEYS.JOB_QUEUE, jobId);

    // 데이터 삭제
    pipeline.del(REDIS_KEYS.JOB_DATA(jobId));

    await pipeline.exec();
  }

  /**
   * 큐 길이 조회
   */
  async getQueueLength(): Promise<number> {
    return await this.client.zcard(REDIS_KEYS.JOB_QUEUE);
  }

  /**
   * 대기 중인 Job 목록 조회
   */
  async getQueuedJobs(limit: number = 100): Promise<Job[]> {
    const jobIds = await this.client.zrevrange(
      REDIS_KEYS.JOB_QUEUE,
      0,
      limit - 1,
    );

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
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      console.error("[Redis] Health check failed:", error);
      return false;
    }
  }

  /**
   * 연결 종료
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

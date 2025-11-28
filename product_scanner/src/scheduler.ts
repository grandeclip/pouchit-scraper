/**
 * Platform Scheduler Service
 * 자동 Job 스케줄링 서비스
 *
 * 목적:
 * - 플랫폼별 Queue가 비면 자동으로 새 Job 추가
 * - 플랫폼 간 30초 간격으로 요청 분산
 * - 동일 플랫폼은 Job 완료 후 1분 대기
 * - on_sale 4회 → off_sale 1회 로테이션
 *
 * 사용:
 * - npm run scheduler
 * - docker-compose에서 scheduler 서비스로 실행
 */

import { v7 as uuidv7 } from "uuid";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { SchedulerStateRepository } from "@/repositories/SchedulerStateRepository";
import { PlatformLock } from "@/repositories/PlatformLock";
import { SCHEDULER_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";
import { Job, JobStatus } from "@/core/domain/Workflow";

/**
 * 플랫폼별 link_url_pattern 매핑
 */
const PLATFORM_URL_PATTERNS: Record<string, string> = {
  hwahae: "hwahae.co.kr",
  oliveyoung: "oliveyoung.co.kr",
  zigzag: "zigzag.kr",
  musinsa: "musinsa.com",
  ably: "a-bly.com",
  kurly: "kurly.com",
};

/**
 * 스케줄러 실행 상태
 */
let isRunning = true;

/**
 * Graceful shutdown 핸들러
 */
function setupShutdownHandlers(repository: RedisWorkflowRepository): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "[Scheduler] 종료 신호 수신");
    isRunning = false;

    // Redis 연결 종료
    await repository.disconnect();

    logger.info("[Scheduler] 정상 종료 완료");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Update Job 생성
 */
function createUpdateJob(
  platform: string,
  saleStatus: "on_sale" | "off_sale",
): Job {
  const jobId = uuidv7();
  const workflowId = `${platform}-update-v2`;

  return {
    job_id: jobId,
    workflow_id: workflowId,
    platform,
    priority: 5,
    status: JobStatus.PENDING,
    params: {
      platform,
      link_url_pattern: PLATFORM_URL_PATTERNS[platform] || "",
      sale_status: saleStatus,
      limit: SCHEDULER_CONFIG.DEFAULT_LIMIT,
      batch_size: SCHEDULER_CONFIG.DEFAULT_BATCH_SIZE,
      concurrency: SCHEDULER_CONFIG.DEFAULT_CONCURRENCY,
      update_sale_status: true,
    },
    current_node: null,
    progress: 0,
    result: {},
    error: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    metadata: {
      scheduled: true,
      scheduler_version: "1.0.0",
      description: `[Scheduler] ${platform} ${saleStatus} update`,
    },
  };
}

/**
 * 메인 스케줄러 루프
 */
async function runScheduler(): Promise<void> {
  const repository = new RedisWorkflowRepository();
  const schedulerState = new SchedulerStateRepository(repository.client);

  // Shutdown 핸들러 설정
  setupShutdownHandlers(repository);

  logger.info(
    {
      platforms: SCHEDULER_CONFIG.PLATFORMS,
      check_interval_ms: SCHEDULER_CONFIG.CHECK_INTERVAL_MS,
      inter_platform_delay_ms: SCHEDULER_CONFIG.INTER_PLATFORM_DELAY_MS,
      same_platform_cooldown_ms: SCHEDULER_CONFIG.SAME_PLATFORM_COOLDOWN_MS,
      on_sale_ratio: SCHEDULER_CONFIG.ON_SALE_RATIO,
      default_limit: SCHEDULER_CONFIG.DEFAULT_LIMIT,
    },
    "[Scheduler] 스케줄러 컨테이너 시작 (API로 활성화 필요)",
  );

  // 이전 활성화 상태 추적 (상태 변경 로깅용)
  let wasEnabled = false;

  while (isRunning) {
    try {
      // Heartbeat 업데이트 (스케줄러 컨테이너 실행 중임을 알림)
      await schedulerState.updateHeartbeat();

      // 0. 스케줄러 활성화 상태 확인
      const isEnabled = await schedulerState.isEnabled();

      if (!isEnabled) {
        // 비활성화 → 로그 (상태 변경 시에만)
        if (wasEnabled) {
          logger.info("[Scheduler] 스케줄러 비활성화됨 - 대기 중");
          wasEnabled = false;
        }
        await sleep(SCHEDULER_CONFIG.CHECK_INTERVAL_MS);
        continue;
      }

      // 활성화 → 로그 (상태 변경 시에만)
      if (!wasEnabled) {
        logger.info("[Scheduler] 스케줄러 활성화됨 - 스케줄링 시작");
        wasEnabled = true;
      }

      // 1. 글로벌 쿨다운 확인 (플랫폼 간 30초 간격)
      const isGlobalReady = await schedulerState.isGlobalCooldownComplete();
      if (!isGlobalReady) {
        await sleep(SCHEDULER_CONFIG.CHECK_INTERVAL_MS);
        continue;
      }

      // 2. 적합한 플랫폼 찾기
      for (const platform of SCHEDULER_CONFIG.PLATFORMS) {
        if (!isRunning) break;

        const lock = new PlatformLock(repository.client, platform);

        // 2.1 Queue 상태 확인
        const queueLength = await repository.getQueueLength(platform);
        if (queueLength > 0) {
          continue; // Queue에 대기 중인 Job 있음
        }

        // 2.2 실행 중인 Job 확인
        const runningJob = await lock.getRunningJob();
        if (runningJob) {
          continue; // 현재 실행 중인 Job 있음
        }

        // 2.3 플랫폼 쿨다운 확인 (1분)
        const isPlatformReady =
          await schedulerState.isPlatformCooldownComplete(platform);
        if (!isPlatformReady) {
          continue; // 아직 쿨다운 중
        }

        // 3. 이 플랫폼에 Job 추가 가능!
        const saleStatus = await schedulerState.getNextSaleStatus(platform);
        const job = createUpdateJob(platform, saleStatus);

        // 3.1 Job 추가
        await repository.enqueueJob(job);

        // 3.2 상태 업데이트
        await schedulerState.setLastEnqueueAt(Date.now());
        await schedulerState.incrementOnSaleCounter(platform, saleStatus);
        await schedulerState.incrementJobsScheduled();

        logger.info(
          {
            platform,
            job_id: job.job_id,
            sale_status: saleStatus,
            workflow_id: job.workflow_id,
          },
          "[Scheduler] Job 추가됨",
        );

        // 한 번에 하나의 플랫폼만 처리 (30초 간격 보장)
        break;
      }

      // 다음 체크까지 대기
      await sleep(SCHEDULER_CONFIG.CHECK_INTERVAL_MS);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Scheduler] 스케줄러 루프 오류",
      );
      await sleep(SCHEDULER_CONFIG.CHECK_INTERVAL_MS);
    }
  }
}

/**
 * Sleep 유틸리티
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 시작 배너 로깅
 */
function logBanner(): void {
  logger.info(
    {
      version: "1.0.0",
      platforms: SCHEDULER_CONFIG.PLATFORMS,
      inter_platform_delay_s: SCHEDULER_CONFIG.INTER_PLATFORM_DELAY_MS / 1000,
      same_platform_cooldown_s:
        SCHEDULER_CONFIG.SAME_PLATFORM_COOLDOWN_MS / 1000,
      on_sale_ratio: `${SCHEDULER_CONFIG.ON_SALE_RATIO}:1`,
      default_limit: SCHEDULER_CONFIG.DEFAULT_LIMIT,
    },
    "[Scheduler] Platform Scheduler 시작",
  );
}

// 메인 실행
logBanner();
runScheduler().catch((error) => {
  logger.fatal({ error: error.message }, "[Scheduler] 치명적 오류 발생");
  process.exit(1);
});

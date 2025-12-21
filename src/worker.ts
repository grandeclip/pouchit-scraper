/**
 * Multi-Platform Workflow Worker
 *
 * Phase 1: Platform Lock 메커니즘
 * - 동일 Platform 내 Job 순차 실행 보장
 * - Redis 기반 분산 Lock (SET NX EX)
 *
 * Phase 2: Worker 분리 지원
 * - WORKER_PLATFORMS 환경변수로 담당 플랫폼 지정
 * - 미지정 시 모든 플랫폼 처리 (레거시 모드)
 *
 * Phase 3: Kill Flag 기반 원격 재시작
 * - Redis에서 kill 플래그 체크 (5초 간격)
 * - 플래그 감지 시 process.exit(1) → Docker 재시작
 */

import "dotenv/config";
import { WorkflowExecutionService } from "@/services/WorkflowExecutionService";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { PlatformLock } from "@/repositories/PlatformLock";
import { SchedulerStateRepository } from "@/repositories/SchedulerStateRepository";
import { logImportant } from "@/utils/LoggerContext";
import { startHeartbeat } from "@/utils/heartbeat";
import { WORKFLOW_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";
import type { Job } from "@/core/domain/Workflow";

/**
 * Kill Flag 체크 간격 (ms)
 */
const KILL_CHECK_INTERVAL_MS = 5000;

const POLL_INTERVAL_MS = WORKFLOW_CONFIG.POLL_INTERVAL_MS;

/**
 * Worker가 처리할 Platform 목록 결정
 * - WORKER_PLATFORMS 환경변수: 쉼표로 구분된 플랫폼 목록
 * - 미지정 시: 모든 플랫폼 처리 (레거시 모드)
 */
function getWorkerPlatforms(): string[] {
  const envPlatforms = process.env.WORKER_PLATFORMS;

  if (envPlatforms) {
    return envPlatforms
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  // 레거시 모드: 모든 플랫폼 처리
  return WORKFLOW_CONFIG.PLATFORMS;
}

const PLATFORMS = getWorkerPlatforms();

let isRunning = true;

/**
 * Platform별 큐 처리 루프
 * Lock 메커니즘으로 순차 실행 보장
 *
 * 흐름:
 * 1. 큐 확인 (Lock 없이)
 * 2. Job 있으면 Lock 획득 시도
 * 3. Lock 획득 후 다시 dequeue (race condition 방지)
 * 4. Job 실행
 * 5. Lock 해제
 */
async function processPlatformQueue(
  platform: string,
  service: WorkflowExecutionService,
  repository: RedisWorkflowRepository,
  schedulerState: SchedulerStateRepository,
): Promise<void> {
  const platformLogger = logger.child({ platform });
  const lock = new PlatformLock(repository.client, platform);

  while (isRunning) {
    try {
      // 1. 큐 길이 확인 (Lock 없이 - 빠른 체크)
      const queueLength = await repository.getQueueLength(platform);

      if (queueLength === 0) {
        // 큐가 비어있으면 Lock 획득 없이 대기
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // 2. Job이 있으면 Lock 획득 시도
      const acquired = await lock.acquire();

      if (!acquired) {
        // 다른 프로세스가 실행 중 → 대기 후 재시도
        platformLogger.debug("Lock 획득 실패, 다른 Job 실행 중");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // 3. Lock 획득 후 dequeue (race condition 방지를 위해 다시 조회)
      const job: Job | null = await repository.dequeueJobByPlatform(platform);

      if (!job) {
        // 다른 프로세스가 먼저 가져감 → Lock 해제 후 대기
        await lock.release();
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      try {
        // 4. Running Job 설정 (모니터링/디버깅용)
        await lock.setRunningJob(job.job_id, job.workflow_id);

        logImportant(platformLogger, "Job 처리 시작 (Lock 보유)", {
          job_id: job.job_id,
          platform: job.platform,
          workflow_id: job.workflow_id,
        });

        // 5. Job 실행 (Lock 유지 상태)
        await service.executeJob(job);

        logImportant(platformLogger, "Job 처리 완료", {
          job_id: job.job_id,
          status: job.status,
        });

        // 6. Job 완료 시간 기록 (성공 시에만 - Scheduler 연동용)
        await schedulerState.setJobCompletedAt(platform);
      } finally {
        // 7. Running Job 초기화 및 Lock 해제 (성공/실패 관계없이)
        await lock.clearRunningJob();
        await lock.release();
      }
    } catch (error) {
      platformLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          platform,
        },
        "Platform 큐 처리 중 오류 발생",
      );

      // 오류 발생 시 잠시 대기 후 재시도
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Kill Flag Redis 키 패턴
 */
const KILL_FLAG_KEY = (platform: string) => `worker:kill:${platform}`;

/**
 * Kill Flag 체크 시작
 * - 5초마다 Redis에서 kill 플래그 확인
 * - 플래그 감지 시 process.exit(1) → Docker가 재시작
 *
 * @param platforms 담당 플랫폼 목록
 * @param repository Redis 저장소
 * @returns cleanup 함수
 */
function startKillFlagChecker(
  platforms: string[],
  repository: RedisWorkflowRepository,
): () => void {
  const intervalId = setInterval(async () => {
    try {
      for (const platform of platforms) {
        const killFlag = await repository.client.get(KILL_FLAG_KEY(platform));

        if (killFlag) {
          logger.warn(
            { platform, flag: killFlag },
            "Kill 플래그 감지, Worker 강제 종료...",
          );

          // 플래그 삭제 (재시작 후 다시 죽지 않도록)
          await repository.client.del(KILL_FLAG_KEY(platform));

          // 강제 종료 (Docker restart policy로 재시작됨)
          process.exit(1);
        }
      }
    } catch (error) {
      // 체크 실패해도 Worker는 계속 동작
      logger.debug(
        { error: error instanceof Error ? error.message : String(error) },
        "Kill 플래그 체크 중 오류 (무시)",
      );
    }
  }, KILL_CHECK_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

/**
 * Worker 시작
 */
async function startWorker() {
  const startTime = Date.now();
  const service = new WorkflowExecutionService();
  const repository = RedisWorkflowRepository.getInstance();
  const schedulerState = new SchedulerStateRepository(repository.client);

  const workerMode = process.env.WORKER_PLATFORMS ? "dedicated" : "legacy";

  // Heartbeat 서비스 이름 결정 (dedicated 모드: 첫 번째 플랫폼, legacy 모드: "worker:legacy")
  const heartbeatServiceName =
    workerMode === "dedicated" ? `worker:${PLATFORMS[0]}` : "worker:legacy";

  logImportant(logger, "Workflow Worker 시작", {
    mode: workerMode,
    platforms: PLATFORMS,
    platform_count: PLATFORMS.length,
    poll_interval_ms: POLL_INTERVAL_MS,
    kill_check_interval_ms: KILL_CHECK_INTERVAL_MS,
    heartbeat_service: heartbeatServiceName,
  });

  // Heartbeat 시작 (30초 간격)
  const stopHeartbeat = startHeartbeat(
    repository.client,
    heartbeatServiceName,
    startTime,
  );

  // Kill Flag 체크 시작 (5초 간격)
  const stopKillChecker = startKillFlagChecker(PLATFORMS, repository);

  // 각 Platform마다 독립적인 처리 루프 시작
  const processors = PLATFORMS.map((platform) =>
    processPlatformQueue(platform, service, repository, schedulerState),
  );

  // 모든 Platform 동시 처리 (병렬)
  await Promise.all(processors);

  // 정리
  stopKillChecker();
  stopHeartbeat();

  logImportant(logger, "Workflow Worker 중지", {});
}

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.warn("SIGTERM 수신, Worker 중지 중...");
  isRunning = false;
});

process.on("SIGINT", () => {
  logger.warn("SIGINT 수신, Worker 중지 중...");
  isRunning = false;
});

// Start worker
startWorker().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Worker 비정상 종료",
  );
  process.exit(1);
});

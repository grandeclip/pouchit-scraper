/**
 * Multi-Platform Workflow Worker
 * 단일 프로세스 내에서 8개 Platform 병렬 처리
 */

import "dotenv/config";
import { WorkflowExecutionService } from "@/services/WorkflowExecutionService";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { ConfigLoader } from "@/config/ConfigLoader";
import { createServiceLogger, logImportant } from "@/utils/logger-context";
import { SERVICE_NAMES, WORKFLOW_CONFIG } from "@/config/constants";
import type { Logger } from "@/config/logger";
import type { Job } from "@/core/domain/Workflow";
import type { PlatformConfig } from "@/core/domain/PlatformConfig";

const logger = createServiceLogger(SERVICE_NAMES.WORKER);

const POLL_INTERVAL_MS = WORKFLOW_CONFIG.POLL_INTERVAL_MS;
const PLATFORMS = WORKFLOW_CONFIG.PLATFORMS;

let isRunning = true;

/**
 * Platform별 큐 처리 루프
 */
async function processPlatformQueue(
  platform: string,
  service: WorkflowExecutionService,
  repository: RedisWorkflowRepository,
  configLoader: ConfigLoader,
): Promise<void> {
  const platformLogger = logger.child({ platform });

  while (isRunning) {
    try {
      // 1. Platform 전용 큐에서 Job 가져오기
      const job: Job | null = await repository.dequeueJobByPlatform(platform);

      if (!job) {
        // 큐가 비었을 때는 로그 생략
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      logImportant(platformLogger, "Job 처리 시작", {
        job_id: job.job_id,
        platform: job.platform,
        workflow_id: job.workflow_id,
      });

      // 2. Platform별 Rate Limiting 적용
      await applyRateLimit(platform, repository, configLoader, platformLogger);

      // 3. Job 실행
      await service.executeJob(job);

      // 4. Rate Limit Tracker 업데이트
      await repository.setRateLimitTracker(platform, Date.now());

      logImportant(platformLogger, "Job 처리 완료", {
        job_id: job.job_id,
        status: job.status,
      });
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

/**
 * Platform별 Rate Limiting 적용
 */
async function applyRateLimit(
  platform: string,
  repository: RedisWorkflowRepository,
  configLoader: ConfigLoader,
  platformLogger: Logger,
): Promise<void> {
  try {
    // 1. Platform Config 로드
    const config: PlatformConfig = await configLoader.loadConfig(platform);
    const waitTimeMs = config.workflow?.rate_limit?.wait_time_ms || 1000;

    // 2. 마지막 실행 시간 조회
    const lastExecution = await repository.getRateLimitTracker(platform);

    // 3. 대기 시간 계산
    const now = Date.now();
    const elapsed = now - lastExecution;

    if (elapsed < waitTimeMs) {
      const remainingWait = waitTimeMs - elapsed;

      platformLogger.info(
        {
          wait_time_ms: remainingWait,
          last_execution: lastExecution,
        },
        "Rate limit 대기 중",
      );

      await sleep(remainingWait);
    }
  } catch (error) {
    // Config 로드 실패 시 기본값 사용
    platformLogger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      "Platform config 로드 실패, 기본값 사용 (1000ms)",
    );

    // 기본 Rate Limiting 적용
    const lastExecution = await repository.getRateLimitTracker(platform);
    const now = Date.now();
    const elapsed = now - lastExecution;
    const defaultWaitTime = 1000;

    if (elapsed < defaultWaitTime) {
      await sleep(defaultWaitTime - elapsed);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker 시작
 */
async function startWorker() {
  const service = new WorkflowExecutionService();
  const repository = new RedisWorkflowRepository();
  const configLoader = ConfigLoader.getInstance();

  logImportant(logger, "Multi-Platform Workflow Worker 시작", {
    platforms: PLATFORMS,
    poll_interval_ms: POLL_INTERVAL_MS,
  });

  // 각 Platform마다 독립적인 처리 루프 시작
  const processors = PLATFORMS.map((platform) =>
    processPlatformQueue(platform, service, repository, configLoader),
  );

  // 모든 Platform 동시 처리 (병렬)
  await Promise.all(processors);

  logImportant(logger, "Multi-Platform Workflow Worker 중지", {});
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

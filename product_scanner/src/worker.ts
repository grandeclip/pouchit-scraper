/**
 * Multi-Platform Workflow Worker
 * 단일 프로세스 내에서 8개 Platform 병렬 처리
 */

import "dotenv/config";
import { WorkflowExecutionService } from "@/services/WorkflowExecutionService";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { logImportant } from "@/utils/LoggerContext";
import { WORKFLOW_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";
import type { Job } from "@/core/domain/Workflow";

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

      // Job 실행 (Rate Limiting은 각 Node에서 처리)
      await service.executeJob(job);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker 시작
 */
async function startWorker() {
  const service = new WorkflowExecutionService();
  const repository = new RedisWorkflowRepository();

  logImportant(logger, "Multi-Platform Workflow Worker 시작", {
    platforms: PLATFORMS,
    poll_interval_ms: POLL_INTERVAL_MS,
  });

  // 각 Platform마다 독립적인 처리 루프 시작
  const processors = PLATFORMS.map((platform) =>
    processPlatformQueue(platform, service, repository),
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

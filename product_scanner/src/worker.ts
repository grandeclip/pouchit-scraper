/**
 * Workflow Worker
 * 대기 중인 Job을 백그라운드에서 자동 처리
 */

import "dotenv/config";
import { WorkflowExecutionService } from "@/services/WorkflowExecutionService";
import { createServiceLogger, logImportant } from "@/utils/logger-context";
import { SERVICE_NAMES } from "@/config/constants";

const logger = createServiceLogger(SERVICE_NAMES.WORKER);

const POLL_INTERVAL_MS = parseInt(
  process.env.WORKER_POLL_INTERVAL || "5000",
  10,
);
const MAX_RETRIES = 3;

let isRunning = true;
let retryCount = 0;

async function processJobs() {
  const service = new WorkflowExecutionService();

  logImportant(logger, "Workflow Worker 시작", {
    poll_interval_ms: POLL_INTERVAL_MS,
  });

  while (isRunning) {
    try {
      const job = await service.processNextJob();

      if (job) {
        logImportant(logger, "Job 처리 완료", {
          job_id: job.job_id,
          status: job.status,
        });
        retryCount = 0; // 성공 시 재시도 카운트 리셋
      }
      // 큐가 비었을 때는 로그 생략 (너무 빈번)

      // 다음 폴링까지 대기
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          retry_count: retryCount + 1,
        },
        "Job 처리 중 오류 발생",
      );
      retryCount++;

      if (retryCount >= MAX_RETRIES) {
        logger.error(
          { max_retries: MAX_RETRIES },
          "최대 재시도 횟수 도달, Worker 중지",
        );
        isRunning = false;
      } else {
        logger.warn(
          {
            retry_count: retryCount,
            max_retries: MAX_RETRIES,
            retry_delay_ms: POLL_INTERVAL_MS,
          },
          "재시도 중...",
        );
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }

  logImportant(logger, "Workflow Worker 중지", {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
processJobs().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Worker 비정상 종료",
  );
  process.exit(1);
});

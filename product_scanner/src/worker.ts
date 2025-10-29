/**
 * Workflow Worker
 * 대기 중인 Job을 백그라운드에서 자동 처리
 */

import "dotenv/config";
import { WorkflowExecutionService } from "@/services/WorkflowExecutionService";

const POLL_INTERVAL_MS = parseInt(
  process.env.WORKER_POLL_INTERVAL || "5000",
  10,
);
const MAX_RETRIES = 3;

let isRunning = true;
let retryCount = 0;

async function processJobs() {
  const service = new WorkflowExecutionService();

  console.log("🚀 Workflow Worker started");
  console.log(`⏱️  Poll interval: ${POLL_INTERVAL_MS}ms`);

  while (isRunning) {
    try {
      console.log("\n🔍 Checking for jobs...");

      const job = await service.processNextJob();

      if (job) {
        console.log(`✅ Job processed: ${job.job_id}`);
        console.log(`   Status: ${job.status}`);
        retryCount = 0; // 성공 시 재시도 카운트 리셋
      } else {
        console.log("ℹ️  No jobs in queue");
      }

      // 다음 폴링까지 대기
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.error("❌ Error processing job:", error);
      retryCount++;

      if (retryCount >= MAX_RETRIES) {
        console.error(
          `🛑 Max retries (${MAX_RETRIES}) reached. Stopping worker.`,
        );
        isRunning = false;
      } else {
        console.log(
          `⏳ Retry ${retryCount}/${MAX_RETRIES} in ${POLL_INTERVAL_MS}ms...`,
        );
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }

  console.log("🛑 Workflow Worker stopped");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n🛑 SIGTERM received, stopping worker...");
  isRunning = false;
});

process.on("SIGINT", () => {
  console.log("\n🛑 SIGINT received, stopping worker...");
  isRunning = false;
});

// Start worker
processJobs().catch((error) => {
  console.error("💥 Worker crashed:", error);
  process.exit(1);
});

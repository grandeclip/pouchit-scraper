/**
 * Job 처리 스크립트
 * 대기 중인 Job을 하나씩 처리합니다
 */

import { WorkflowExecutionService } from "@/services/WorkflowExecutionService";

async function main() {
  console.log("🔄 Processing next job...");

  const service = new WorkflowExecutionService();

  try {
    const job = await service.processNextJob();

    if (job) {
      console.log(`✅ Job processed: ${job.job_id}`);
      console.log(`   Status: ${job.status}`);
    } else {
      console.log("ℹ️  No jobs in queue");
    }
  } catch (error) {
    console.error("❌ Job processing failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();

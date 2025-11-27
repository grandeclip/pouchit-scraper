/**
 * Jobs API Router
 *
 * 실행 중인 Job 및 Queue 현황 조회 API
 */

import { Router, Request, Response } from "express";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { PlatformLock } from "@/repositories/PlatformLock";
import { WORKFLOW_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";

const router = Router();

/**
 * 실행 중인 Job 정보 타입
 */
interface RunningJobInfo {
  platform: string;
  job_id: string;
  workflow_id?: string;
  started_at: string;
  elapsed_seconds: number;
}

/**
 * GET /api/v2/jobs/running
 *
 * 실행 중인 Job 및 Queue 현황 조회
 */
router.get("/running", async (_req: Request, res: Response) => {
  try {
    const repository = new RedisWorkflowRepository();
    const platforms = WORKFLOW_CONFIG.PLATFORMS;

    const running: RunningJobInfo[] = [];
    const queued: Record<string, number> = {};

    const now = Date.now();

    // 각 플랫폼별 실행 중인 Job 및 Queue 길이 조회
    await Promise.all(
      platforms.map(async (platform) => {
        const lock = new PlatformLock(repository.client, platform);

        // 실행 중인 Job 조회
        const runningJob = await lock.getRunningJob();
        if (runningJob) {
          const startedAt = new Date(runningJob.started_at).getTime();
          const elapsedSeconds = Math.floor((now - startedAt) / 1000);

          running.push({
            platform,
            job_id: runningJob.job_id,
            workflow_id: runningJob.workflow_id,
            started_at: runningJob.started_at,
            elapsed_seconds: elapsedSeconds,
          });
        }

        // Queue 길이 조회
        const queueLength = await repository.getQueueLength(platform);
        if (queueLength > 0) {
          queued[platform] = queueLength;
        }
      }),
    );

    // running을 elapsed_seconds 내림차순 정렬 (오래된 것부터)
    running.sort((a, b) => b.elapsed_seconds - a.elapsed_seconds);

    const totalQueued = Object.values(queued).reduce((sum, n) => sum + n, 0);

    res.json({
      success: true,
      data: {
        running,
        queued,
        summary: {
          running_count: running.length,
          queued_count: totalQueued,
        },
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      "[JobsRouter] 실행 중인 Job 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to fetch running jobs",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

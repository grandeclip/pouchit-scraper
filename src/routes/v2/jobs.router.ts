/**
 * Jobs API Router
 *
 * 실행 중인 Job 및 Queue 현황 조회/관리 API
 * - GET /running - 실행 중인 Job 조회
 * - POST /platform/:platform/force-release - Platform Lock 강제 해제
 */

import { Router, Request, Response } from "express";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { PlatformLock } from "@/repositories/PlatformLock";
import { WORKFLOW_CONFIG } from "@/config/constants";
import { JobStatus } from "@/core/domain/Workflow";
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
    const repository = RedisWorkflowRepository.getInstance();
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

/**
 * POST /api/v2/jobs/platform/:platform/force-release
 *
 * Platform Lock 강제 해제 및 Running Job 초기화
 * - 실행 중인 Job 상태를 FAILED로 변경
 * - Platform Lock 해제
 * - Running Job 정보 삭제
 *
 * 주의: 실제 Worker 프로세스는 종료되지 않음 (다음 iteration에서 정리됨)
 */
router.post(
  "/platform/:platform/force-release",
  async (req: Request, res: Response) => {
    try {
      const { platform } = req.params;
      const repository = RedisWorkflowRepository.getInstance();
      const lock = new PlatformLock(repository.client, platform);

      // 현재 실행 중인 Job 정보 조회
      const runningJob = await lock.getRunningJob();

      if (!runningJob) {
        res.json({
          success: true,
          message: `No running job found for platform: ${platform}`,
          data: {
            platform,
            had_running_job: false,
            lock_released: false,
          },
        });
        return;
      }

      // Job 상태를 FAILED로 업데이트
      const job = await repository.getJob(runningJob.job_id);
      if (job) {
        job.status = JobStatus.FAILED;
        job.completed_at = new Date().toISOString();
        job.error = {
          message: "Force released via API - stuck job detected",
          node_id: job.current_node || "unknown",
          timestamp: new Date().toISOString(),
        };
        await repository.updateJob(job);
      }

      // Lock 해제
      await lock.release();

      // Running Job 정보 삭제
      await lock.clearRunningJob();

      logger.warn(
        {
          platform,
          job_id: runningJob.job_id,
          workflow_id: runningJob.workflow_id,
          started_at: runningJob.started_at,
        },
        "[JobsRouter] Platform Lock 강제 해제",
      );

      res.json({
        success: true,
        message: `Platform ${platform} force released`,
        data: {
          platform,
          had_running_job: true,
          released_job: {
            job_id: runningJob.job_id,
            workflow_id: runningJob.workflow_id,
            started_at: runningJob.started_at,
          },
          lock_released: true,
          job_marked_failed: !!job,
        },
      });
    } catch (error) {
      logger.error(
        {
          platform: req.params.platform,
          error: error instanceof Error ? error.message : String(error),
        },
        "[JobsRouter] Platform Lock 강제 해제 실패",
      );

      res.status(500).json({
        success: false,
        error: "Failed to force release platform",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default router;

/**
 * Workers API Router
 *
 * Worker 컨테이너 관리 API
 * - POST /:platform/restart - Worker 재시작 (Kill Flag 설정)
 * - GET /status - 모든 Worker 상태 조회
 */

import { Router, Request, Response } from "express";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { PlatformLock } from "@/repositories/PlatformLock";
import { WORKFLOW_CONFIG } from "@/config/constants";
import { JobStatus } from "@/core/domain/Workflow";
import { logger } from "@/config/logger";

const router = Router();

/**
 * Kill Flag Redis 키 패턴 (worker.ts와 동일)
 */
const KILL_FLAG_KEY = (platform: string) => `worker:kill:${platform}`;

/**
 * Kill Flag TTL (초) - 60초 후 자동 만료
 */
const KILL_FLAG_TTL_SECONDS = 60;

/**
 * POST /api/v2/workers/:platform/restart
 *
 * Worker 재시작 요청
 * 1. Kill Flag 설정 → Worker가 감지하고 종료
 * 2. Platform Lock 해제 → 다음 Job 즉시 처리 가능
 * 3. 실행 중 Job 상태를 FAILED로 변경
 */
router.post("/:platform/restart", async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const repository = RedisWorkflowRepository.getInstance();
    const lock = new PlatformLock(repository.client, platform);

    // 플랫폼 유효성 검사
    if (!WORKFLOW_CONFIG.PLATFORMS.includes(platform)) {
      res.status(400).json({
        success: false,
        error: "Invalid platform",
        message: `Platform '${platform}' is not valid. Valid platforms: ${WORKFLOW_CONFIG.PLATFORMS.join(", ")}`,
      });
      return;
    }

    // 현재 실행 중인 Job 정보 조회
    const runningJob = await lock.getRunningJob();

    // 1. Kill Flag 설정 (Worker가 5초 내 감지)
    await repository.client.set(
      KILL_FLAG_KEY(platform),
      new Date().toISOString(),
      "EX",
      KILL_FLAG_TTL_SECONDS,
    );

    // 2. 실행 중인 Job이 있으면 FAILED 처리
    let jobMarkedFailed = false;
    if (runningJob) {
      const job = await repository.getJob(runningJob.job_id);
      if (job && job.status === JobStatus.RUNNING) {
        job.status = JobStatus.FAILED;
        job.completed_at = new Date().toISOString();
        job.error = {
          message: "Worker restart requested via API",
          node_id: job.current_node || "unknown",
          timestamp: new Date().toISOString(),
        };
        await repository.updateJob(job);
        jobMarkedFailed = true;
      }
    }

    // 3. Platform Lock 해제
    await lock.release();
    await lock.clearRunningJob();

    logger.warn(
      {
        platform,
        running_job: runningJob?.job_id,
        job_marked_failed: jobMarkedFailed,
      },
      "[WorkersRouter] Worker 재시작 요청",
    );

    res.json({
      success: true,
      message: `Worker restart requested for platform: ${platform}`,
      data: {
        platform,
        kill_flag_set: true,
        kill_flag_ttl_seconds: KILL_FLAG_TTL_SECONDS,
        lock_released: true,
        running_job: runningJob
          ? {
              job_id: runningJob.job_id,
              workflow_id: runningJob.workflow_id,
              started_at: runningJob.started_at,
              marked_failed: jobMarkedFailed,
            }
          : null,
        expected_restart_within_seconds: 10,
      },
    });
  } catch (error) {
    logger.error(
      {
        platform: req.params.platform,
        error: error instanceof Error ? error.message : String(error),
      },
      "[WorkersRouter] Worker 재시작 요청 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to restart worker",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v2/workers/status
 *
 * 모든 Worker 상태 조회
 * - 각 플랫폼별 실행 중인 Job
 * - Kill Flag 설정 여부
 */
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const repository = RedisWorkflowRepository.getInstance();
    const platforms = WORKFLOW_CONFIG.PLATFORMS;

    const statuses: Array<{
      platform: string;
      running_job: {
        job_id: string;
        workflow_id?: string;
        started_at: string;
        elapsed_seconds: number;
      } | null;
      kill_flag_set: boolean;
      lock_held: boolean;
    }> = [];

    const now = Date.now();

    await Promise.all(
      platforms.map(async (platform) => {
        const lock = new PlatformLock(repository.client, platform);

        // 실행 중인 Job 조회
        const runningJob = await lock.getRunningJob();

        // Kill Flag 확인
        const killFlag = await repository.client.get(KILL_FLAG_KEY(platform));

        // Lock 상태 확인
        const lockHeld = await lock.isLocked();

        let runningJobInfo = null;
        if (runningJob) {
          const startedAt = new Date(runningJob.started_at).getTime();
          const elapsedSeconds = Math.floor((now - startedAt) / 1000);
          runningJobInfo = {
            job_id: runningJob.job_id,
            workflow_id: runningJob.workflow_id,
            started_at: runningJob.started_at,
            elapsed_seconds: elapsedSeconds,
          };
        }

        statuses.push({
          platform,
          running_job: runningJobInfo,
          kill_flag_set: !!killFlag,
          lock_held: lockHeld,
        });
      }),
    );

    // 실행 중인 Job 기준 정렬 (오래된 것부터)
    statuses.sort((a, b) => {
      if (!a.running_job && !b.running_job) return 0;
      if (!a.running_job) return 1;
      if (!b.running_job) return -1;
      return b.running_job.elapsed_seconds - a.running_job.elapsed_seconds;
    });

    res.json({
      success: true,
      data: {
        workers: statuses,
        summary: {
          total: statuses.length,
          running: statuses.filter((s) => s.running_job !== null).length,
          kill_flags_set: statuses.filter((s) => s.kill_flag_set).length,
        },
        checked_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[WorkersRouter] Worker 상태 조회 실패",
    );

    res.status(500).json({
      success: false,
      error: "Failed to fetch worker status",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

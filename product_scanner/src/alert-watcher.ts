/**
 * Alert Watcher Service
 * 테이블 모니터링 및 알림 서비스
 *
 * 목적:
 * - 테이블별 모니터링 워크플로우 주기 실행
 * - 확장 가능한 구조 (collabo_banners, pick_sections, votes 등)
 * - 독립 실행 (기존 platform scheduler와 분리)
 * - API를 통한 start/stop 제어
 *
 * 동작 방식:
 * - 작업 완료 후 interval 대기 (enqueue 기준이 아님)
 * - Redis 기반 상태 관리 (enabled, completion time)
 * - Heartbeat로 실행 상태 모니터링
 *
 * 사용:
 * - npm run alert-watcher
 * - docker-compose에서 alert_watcher 서비스로 실행
 * - API: POST /api/v2/alert-watcher/start, stop, GET /status
 */

import { v7 as uuidv7 } from "uuid";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { AlertWatcherStateRepository } from "@/repositories/AlertWatcherStateRepository";
import { logger } from "@/config/logger";
import { Job, JobStatus } from "@/core/domain/Workflow";

/**
 * 감시 작업 설정
 */
interface WatchTask {
  /** 작업 ID */
  id: string;
  /** 작업 이름 */
  name: string;
  /** 워크플로우 ID */
  workflow_id: string;
  /** 완료 후 대기 시간 (ms) */
  interval_ms: number;
  /** 활성화 여부 */
  enabled: boolean;
}

/**
 * 감시 작업 목록
 * 새로운 모니터링 추가 시 여기에 등록
 */
const WATCH_TASKS: WatchTask[] = [
  {
    id: "collabo_banner",
    name: "Collabo Banner Monitor",
    workflow_id: "collabo-banner-monitor",
    interval_ms: 20 * 60 * 1000, // 20분
    enabled: true,
  },
  // 추가 감시 작업 예시:
  // {
  //   id: "pick_sections",
  //   name: "Pick Sections Monitor",
  //   workflow_id: "pick-sections-monitor",
  //   interval_ms: 30 * 60 * 1000, // 30분
  //   enabled: true,
  // },
  // {
  //   id: "votes",
  //   name: "Votes Monitor",
  //   workflow_id: "votes-monitor",
  //   interval_ms: 15 * 60 * 1000, // 15분
  //   enabled: true,
  // },
];

/**
 * Alert Watcher 설정
 */
const WATCHER_CONFIG = {
  /** 체크 주기 (ms) - 1분마다 상태 확인 */
  CHECK_INTERVAL_MS: 60 * 1000,
  /** Heartbeat 주기 (ms) - 10초마다 */
  HEARTBEAT_INTERVAL_MS: 10 * 1000,
  /** Job 완료 대기 폴링 주기 (ms) */
  JOB_POLL_INTERVAL_MS: 5 * 1000,
  /** Job 완료 대기 타임아웃 (ms) - 10분 */
  JOB_TIMEOUT_MS: 10 * 60 * 1000,
};

/**
 * 실행 상태
 */
let isRunning = true;

/**
 * Graceful shutdown 핸들러
 */
function setupShutdownHandlers(
  repository: RedisWorkflowRepository,
  watcherState: AlertWatcherStateRepository,
): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "[AlertWatcher] 종료 신호 수신");
    isRunning = false;

    // running 상태 업데이트
    await watcherState.updateStatus({ running: false });

    await repository.disconnect();

    logger.info("[AlertWatcher] 정상 종료 완료");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * 감시 Job 생성
 */
function createWatchJob(task: WatchTask): Job {
  const jobId = uuidv7();

  return {
    job_id: jobId,
    workflow_id: task.workflow_id,
    platform: "alert", // worker_alert 전용
    priority: 10, // 높은 우선순위
    status: JobStatus.PENDING,
    params: {
      task_id: task.id,
      task_name: task.name,
      debug_mode: true,
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
      scheduler_type: "alert-watcher",
      scheduler_version: "1.0.0",
      description: `[AlertWatcher] ${task.name}`,
    },
  };
}

/**
 * Job 완료 대기
 * @returns true: 완료, false: 타임아웃 또는 실패
 */
async function waitForJobCompletion(
  repository: RedisWorkflowRepository,
  jobId: string,
  taskName: string,
): Promise<boolean> {
  const startTime = Date.now();

  while (isRunning) {
    const elapsed = Date.now() - startTime;

    if (elapsed > WATCHER_CONFIG.JOB_TIMEOUT_MS) {
      logger.warn(
        { job_id: jobId, task_name: taskName, elapsed_ms: elapsed },
        "[AlertWatcher] Job 완료 대기 타임아웃",
      );
      return false;
    }

    const job = await repository.getJob(jobId);

    if (!job) {
      logger.warn({ job_id: jobId }, "[AlertWatcher] Job을 찾을 수 없음");
      return false;
    }

    if (job.status === JobStatus.COMPLETED) {
      logger.info(
        { job_id: jobId, task_name: taskName, elapsed_ms: elapsed },
        "[AlertWatcher] Job 완료 확인",
      );
      return true;
    }

    if (job.status === JobStatus.FAILED) {
      logger.error(
        { job_id: jobId, task_name: taskName, error: job.error },
        "[AlertWatcher] Job 실패",
      );
      return true; // 실패도 완료로 처리 (다음 주기에 재실행)
    }

    await sleep(WATCHER_CONFIG.JOB_POLL_INTERVAL_MS);
  }

  return false;
}

/**
 * 메인 Watcher 루프
 */
async function runAlertWatcher(): Promise<void> {
  const repository = RedisWorkflowRepository.getInstance();
  const watcherState = new AlertWatcherStateRepository(repository.client);

  // Shutdown 핸들러 설정
  setupShutdownHandlers(repository, watcherState);

  // Heartbeat 타이머 시작
  const heartbeatTimer = setInterval(async () => {
    if (isRunning) {
      await watcherState.updateHeartbeat();
    }
  }, WATCHER_CONFIG.HEARTBEAT_INTERVAL_MS);

  logger.info(
    {
      tasks: WATCH_TASKS.filter((t) => t.enabled).map((t) => ({
        id: t.id,
        name: t.name,
        interval_min: t.interval_ms / 60000,
      })),
      check_interval_ms: WATCHER_CONFIG.CHECK_INTERVAL_MS,
    },
    "[AlertWatcher] Alert Watcher 시작",
  );

  // 초기 heartbeat
  await watcherState.updateHeartbeat();

  while (isRunning) {
    try {
      // 1. enabled 상태 확인
      const isEnabled = await watcherState.isEnabled();

      if (!isEnabled) {
        logger.debug("[AlertWatcher] 비활성화 상태 - 대기 중");
        await sleep(WATCHER_CONFIG.CHECK_INTERVAL_MS);
        continue;
      }

      // 2. 각 작업 처리
      for (const task of WATCH_TASKS) {
        if (!isRunning) break;
        if (!task.enabled) continue;

        // enabled 재확인 (작업 중 stop될 수 있음)
        const stillEnabled = await watcherState.isEnabled();
        if (!stillEnabled) {
          logger.info("[AlertWatcher] 작업 중 비활성화됨 - 중단");
          break;
        }

        // 3. 작업 쿨다운 확인 (완료 후 interval 경과 여부)
        const canRun = await watcherState.isTaskCooldownComplete(
          task.id,
          task.interval_ms,
        );

        if (!canRun) {
          const completedAt = await watcherState.getTaskCompletedAt(task.id);
          const remaining = task.interval_ms - (Date.now() - completedAt);
          logger.debug(
            {
              task_id: task.id,
              remaining_min: Math.ceil(remaining / 60000),
            },
            "[AlertWatcher] 작업 쿨다운 중",
          );
          continue;
        }

        // 4. Job 생성 및 enqueue
        const job = createWatchJob(task);
        await repository.enqueueJob(job);

        logger.info(
          {
            task_id: task.id,
            task_name: task.name,
            job_id: job.job_id,
            workflow_id: job.workflow_id,
          },
          "[AlertWatcher] 감시 Job 추가",
        );

        // 5. Job 완료 대기
        const completed = await waitForJobCompletion(
          repository,
          job.job_id,
          task.name,
        );

        // 6. 완료 시간 기록 (다음 실행은 이 시점 + interval 후)
        if (completed) {
          await watcherState.setTaskCompletedAt(task.id);
          await watcherState.incrementJobsExecuted();

          logger.info(
            {
              task_id: task.id,
              task_name: task.name,
              next_run_in_min: task.interval_ms / 60000,
            },
            "[AlertWatcher] 작업 완료 - 다음 실행 대기",
          );
        }
      }

      // 다음 체크까지 대기
      await sleep(WATCHER_CONFIG.CHECK_INTERVAL_MS);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[AlertWatcher] Watcher 루프 오류",
      );
      await sleep(WATCHER_CONFIG.CHECK_INTERVAL_MS);
    }
  }

  // Cleanup
  clearInterval(heartbeatTimer);
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
  const enabledTasks = WATCH_TASKS.filter((t) => t.enabled);

  logger.info(
    {
      version: "1.0.0",
      total_tasks: WATCH_TASKS.length,
      enabled_tasks: enabledTasks.length,
      tasks: enabledTasks.map(
        (t) => `${t.name} (완료 후 ${t.interval_ms / 60000}분 대기)`,
      ),
    },
    "[AlertWatcher] ========================================",
  );
  logger.info("[AlertWatcher] Alert Watcher Service Started");
  logger.info("[AlertWatcher] ========================================");
}

// 메인 실행
logBanner();
runAlertWatcher().catch((error) => {
  logger.fatal({ error: error.message }, "[AlertWatcher] 치명적 오류 발생");
  process.exit(1);
});

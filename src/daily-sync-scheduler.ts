/**
 * Daily Sync Scheduler
 *
 * @deprecated 이 스케줄러는 workflow 기반 daily-sync-v2로 대체되었습니다.
 * 새로운 구현: workflows/daily-sync-v2.json + src/strategies/daily-sync/
 * API를 통해 workflow job을 enqueue하여 실행하세요.
 *
 * node-cron 기반 기획상품 자동 추가 스케줄러
 *
 * 목적:
 * - 매일 지정된 시간(기본: 02:00 KST)에 Daily Planning Product Sync 실행
 * - API를 통해 활성화/비활성화 제어
 * - 실행 시간 동적 변경 지원
 *
 * 사용:
 * - npm run daily-sync
 * - docker-compose에서 daily-sync 서비스로 실행
 *
 * 환경변수:
 * - TZ=Asia/Seoul (Docker에서 설정)
 */

import cron, { ScheduledTask } from "node-cron";
import { RedisWorkflowRepository } from "@/repositories/RedisWorkflowRepository";
import { DailySyncStateRepository } from "@/repositories/DailySyncStateRepository";
import { DailyPlanningProductSyncService } from "@/services/DailyPlanningProductSyncService";
import { logger } from "@/config/logger";

/**
 * 스케줄러 실행 상태
 */
let isRunning = true;
let currentCronTask: ScheduledTask | null = null;
let currentCronExpression: string | null = null;

/**
 * Graceful shutdown 핸들러
 */
function setupShutdownHandlers(repository: RedisWorkflowRepository): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "[DailySyncScheduler] 종료 신호 수신");
    isRunning = false;

    // Cron task 중지
    if (currentCronTask) {
      currentCronTask.stop();
      logger.info("[DailySyncScheduler] Cron task 중지됨");
    }

    // Redis 연결 종료
    await repository.disconnect();

    logger.info("[DailySyncScheduler] 정상 종료 완료");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Daily Sync 실행
 */
async function runDailySync(
  dailySyncState: DailySyncStateRepository,
): Promise<void> {
  const startedAt = new Date().toISOString();

  logger.info("[DailySyncScheduler] Daily Sync 실행 시작");

  const syncService = new DailyPlanningProductSyncService();

  // 실행 시작 기록
  await dailySyncState.setLastRun({
    started_at: startedAt,
    completed_at: null,
    success: false,
    summary: null,
    error: null,
  });

  try {
    // 대상 상품 수 조회 (Slack 알림용)
    const { SupabaseProductsRepository } =
      await import("@/repositories/SupabaseProductsRepository");
    const productsRepo = new SupabaseProductsRepository();
    const products = await productsRepo.findAll();
    const totalProducts = products.length;

    // Slack: 시작 알림
    await syncService.sendStartNotification(totalProducts);

    const result = await syncService.sync({
      batchSize: 10,
      delayMs: 2000,
      dryRun: false,
    });

    // 성공 기록
    await dailySyncState.setLastRun({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: true,
      summary: {
        total_products: result.totalProducts,
        success_count: result.successCount,
        failed_count: result.failedCount,
        new_product_sets: result.newProductSetsCount,
        duration_ms: result.durationMs,
      },
      error: null,
    });

    // Slack: 완료 알림
    await syncService.sendCompleteNotification(result);

    logger.info(
      {
        total_products: result.totalProducts,
        success_count: result.successCount,
        failed_count: result.failedCount,
        new_product_sets: result.newProductSetsCount,
        duration_ms: result.durationMs,
      },
      "[DailySyncScheduler] Daily Sync 실행 완료",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 실패 기록
    await dailySyncState.setLastRun({
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      success: false,
      summary: null,
      error: errorMessage,
    });

    logger.error(
      { error: errorMessage },
      "[DailySyncScheduler] Daily Sync 실행 실패",
    );
  }
}

/**
 * Cron task 생성/갱신
 */
function scheduleCronTask(
  cronExpression: string,
  dailySyncState: DailySyncStateRepository,
): void {
  // 기존 task 중지
  if (currentCronTask) {
    currentCronTask.stop();
    logger.info(
      { old_cron: currentCronExpression },
      "[DailySyncScheduler] 기존 Cron task 중지",
    );
  }

  // 새 task 생성
  currentCronTask = cron.schedule(
    cronExpression,
    async () => {
      logger.info(
        { cron: cronExpression },
        "[DailySyncScheduler] Cron 트리거됨",
      );

      // 활성화 상태 확인
      const isEnabled = await dailySyncState.isEnabled();
      if (!isEnabled) {
        logger.info("[DailySyncScheduler] 비활성화 상태 - 스킵");
        return;
      }

      await runDailySync(dailySyncState);
    },
    {
      timezone: "Asia/Seoul",
    },
  );

  currentCronExpression = cronExpression;

  logger.info(
    { cron: cronExpression, timezone: "Asia/Seoul" },
    "[DailySyncScheduler] Cron task 스케줄됨",
  );
}

/**
 * 다음 실행 시간 계산
 */
function calculateNextRunTime(hour: number, minute: number): Date {
  const now = new Date();
  const next = new Date(now);

  next.setHours(hour, minute, 0, 0);

  // 이미 지났으면 내일로
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * 메인 스케줄러 루프
 */
async function runScheduler(): Promise<void> {
  const repository = new RedisWorkflowRepository();
  const dailySyncState = new DailySyncStateRepository(repository.client);

  // Shutdown 핸들러 설정
  setupShutdownHandlers(repository);

  logger.info("[DailySyncScheduler] 스케줄러 시작");

  // 초기 설정 로드
  const config = await dailySyncState.getConfig();
  logger.info(
    {
      hour: config.hour,
      minute: config.minute,
      cron: config.cronExpression,
      timezone: "Asia/Seoul",
    },
    "[DailySyncScheduler] 설정 로드됨",
  );

  // 초기 Cron task 생성
  scheduleCronTask(config.cronExpression, dailySyncState);

  // 다음 실행 시간 저장
  const nextRun = calculateNextRunTime(config.hour, config.minute);
  await dailySyncState.setNextRunAt(nextRun.toISOString());
  logger.info(
    { next_run: nextRun.toISOString() },
    "[DailySyncScheduler] 다음 실행 시간",
  );

  // 설정 변경 감지 루프 (30초마다)
  while (isRunning) {
    try {
      // Heartbeat 업데이트
      await dailySyncState.updateHeartbeat();

      // 설정 변경 확인
      const currentConfig = await dailySyncState.getConfig();
      if (currentConfig.cronExpression !== currentCronExpression) {
        logger.info(
          {
            old: currentCronExpression,
            new: currentConfig.cronExpression,
          },
          "[DailySyncScheduler] 설정 변경 감지 - Cron 재스케줄",
        );

        scheduleCronTask(currentConfig.cronExpression, dailySyncState);

        // 다음 실행 시간 업데이트
        const newNextRun = calculateNextRunTime(
          currentConfig.hour,
          currentConfig.minute,
        );
        await dailySyncState.setNextRunAt(newNextRun.toISOString());
      }

      // 30초 대기
      await sleep(30000);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[DailySyncScheduler] 루프 오류",
      );
      await sleep(30000);
    }
  }
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
  logger.info(
    {
      version: "1.0.0",
      timezone: process.env.TZ || "System default",
      description: "Daily Planning Product Sync Scheduler",
    },
    "[DailySyncScheduler] ====== Daily Sync Scheduler 시작 ======",
  );
}

// 메인 실행
logBanner();
runScheduler().catch((error) => {
  logger.fatal(
    { error: error.message },
    "[DailySyncScheduler] 치명적 오류 발생",
  );
  process.exit(1);
});

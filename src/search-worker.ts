/**
 * Search Worker - 검색 Job 큐 소비자
 *
 * 단순 구조:
 * - 단일 큐 (플랫폼 구분 없음)
 * - Lock 불필요 (검색은 독립적)
 * - Redis 큐 폴링 → 검색 실행 → 결과 저장
 */

import "dotenv/config";
import { RedisSearchRepository } from "@/repositories/RedisSearchRepository";
import { SearcherRegistry } from "@/services/SearcherRegistry";
import { registerAllSearchers, getSupportedSearchPlatforms } from "@/searchers";
import { SearchConfigLoader } from "@/config/SearchConfigLoader";
import { logImportant } from "@/utils/LoggerContext";
import { startHeartbeat } from "@/utils/heartbeat";
import { logger } from "@/config/logger";
import type { SearchJob } from "@/core/domain/search/SearchJob";
import type { SearchRequest } from "@/core/domain/search/SearchProduct";

/**
 * 폴링 간격 (ms)
 */
const POLL_INTERVAL_MS = parseInt(
  process.env.SEARCH_POLL_INTERVAL || "2000",
  10,
);

/**
 * 동시 처리 수 (병렬 검색)
 */
const CONCURRENCY = parseInt(process.env.SEARCH_CONCURRENCY || "3", 10);

let isRunning = true;
let activeJobs = 0;

/**
 * 단일 Job 처리
 */
async function processJob(
  job: SearchJob,
  repository: RedisSearchRepository,
  registry: SearcherRegistry,
): Promise<void> {
  const jobLogger = logger.child({
    job_id: job.job_id,
    platform: job.platform,
    keyword: job.keyword,
  });

  try {
    // 1. 상태 업데이트: RUNNING
    await repository.markJobRunning(job.job_id);
    jobLogger.debug("Job 실행 시작");

    // 2. Searcher 가져오기
    const searcher = registry.getSearcher(job.platform);

    // 3. 검색 실행
    const request: SearchRequest = {
      keyword: job.keyword,
      limit: job.limit,
    };

    const result = await searcher.search(request);

    // 4. 상태 업데이트: COMPLETED
    await repository.markJobCompleted(job.job_id, result);

    jobLogger.info(
      {
        total_count: result.totalCount,
        returned_count: result.products.length,
      },
      "Job 완료",
    );
  } catch (error) {
    // 5. 상태 업데이트: FAILED
    const errorMessage = error instanceof Error ? error.message : String(error);
    await repository.markJobFailed(job.job_id, errorMessage);

    jobLogger.error({ error: errorMessage }, "Job 실패");
  }
}

/**
 * 큐 처리 루프
 */
async function processQueue(
  repository: RedisSearchRepository,
  registry: SearcherRegistry,
): Promise<void> {
  while (isRunning) {
    try {
      // 동시 처리 제한 체크
      if (activeJobs >= CONCURRENCY) {
        await sleep(100);
        continue;
      }

      // 큐에서 Job 가져오기
      const job = await repository.dequeueJob();

      if (!job) {
        // 큐가 비어있으면 대기
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // 비동기로 Job 처리 (동시 처리)
      activeJobs++;
      processJob(job, repository, registry)
        .finally(() => {
          activeJobs--;
        })
        .catch((error) => {
          logger.error(
            {
              job_id: job.job_id,
              error: error instanceof Error ? error.message : String(error),
            },
            "Job 처리 중 예외 발생",
          );
        });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "큐 처리 중 오류 발생",
      );
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
async function startWorker(): Promise<void> {
  const startTime = Date.now();

  // 1. Searcher 등록
  registerAllSearchers();

  // 2. 설정 로드 확인
  const configLoader = SearchConfigLoader.getInstance();
  const platforms = configLoader.getAvailablePlatforms();

  if (platforms.length === 0) {
    logger.error("검색 플랫폼 설정이 없습니다");
    process.exit(1);
  }

  // 3. Repository 및 Registry 초기화
  const repository = RedisSearchRepository.getInstance();
  const registry = SearcherRegistry.getInstance();

  // 4. Redis 연결 확인
  const healthy = await repository.healthCheck();
  if (!healthy) {
    logger.error("Redis 연결 실패");
    process.exit(1);
  }

  logImportant(logger, "Search Worker 시작", {
    platforms: getSupportedSearchPlatforms(),
    platform_count: platforms.length,
    poll_interval_ms: POLL_INTERVAL_MS,
    concurrency: CONCURRENCY,
    heartbeat_service: "worker:search",
  });

  // 5. Heartbeat 시작 (30초 간격)
  const stopHeartbeat = startHeartbeat(
    repository.client,
    "worker:search",
    startTime,
  );

  // 6. 큐 처리 루프 시작
  await processQueue(repository, registry);

  // 7. 종료 처리
  stopHeartbeat();
  logImportant(logger, "Search Worker 종료", {});

  // Searcher 리소스 정리
  await registry.clearAll();
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.warn("SIGTERM 수신, Search Worker 중지 중...");
  isRunning = false;

  // 진행 중인 Job 완료 대기 (최대 30초)
  const maxWait = 30000;
  const startTime = Date.now();

  while (activeJobs > 0 && Date.now() - startTime < maxWait) {
    logger.info({ active_jobs: activeJobs }, "진행 중인 Job 완료 대기...");
    await sleep(1000);
  }

  if (activeJobs > 0) {
    logger.warn({ active_jobs: activeJobs }, "미완료 Job 존재, 강제 종료");
  }

  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.warn("SIGINT 수신, Search Worker 중지 중...");
  isRunning = false;

  // 진행 중인 Job 완료 대기 (최대 10초)
  const maxWait = 10000;
  const startTime = Date.now();

  while (activeJobs > 0 && Date.now() - startTime < maxWait) {
    await sleep(500);
  }

  process.exit(0);
});

// Start worker
startWorker().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Search Worker 비정상 종료",
  );
  process.exit(1);
});

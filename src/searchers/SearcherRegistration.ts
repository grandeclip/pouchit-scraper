/**
 * SearcherRegistration - Searcher 등록 모듈
 *
 * 역할:
 * - 플랫폼별 Searcher 생성자를 SearcherFactory에 등록
 * - 애플리케이션 시작 시 한 번 호출
 *
 * SOLID 원칙:
 * - SRP: Searcher 등록만 담당
 * - OCP: 새 플랫폼 추가 시 여기에만 등록
 */

import { SearcherFactory } from "@/searchers/base/SearcherFactory";
import type { ISearcher } from "@/core/interfaces/search/ISearcher";
import type {
  SearchConfig,
  SearchStrategyConfig,
} from "@/core/domain/search/SearchConfig";
import { logger } from "@/config/logger";

// Platform Searchers
import { ZigzagGraphQLSearcher } from "@/searchers/platforms/zigzag";
import { OliveYoungSearcher } from "@/searchers/platforms/oliveyoung";
import { MusinsaSearcher } from "@/searchers/platforms/musinsa";
import { AblySearcher } from "@/searchers/platforms/ably";
import { KurlySearcher } from "@/searchers/platforms/kurly";
import { HwahaeSearcher } from "@/searchers/platforms/hwahae";

/**
 * 플랫폼 ID 상수
 */
export const SEARCH_PLATFORM_IDS = {
  ZIGZAG: "zigzag",
  OLIVEYOUNG: "oliveyoung",
  MUSINSA: "musinsa",
  ABLY: "ably",
  KURLY: "kurly",
  HWAHAE: "hwahae",
} as const;

/**
 * Searcher 생성 함수 타입
 */
type SearcherCreator = (
  config: SearchConfig,
  strategy: SearchStrategyConfig,
) => ISearcher;

/**
 * 플랫폼별 Searcher 매핑
 */
const SEARCHER_MAP: Record<string, SearcherCreator> = {
  [SEARCH_PLATFORM_IDS.ZIGZAG]: (config, strategy) =>
    new ZigzagGraphQLSearcher(config, strategy),
  [SEARCH_PLATFORM_IDS.OLIVEYOUNG]: (config, strategy) =>
    new OliveYoungSearcher(config, strategy),
  [SEARCH_PLATFORM_IDS.MUSINSA]: (config, strategy) =>
    new MusinsaSearcher(config, strategy),
  [SEARCH_PLATFORM_IDS.ABLY]: (config, strategy) =>
    new AblySearcher(config, strategy),
  [SEARCH_PLATFORM_IDS.KURLY]: (config, strategy) =>
    new KurlySearcher(config, strategy),
  [SEARCH_PLATFORM_IDS.HWAHAE]: (config, strategy) =>
    new HwahaeSearcher(config, strategy),
};

/**
 * 모든 Searcher 등록
 */
export function registerAllSearchers(): void {
  logger.info("Searcher 등록 시작...");

  for (const [platform, creator] of Object.entries(SEARCHER_MAP)) {
    SearcherFactory.registerCreator(platform, creator);
    logger.debug({ platform }, "Searcher 등록 완료");
  }

  logger.info(
    { count: Object.keys(SEARCHER_MAP).length },
    "모든 Searcher 등록 완료",
  );
}

/**
 * 지원 플랫폼 목록 반환
 */
export function getSupportedSearchPlatforms(): string[] {
  return Object.values(SEARCH_PLATFORM_IDS);
}

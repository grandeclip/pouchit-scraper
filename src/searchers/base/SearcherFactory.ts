/**
 * SearcherFactory - Searcher 팩토리
 * Factory Pattern
 *
 * 역할:
 * - 전략 타입에 따라 적절한 Searcher 인스턴스 생성
 * - SearchConfigLoader와 통합하여 YAML 기반 Searcher 생성
 *
 * SOLID 원칙:
 * - SRP: Searcher 생성만 담당
 * - OCP: 새 전략 추가 시 코드 수정 최소화
 * - DIP: 인터페이스(ISearcher)에 의존
 */

import type { ISearcher } from "@/core/interfaces/search/ISearcher";
import type {
  SearchConfig,
  SearchStrategyConfig,
} from "@/core/domain/search/SearchConfig";
import { SearchConfigLoader } from "@/config/SearchConfigLoader";
import { logger } from "@/config/logger";

/**
 * Searcher 생성 함수 타입
 */
type SearcherCreator = (
  config: SearchConfig,
  strategy: SearchStrategyConfig,
) => ISearcher;

/**
 * Searcher Factory
 */
export class SearcherFactory {
  /**
   * 플랫폼별 Searcher 생성기 등록
   * 각 플랫폼의 Searcher 클래스를 동적으로 등록
   */
  private static creators: Map<string, SearcherCreator> = new Map();

  /**
   * Searcher 생성기 등록
   * @param platform 플랫폼 이름
   * @param creator Searcher 생성 함수
   */
  static registerCreator(platform: string, creator: SearcherCreator): void {
    this.creators.set(platform, creator);
    logger.debug({ platform }, "Searcher creator registered");
  }

  /**
   * 플랫폼과 전략 ID로 Searcher 생성
   * @param platform 플랫폼 이름 (예: "zigzag", "oliveyoung")
   * @param strategyId 전략 ID (옵션, 없으면 priority 기반 선택)
   * @returns Searcher 인스턴스
   */
  static createSearcher(platform: string, strategyId?: string): ISearcher {
    // 설정 로드
    const config = SearchConfigLoader.getInstance().loadConfig(platform);

    // 전략 선택
    const strategy = this.selectStrategy(config, strategyId);

    // Searcher 생성
    return this.createSearcherByPlatform(config, strategy);
  }

  /**
   * 전략 선택 로직
   * @param config 플랫폼 설정
   * @param strategyId 전략 ID (옵션)
   * @returns 선택된 전략 설정
   */
  private static selectStrategy(
    config: SearchConfig,
    strategyId?: string,
  ): SearchStrategyConfig {
    if (!config.strategies || config.strategies.length === 0) {
      throw new Error(
        `No search strategies defined for platform: ${config.platform}`,
      );
    }

    // 전략 ID가 지정된 경우
    if (strategyId) {
      const strategy = config.strategies.find((s) => s.id === strategyId);
      if (!strategy) {
        throw new Error(
          `Search strategy not found: ${strategyId} in platform ${config.platform}`,
        );
      }
      return strategy;
    }

    // 전략 ID가 없으면 priority 기반 선택 (낮은 숫자가 우선)
    const sortedStrategies = [...config.strategies].sort(
      (a, b) => a.priority - b.priority,
    );

    return sortedStrategies[0];
  }

  /**
   * 플랫폼별 Searcher 생성
   * @param config 플랫폼 설정
   * @param strategy 전략 설정
   * @returns Searcher 인스턴스
   */
  private static createSearcherByPlatform(
    config: SearchConfig,
    strategy: SearchStrategyConfig,
  ): ISearcher {
    const creator = this.creators.get(config.platform);

    if (!creator) {
      throw new Error(
        `No searcher creator registered for platform: ${config.platform}`,
      );
    }

    logger.debug(
      {
        platform: config.platform,
        strategyId: strategy.id,
        strategyType: strategy.type,
      },
      "Creating searcher",
    );

    return creator(config, strategy);
  }

  /**
   * 사용 가능한 전략 목록 반환
   * @param platform 플랫폼 이름
   * @returns 전략 ID 목록
   */
  static getAvailableStrategies(platform: string): string[] {
    return SearchConfigLoader.getInstance().getAvailableStrategies(platform);
  }

  /**
   * 기본 전략 ID 반환
   * @param platform 플랫폼 이름
   * @returns 기본 전략 ID (priority가 가장 낮은 것)
   */
  static getDefaultStrategyId(platform: string): string {
    const config = SearchConfigLoader.getInstance().loadConfig(platform);
    const sortedStrategies = [...config.strategies].sort(
      (a, b) => a.priority - b.priority,
    );
    return sortedStrategies[0].id;
  }

  /**
   * 등록된 플랫폼 목록 반환
   */
  static getRegisteredPlatforms(): string[] {
    return Array.from(this.creators.keys());
  }

  /**
   * 특정 플랫폼 등록 여부 확인
   */
  static hasCreator(platform: string): boolean {
    return this.creators.has(platform);
  }

  /**
   * 모든 생성기 클리어 (테스트용)
   */
  static clearCreators(): void {
    this.creators.clear();
  }
}

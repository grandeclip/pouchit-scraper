/**
 * SearchConfigLoader - Search YAML 설정 로더
 * Singleton Pattern
 *
 * 역할:
 * - config/search/*.yaml 파일 로드
 * - SearchConfig 스키마 검증 (Zod)
 * - 설정 캐싱
 *
 * SOLID 원칙:
 * - SRP: Search YAML 파일 로드만 담당
 * - OCP: 새로운 플랫폼 추가 시 YAML만 추가
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import {
  SearchConfig,
  SearchConfigSchema,
} from "@/core/domain/search/SearchConfig";
import { logger } from "@/config/logger";

/**
 * Search 설정 디렉토리
 */
const SEARCH_CONFIG_DIR = "search";

/**
 * Search Config Loader (Singleton)
 */
export class SearchConfigLoader {
  private static instance: SearchConfigLoader;
  private configCache: Map<string, SearchConfig> = new Map();

  private constructor() {}

  /**
   * Singleton 인스턴스 반환
   */
  static getInstance(): SearchConfigLoader {
    if (!SearchConfigLoader.instance) {
      SearchConfigLoader.instance = new SearchConfigLoader();
    }
    return SearchConfigLoader.instance;
  }

  /**
   * Search YAML 설정 파일 로드
   * @param platform 플랫폼 이름 (예: "zigzag", "oliveyoung")
   * @returns SearchConfig
   */
  loadConfig(platform: string): SearchConfig {
    // 캐시 확인
    if (this.configCache.has(platform)) {
      return this.configCache.get(platform)!;
    }

    // YAML 파일 경로
    const configPath = path.join(
      __dirname,
      SEARCH_CONFIG_DIR,
      `${platform}.yaml`,
    );

    // 파일 존재 확인
    if (!fs.existsSync(configPath)) {
      throw new Error(`Search config file not found: ${configPath}`);
    }

    // YAML 파싱
    const fileContent = fs.readFileSync(configPath, "utf8");
    const rawConfig = yaml.load(fileContent) as Record<string, unknown>;

    // Zod 스키마 검증
    const parseResult = SearchConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      logger.error(
        { platform, errors: parseResult.error.errors },
        "Search config validation failed",
      );
      throw new Error(
        `Invalid search config for ${platform}: ${parseResult.error.message}`,
      );
    }

    const config = parseResult.data;

    // 추가 검증: 전략 ID 중복 체크
    this.validateStrategyIds(config);

    // 캐시 저장
    this.configCache.set(platform, config);

    logger.debug(
      { platform, strategies: config.strategies.map((s) => s.id) },
      "Search config loaded",
    );

    return config;
  }

  /**
   * 전략 ID 중복 검증
   */
  private validateStrategyIds(config: SearchConfig): void {
    const strategyIds = config.strategies.map((s) => s.id);
    const uniqueIds = new Set(strategyIds);

    if (strategyIds.length !== uniqueIds.size) {
      throw new Error(
        `Duplicate strategy IDs found in platform: ${config.platform}`,
      );
    }
  }

  /**
   * 사용 가능한 Search 플랫폼 목록 반환
   * @returns 플랫폼 ID 배열
   */
  getAvailablePlatforms(): string[] {
    const searchDir = path.join(__dirname, SEARCH_CONFIG_DIR);

    if (!fs.existsSync(searchDir)) {
      logger.warn({ searchDir }, "Search config directory not found");
      return [];
    }

    const files = fs.readdirSync(searchDir);
    const platforms = files
      .filter((file) => file.endsWith(".yaml"))
      .map((file) => file.replace(".yaml", ""));

    return platforms;
  }

  /**
   * 특정 플랫폼의 전략 목록 반환
   * @param platform 플랫폼 이름
   * @returns 전략 ID 배열
   */
  getAvailableStrategies(platform: string): string[] {
    const config = this.loadConfig(platform);
    return config.strategies.map((s) => s.id);
  }

  /**
   * 캐시 클리어 (테스트용)
   */
  clearCache(): void {
    this.configCache.clear();
  }
}

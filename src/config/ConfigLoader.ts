/**
 * YAML 설정 로더
 * Singleton Pattern 적용
 *
 * SOLID 원칙:
 * - SRP: YAML 파일 로드만 담당
 * - OCP: 새로운 플랫폼 추가 시 YAML만 추가
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import {
  StrategyConfig,
  HttpStrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import { PATH_CONFIG } from "./constants";
import { logger } from "./logger";

/**
 * Config Loader Singleton
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private configCache: Map<string, PlatformConfig> = new Map();

  private constructor() {}

  /**
   * Singleton 인스턴스 반환
   */
  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * YAML 설정 파일 로드
   */
  loadConfig(platform: string): PlatformConfig {
    // 캐시 확인
    if (this.configCache.has(platform)) {
      return this.configCache.get(platform)!;
    }

    // YAML 파일 경로
    const configPath = path.join(
      __dirname,
      PATH_CONFIG.PLATFORMS_DIR,
      `${platform}.yaml`,
    );

    // 파일 존재 확인
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    // YAML 파싱
    const fileContent = fs.readFileSync(configPath, "utf8");
    const config = yaml.load(fileContent) as PlatformConfig;

    // 검증
    this.validateConfig(config);

    // 캐시 저장
    this.configCache.set(platform, config);

    return config;
  }

  /**
   * 설정 유효성 검증
   */
  private validateConfig(config: PlatformConfig): void {
    if (!config.platform) throw new Error("platform is required");
    if (!config.baseUrl) throw new Error("baseUrl is required");
    if (!config.endpoints) throw new Error("endpoints is required");
    // fieldMapping은 optional (Extractor 패턴 사용 시 불필요)

    // 다중 전략 검증
    if (!config.strategies || config.strategies.length === 0) {
      throw new Error("At least one strategy is required");
    }

    // 전략 ID 중복 체크
    const strategyIds = config.strategies.map((s: StrategyConfig) => s.id);
    const uniqueIds = new Set(strategyIds);
    if (strategyIds.length !== uniqueIds.size) {
      throw new Error("Duplicate strategy IDs found");
    }

    // 각 전략 검증
    for (const strategy of config.strategies) {
      if (!strategy.id) throw new Error("Strategy id is required");
      if (!strategy.type) throw new Error("Strategy type is required");
      if (strategy.priority === undefined) {
        throw new Error("Strategy priority is required");
      }

      // HTTP 전략 검증
      if (strategy.type === "http") {
        const httpStrategy = strategy as HttpStrategyConfig;
        if (!httpStrategy.http) {
          throw new Error(
            `HTTP configuration missing for strategy: ${strategy.id}`,
          );
        }
      }

      // Playwright 전략 검증
      if (strategy.type === "playwright") {
        const playwrightStrategy = strategy as PlaywrightStrategyConfig;
        if (!playwrightStrategy.playwright) {
          throw new Error(
            `Playwright configuration missing for strategy: ${strategy.id}`,
          );
        }
      }
    }

    // 하위 호환성: http 필드가 있으면 경고
    if (config.http) {
      logger.warn(
        "[ConfigLoader] DEPRECATED: 'http' field is deprecated. Use 'strategies' instead.",
      );
    }
  }

  /**
   * 사용 가능한 플랫폼 목록 반환
   * @returns 플랫폼 ID 배열
   */
  getAvailablePlatforms(): string[] {
    const platformsDir = path.join(__dirname, PATH_CONFIG.PLATFORMS_DIR);

    if (!fs.existsSync(platformsDir)) {
      // 디렉토리 없음은 설정 오류이므로 throw
      throw new Error(`Platforms directory not found: ${platformsDir}`);
    }

    try {
      const files = fs.readdirSync(platformsDir);
      const platforms = files
        .filter((file) => file.endsWith(".yaml"))
        .map((file) => file.replace(".yaml", ""));

      if (platforms.length === 0) {
        throw new Error(`No platform YAML files found in: ${platformsDir}`);
      }

      return platforms;
    } catch (error) {
      if (error instanceof Error) {
        throw error; // 이미 처리된 에러는 재전파
      }
      throw new Error(
        `Failed to read platforms directory: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * 캐시 클리어 (테스트용)
   */
  clearCache(): void {
    this.configCache.clear();
  }
}

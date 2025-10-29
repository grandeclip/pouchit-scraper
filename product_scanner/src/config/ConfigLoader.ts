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
import { HwahaeConfig } from "@/core/domain/HwahaeConfig";

/**
 * Config Loader Singleton
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private configCache: Map<string, HwahaeConfig> = new Map();

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
  loadConfig(platform: string): HwahaeConfig {
    // 캐시 확인
    if (this.configCache.has(platform)) {
      return this.configCache.get(platform)!;
    }

    // YAML 파일 경로
    const configPath = path.join(__dirname, "platforms", `${platform}.yaml`);

    // 파일 존재 확인
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    // YAML 파싱
    const fileContent = fs.readFileSync(configPath, "utf8");
    const config = yaml.load(fileContent) as HwahaeConfig;

    // 검증
    this.validateConfig(config);

    // 캐시 저장
    this.configCache.set(platform, config);

    return config;
  }

  /**
   * 설정 유효성 검증
   */
  private validateConfig(config: HwahaeConfig): void {
    if (!config.platform) throw new Error("platform is required");
    if (!config.baseUrl) throw new Error("baseUrl is required");
    if (!config.endpoints) throw new Error("endpoints is required");
    if (!config.fieldMapping) throw new Error("fieldMapping is required");

    // 다중 전략 검증
    if (!config.strategies || config.strategies.length === 0) {
      throw new Error("At least one strategy is required");
    }

    // 전략 ID 중복 체크
    const strategyIds = config.strategies.map((s) => s.id);
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
        const httpStrategy = strategy as any;
        if (!httpStrategy.http) {
          throw new Error(
            `HTTP configuration missing for strategy: ${strategy.id}`,
          );
        }
      }

      // Playwright 전략 검증
      if (strategy.type === "playwright") {
        const playwrightStrategy = strategy as any;
        if (!playwrightStrategy.playwright) {
          throw new Error(
            `Playwright configuration missing for strategy: ${strategy.id}`,
          );
        }
      }
    }

    // 하위 호환성: http 필드가 있으면 경고
    if (config.http) {
      console.warn(
        "[ConfigLoader] DEPRECATED: 'http' field is deprecated. Use 'strategies' instead.",
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

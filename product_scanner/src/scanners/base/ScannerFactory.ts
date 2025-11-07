/**
 * 스캐너 팩토리
 * Factory Pattern
 *
 * 역할:
 * - 전략 타입에 따라 적절한 스캐너 인스턴스 생성
 * - ConfigLoader와 통합하여 YAML 기반 스캐너 생성
 *
 * SOLID 원칙:
 * - SRP: 스캐너 생성만 담당
 * - OCP: 새 전략 추가 시 코드 수정 최소화
 * - DIP: 인터페이스에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import {
  StrategyConfig,
  isHttpStrategy,
  isPlaywrightStrategy,
} from "@/core/domain/StrategyConfig";
import { ConfigLoader } from "@/config/ConfigLoader";
import { PLATFORM_IDS } from "@/core/domain/PlatformId";

/**
 * 스캐너 팩토리
 */
export class ScannerFactory {
  /**
   * 플랫폼과 전략 ID로 스캐너 생성
   * @param platform 플랫폼 이름 (예: "hwahae")
   * @param strategyId 전략 ID (옵션, 없으면 priority 기반 선택)
   * @returns 스캐너 인스턴스
   */
  static createScanner(platform: string, strategyId?: string): IScanner {
    // 설정 로드
    const config = ConfigLoader.getInstance().loadConfig(platform);

    // 전략 선택
    const strategy = this.selectStrategy(config, strategyId);

    // 전략 타입에 따라 스캐너 생성
    return this.createScannerByType(config, strategy);
  }

  /**
   * 전략 선택 로직
   * @param config 플랫폼 설정
   * @param strategyId 전략 ID (옵션)
   * @returns 선택된 전략 설정
   */
  private static selectStrategy(
    config: PlatformConfig,
    strategyId?: string,
  ): StrategyConfig {
    if (!config.strategies || config.strategies.length === 0) {
      throw new Error(`No strategies defined for platform: ${config.platform}`);
    }

    // 전략 ID가 지정된 경우
    if (strategyId) {
      const strategy = config.strategies.find(
        (s: StrategyConfig) => s.id === strategyId,
      );
      if (!strategy) {
        throw new Error(
          `Strategy not found: ${strategyId} in platform ${config.platform}`,
        );
      }
      return strategy;
    }

    // 전략 ID가 없으면 priority 기반 선택 (낮은 숫자가 우선)
    const sortedStrategies = [...config.strategies].sort(
      (a: StrategyConfig, b: StrategyConfig) => a.priority - b.priority,
    );

    return sortedStrategies[0];
  }

  /**
   * 전략 타입에 따라 스캐너 생성
   * @param config 플랫폼 설정
   * @param strategy 전략 설정
   * @returns 스캐너 인스턴스
   */
  private static createScannerByType(
    config: PlatformConfig,
    strategy: StrategyConfig,
  ): IScanner {
    // 플랫폼별 Factory 사용
    switch (config.platform) {
      case PLATFORM_IDS.HWAHAE: {
        const {
          HwahaeScannerFactory,
        } = require("../platforms/hwahae/HwahaeScannerFactory");
        const factory = new HwahaeScannerFactory(config);
        return factory.create(strategy);
      }

      case PLATFORM_IDS.OLIVEYOUNG: {
        const {
          OliveyoungScannerFactory,
        } = require("../platforms/oliveyoung/OliveyoungScannerFactory");
        const factory = new OliveyoungScannerFactory(config);
        return factory.create(strategy);
      }

      case PLATFORM_IDS.ZIGZAG: {
        const {
          ZigzagScannerFactory,
        } = require("../platforms/zigzag/ZigzagScannerFactory");
        const factory = new ZigzagScannerFactory(config);
        return factory.create(strategy);
      }

      default:
        throw new Error(`Unsupported platform: ${config.platform}`);
    }
  }

  /**
   * 사용 가능한 전략 목록 반환
   * @param platform 플랫폼 이름
   * @returns 전략 ID 목록
   */
  static getAvailableStrategies(platform: string): string[] {
    const config = ConfigLoader.getInstance().loadConfig(platform);
    return config.strategies.map((s: StrategyConfig) => s.id);
  }

  /**
   * 기본 전략 ID 반환
   * @param platform 플랫폼 이름
   * @returns 기본 전략 ID (priority가 가장 낮은 것)
   */
  static getDefaultStrategyId(platform: string): string {
    const config = ConfigLoader.getInstance().loadConfig(platform);
    const sortedStrategies = [...config.strategies].sort(
      (a, b) => a.priority - b.priority,
    );
    return sortedStrategies[0].id;
  }
}

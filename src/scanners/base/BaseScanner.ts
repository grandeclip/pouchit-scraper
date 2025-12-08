/**
 * 기본 스캐너 추상 클래스
 * Template Method Pattern
 *
 * 역할:
 * - 공통 스캔 흐름 정의
 * - 하위 클래스에서 특정 단계 오버라이드 가능
 *
 * SOLID 원칙:
 * - SRP: 스캔 흐름 관리만 담당
 * - OCP: 확장에 열려있고 수정에 닫혀있음
 * - LSP: 모든 하위 클래스는 이 클래스로 대체 가능
 *
 * @template T - 플랫폼별 Product 타입
 */

import type { IScanner } from "@/core/interfaces/IScanner";
import type { IProduct } from "@/core/interfaces/IProduct";
import type { HwahaeConfig } from "@/core/domain/HwahaeConfig";
import type { StrategyConfig } from "@/core/domain/StrategyConfig";
import { logger } from "@/config/logger";

/**
 * 기본 스캐너 (Template Method Pattern)
 */
export abstract class BaseScanner<T extends IProduct> implements IScanner<T> {
  protected initialized: boolean = false;

  constructor(
    protected readonly config: HwahaeConfig,
    protected readonly strategy: StrategyConfig,
  ) {}

  /**
   * 전략 ID 반환
   */
  getStrategyId(): string {
    return this.strategy.id;
  }

  /**
   * 상품 스캔 (Template Method)
   *
   * 동시성 안전성:
   * - finally 블록에서 반드시 리소스 정리
   * - 에러 발생 시에도 cleanup() 호출 보장
   */
  async scan(productId: string): Promise<T> {
    try {
      return await this.scanWithoutCleanup(productId);
    } finally {
      // 반드시 리소스 정리 (에러 발생 여부와 무관)
      try {
        await this.cleanup();
      } catch (cleanupError) {
        logger.warn(
          { strategy: this.strategy.id, error: cleanupError },
          "cleanup 실패",
        );
      }
    }
  }

  /**
   * 상품 스캔 (cleanup 없이)
   *
   * 용도:
   * - ValidationNode처럼 여러 상품을 연속 스캔할 때
   * - 호출자가 Scanner 생명주기를 직접 관리할 때
   *
   * 주의:
   * - 사용 후 반드시 cleanup() 호출 필요
   * - 메모리 누수 방지를 위해 호출자 책임
   */
  async scanWithoutCleanup(productId: string): Promise<T> {
    const startTime = Date.now();

    try {
      logger.debug({ strategy: this.strategy.id, productId }, "스캔 시작");

      // 1. 초기화
      await this.ensureInitialized();

      // 2. 전처리
      await this.beforeScan(productId);

      // 3. 데이터 추출
      const rawData = await this.extractData(productId);

      // 4. 데이터 파싱
      const product = await this.parseData(rawData);

      // 5. 후처리
      await this.afterScan(product);

      const duration = Date.now() - startTime;
      logger.info(
        {
          strategy: this.strategy.id,
          productName: product.productName,
          duration,
        },
        "스캔 완료",
      );

      return product;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        { strategy: this.strategy.id, duration, error },
        "스캔 실패",
      );
      throw error;
    }
  }

  /**
   * 초기화 (기본 구현)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.debug({ strategy: this.strategy.id }, "초기화 중");
    await this.doInitialize();
    this.initialized = true;
    logger.debug({ strategy: this.strategy.id }, "초기화 완료");
  }

  /**
   * 초기화 보장
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 전처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async beforeScan(productId: string): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 후처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async afterScan(product: T): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 실제 초기화 로직 (하위 클래스에서 구현)
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * 데이터 추출 (하위 클래스에서 구현)
   */
  protected abstract extractData(productId: string): Promise<any>;

  /**
   * 데이터 파싱 (하위 클래스에서 구현)
   */
  protected abstract parseData(rawData: any): Promise<T>;

  /**
   * 리소스 정리 (하위 클래스에서 구현)
   */
  abstract cleanup(): Promise<void>;
}

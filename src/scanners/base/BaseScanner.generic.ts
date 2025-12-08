/**
 * 기본 스캐너 추상 클래스 (제네릭)
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
 * - DIP: 추상화(IProduct, PlatformConfig)에 의존
 *
 * @template TRawData 원시 데이터 타입 (API 응답 또는 DOM 데이터)
 * @template TProduct 최종 Product 타입 (IProduct 구현체)
 * @template TConfig Platform Config 타입
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import { IProduct } from "@/core/interfaces/IProduct";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import { StrategyConfig } from "@/core/domain/StrategyConfig";
import { logger } from "@/config/logger";

/**
 * 기본 스캐너 (Template Method Pattern)
 */
export abstract class BaseScanner<
  TRawData,
  TProduct extends IProduct,
  TConfig extends PlatformConfig = PlatformConfig,
> implements IScanner<TProduct> {
  protected initialized: boolean = false;

  constructor(
    protected readonly config: TConfig,
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
  async scan(id: string): Promise<TProduct> {
    const startTime = Date.now();

    try {
      logger.debug(
        { strategyId: this.strategy.id, productId: id },
        "스캔 시작",
      );

      // 1. 초기화
      await this.ensureInitialized();

      // 2. 전처리
      await this.beforeScan(id);

      // 3. 데이터 추출
      const rawData = await this.extractData(id);

      // 4. 데이터 파싱
      const product = await this.parseData(rawData);

      // 5. 후처리
      await this.afterScan(product);

      const duration = Date.now() - startTime;
      logger.debug(
        {
          strategyId: this.strategy.id,
          productName: product.productName,
          durationMs: duration,
        },
        "스캔 완료",
      );

      return product;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          strategyId: this.strategy.id,
          durationMs: duration,
          error: error instanceof Error ? error.message : String(error),
        },
        "스캔 실패",
      );
      throw error;
    } finally {
      // 반드시 리소스 정리 (에러 발생 여부와 무관)
      try {
        await this.cleanup();
      } catch (cleanupError) {
        logger.warn(
          {
            strategyId: this.strategy.id,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          },
          "cleanup 실패",
        );
      }
    }
  }

  /**
   * 초기화 (기본 구현)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.debug({ strategyId: this.strategy.id }, "초기화 중...");
    await this.doInitialize();
    this.initialized = true;
    logger.debug({ strategyId: this.strategy.id }, "초기화 완료");
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
  protected async beforeScan(id: string): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 후처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async afterScan(product: TProduct): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 실제 초기화 로직 (하위 클래스에서 구현)
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * 데이터 추출 (하위 클래스에서 구현)
   */
  protected abstract extractData(id: string): Promise<TRawData>;

  /**
   * 데이터 파싱 (하위 클래스에서 구현)
   */
  protected abstract parseData(rawData: TRawData): Promise<TProduct>;

  /**
   * 리소스 정리 (하위 클래스에서 구현)
   */
  abstract cleanup(): Promise<void>;
}

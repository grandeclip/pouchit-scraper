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
 */

import { IScanner } from "@/core/interfaces/IScanner";
import { HwahaeProduct } from "@/core/domain/HwahaeProduct";
import { HwahaeConfig } from "@/core/domain/HwahaeConfig";
import { StrategyConfig } from "@/core/domain/StrategyConfig";

/**
 * 기본 스캐너 (Template Method Pattern)
 */
export abstract class BaseScanner implements IScanner {
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
  async scan(goodsId: string): Promise<HwahaeProduct> {
    const startTime = Date.now();

    try {
      console.log(`[${this.strategy.id}] 스캔 시작: goodsId=${goodsId}`);

      // 1. 초기화
      await this.ensureInitialized();

      // 2. 전처리
      await this.beforeScan(goodsId);

      // 3. 데이터 추출
      const rawData = await this.extractData(goodsId);

      // 4. 데이터 파싱
      const product = await this.parseData(rawData);

      // 5. 후처리
      await this.afterScan(product);

      const duration = Date.now() - startTime;
      console.log(
        `[${this.strategy.id}] 스캔 완료: ${product.productName} (${duration}ms)`,
      );

      return product;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.strategy.id}] 스캔 실패 (${duration}ms):`, error);
      throw error;
    } finally {
      // 반드시 리소스 정리 (에러 발생 여부와 무관)
      try {
        await this.cleanup();
      } catch (cleanupError) {
        console.warn(`[${this.strategy.id}] cleanup 실패:`, cleanupError);
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

    console.log(`[${this.strategy.id}] 초기화 중...`);
    await this.doInitialize();
    this.initialized = true;
    console.log(`[${this.strategy.id}] 초기화 완료`);
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
  protected async beforeScan(goodsId: string): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 후처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async afterScan(product: HwahaeProduct): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 실제 초기화 로직 (하위 클래스에서 구현)
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * 데이터 추출 (하위 클래스에서 구현)
   */
  protected abstract extractData(goodsId: string): Promise<any>;

  /**
   * 데이터 파싱 (하위 클래스에서 구현)
   */
  protected abstract parseData(rawData: any): Promise<HwahaeProduct>;

  /**
   * 리소스 정리 (하위 클래스에서 구현)
   */
  abstract cleanup(): Promise<void>;
}

/**
 * API 스캐너 (플랫폼 독립 전략)
 * HTTP API 기반 상품 정보 스캔
 *
 * Strategy Pattern 구현체 - API 전략
 * BaseScanner의 Template Method 패턴을 따름
 *
 * SOLID 원칙:
 * - SRP: HTTP API 호출만 담당
 * - LSP: BaseScanner를 대체 가능
 * - DIP: 추상화에 의존 (IProduct, PlatformConfig)
 *
 * @template TApiResponse API 응답 타입
 * @template TProduct Product 타입 (IProduct 구현체)
 * @template TConfig Platform Config 타입
 */

import { BaseScanner } from "@/scanners/base/BaseScanner.generic";
import { IProduct } from "@/core/interfaces/IProduct";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import {
  HttpStrategyConfig,
  StrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isHttpStrategy } from "@/core/domain/StrategyConfig.guards";
import { SCRAPER_CONFIG } from "@/config/constants";

/**
 * API 스캐너 옵션
 */
export interface ApiScannerOptions<
  TApiResponse,
  TProduct extends IProduct,
  TConfig extends PlatformConfig,
> {
  /** Platform 설정 */
  config: TConfig;
  /** HTTP 전략 설정 */
  strategy: HttpStrategyConfig;
  /** URL 빌드 함수 */
  buildUrl: (config: TConfig, id: string) => string;
  /** API 응답 → Product 변환 함수 */
  parseResponse: (response: TApiResponse, id: string) => Promise<TProduct>;
}

/**
 * API 스캐너
 */
export class ApiScanner<
  TApiResponse,
  TProduct extends IProduct,
  TConfig extends PlatformConfig = PlatformConfig,
> extends BaseScanner<TApiResponse, TProduct, TConfig> {
  private buildUrl: (config: TConfig, id: string) => string;
  private parseResponse: (
    response: TApiResponse,
    id: string,
  ) => Promise<TProduct>;
  private lastScanId: string = "";

  constructor(options: ApiScannerOptions<TApiResponse, TProduct, TConfig>) {
    super(options.config, options.strategy);
    this.buildUrl = options.buildUrl;
    this.parseResponse = options.parseResponse;
  }

  /**
   * HTTP 전략 설정 반환 (Type Guard)
   *
   * @throws {Error} HTTP 전략이 아닌 경우
   */
  private get httpStrategy(): HttpStrategyConfig {
    if (!isHttpStrategy(this.strategy)) {
      throw new Error(
        `HTTP 전략이 필요하지만 다른 타입입니다: ${this.strategy.type}`,
      );
    }
    return this.strategy;
  }

  /**
   * 초기화 (HTTP는 별도 초기화 불필요)
   */
  protected async doInitialize(): Promise<void> {
    // HTTP는 브라우저 등 리소스가 필요 없으므로 초기화 작업 없음
  }

  /**
   * 데이터 추출 (HTTP API 호출)
   */
  protected async extractData(id: string): Promise<TApiResponse> {
    // Rate limiting 방지: requestDelay 설정이 있으면 대기
    if (this.httpStrategy.http.requestDelay) {
      await this.sleep(this.httpStrategy.http.requestDelay);
    }

    const url = this.buildUrl(this.config, id);
    return await this.fetchWithRetry(url);
  }

  /**
   * 데이터 파싱 (API 응답 → 도메인 모델)
   */
  protected async parseData(rawData: TApiResponse): Promise<TProduct> {
    // 플랫폼별 파싱 로직은 외부에서 주입받음
    return await this.parseResponse(rawData, this.lastScanId);
  }

  /**
   * 전처리: ID 저장
   */
  protected async beforeScan(id: string): Promise<void> {
    this.lastScanId = id;
  }

  /**
   * 리소스 정리 (HTTP는 정리할 리소스 없음)
   */
  async cleanup(): Promise<void> {
    // HTTP는 브라우저 등 리소스가 없으므로 정리 작업 없음
  }

  /**
   * Retry 로직이 포함된 fetch
   */
  private async fetchWithRetry(
    url: string,
    attempt: number = 1,
  ): Promise<TApiResponse> {
    try {
      const response = await fetch(url, {
        method: this.httpStrategy.http.method,
        headers: this.httpStrategy.http.headers,
        signal: AbortSignal.timeout(this.httpStrategy.http.timeout),
      });

      // 성공
      if (response.ok) {
        return (await response.json()) as TApiResponse;
      }

      // 404 Not Found
      if (response.status === 404) {
        throw new Error(
          `상품을 찾을 수 없음 (삭제되었거나 존재하지 않음) - strategy: ${this.strategy.id}, url: ${url}`,
        );
      }

      // 429 Rate Limiting
      if (response.status === 429) {
        if (attempt < this.httpStrategy.http.retryCount) {
          const rateLimitDelay =
            "errorHandling" in this.config &&
            this.config.errorHandling &&
            typeof this.config.errorHandling === "object" &&
            "rateLimitDelay" in this.config.errorHandling
              ? (this.config.errorHandling.rateLimitDelay as number)
              : SCRAPER_CONFIG.RATE_LIMIT_DELAY_MS;
          await this.sleep(rateLimitDelay);
          return this.fetchWithRetry(url, attempt + 1);
        }
        throw new Error(
          `Rate limit 초과 - strategy: ${this.strategy.id}, url: ${url}, 최대 재시도: ${this.httpStrategy.http.retryCount}`,
        );
      }

      // 500 Server Error
      if (response.status >= 500) {
        const serverErrorRetry =
          "errorHandling" in this.config &&
          this.config.errorHandling &&
          typeof this.config.errorHandling === "object" &&
          "serverErrorRetry" in this.config.errorHandling
            ? (this.config.errorHandling.serverErrorRetry as boolean)
            : true;

        if (serverErrorRetry && attempt < this.httpStrategy.http.retryCount) {
          await this.sleep(this.httpStrategy.http.retryDelay);
          return this.fetchWithRetry(url, attempt + 1);
        }
        throw new Error(
          `서버 에러: ${response.status} - strategy: ${this.strategy.id}, url: ${url}, 최대 재시도: ${this.httpStrategy.http.retryCount}`,
        );
      }

      // 기타 에러
      throw new Error(
        `HTTP ${response.status}: ${response.statusText} - strategy: ${this.strategy.id}, url: ${url}`,
      );
    } catch (error) {
      if (error instanceof Error) {
        // Timeout
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          if (attempt < this.httpStrategy.http.retryCount) {
            await this.sleep(this.httpStrategy.http.retryDelay);
            return this.fetchWithRetry(url, attempt + 1);
          }
          throw new Error(
            `요청 시간 초과 - strategy: ${this.strategy.id}, url: ${url}, timeout: ${this.httpStrategy.http.timeout}ms`,
          );
        }
        throw error;
      }
      throw new Error(
        `알 수 없는 에러 발생 - strategy: ${this.strategy.id}, url: ${url}`,
      );
    }
  }

  /**
   * Sleep 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * HTTP 스캐너
 * HTTP API 기반 상품 정보 스캔
 *
 * Strategy Pattern 구현체 - API 전략
 * BaseScanner의 Template Method 패턴을 따름
 *
 * SOLID 원칙:
 * - SRP: HTTP API 호출만 담당
 * - LSP: BaseScanner를 대체 가능
 * - DIP: 설정에 의존
 */

import { BaseScanner } from "@/scanners/base/BaseScanner";
import { HwahaeConfig } from "@/core/domain/HwahaeConfig";
import { HttpStrategyConfig } from "@/core/domain/StrategyConfig";
import { HwahaeProduct, HwahaeApiResponse } from "@/core/domain/HwahaeProduct";

/**
 * HTTP 스캐너
 */
export class HttpScanner extends BaseScanner {
  constructor(config: HwahaeConfig, strategy: HttpStrategyConfig) {
    super(config, strategy);
  }

  /**
   * HTTP 전략 설정 반환 (타입 캐스팅)
   */
  private get httpStrategy(): HttpStrategyConfig {
    return this.strategy as HttpStrategyConfig;
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
  protected async extractData(goodsId: string): Promise<HwahaeApiResponse> {
    // Rate limiting 방지: requestDelay 설정이 있으면 대기
    if (this.httpStrategy.http.requestDelay) {
      await this.sleep(this.httpStrategy.http.requestDelay);
    }

    const url = this.buildUrl(goodsId);
    return await this.fetchWithRetry(url);
  }

  /**
   * 데이터 파싱 (API 응답 → 도메인 모델)
   */
  protected async parseData(
    rawData: HwahaeApiResponse,
  ): Promise<HwahaeProduct> {
    return HwahaeProduct.fromApiResponse(rawData);
  }

  /**
   * 리소스 정리 (HTTP는 정리할 리소스 없음)
   */
  async cleanup(): Promise<void> {
    // HTTP는 브라우저 등 리소스가 없으므로 정리 작업 없음
  }

  /**
   * URL 빌드
   */
  private buildUrl(goodsId: string): string {
    const template = this.config.endpoints.goodsDetail;
    return template
      .replace("${baseUrl}", this.config.baseUrl)
      .replace("${apiVersion}", this.config.apiVersion)
      .replace("${goodsId}", goodsId);
  }

  /**
   * Retry 로직이 포함된 fetch
   */
  private async fetchWithRetry(
    url: string,
    attempt: number = 1,
  ): Promise<HwahaeApiResponse> {
    try {
      const response = await fetch(url, {
        method: this.httpStrategy.http.method,
        headers: this.httpStrategy.http.headers,
        signal: AbortSignal.timeout(this.httpStrategy.http.timeout),
      });

      // 성공
      if (response.ok) {
        return (await response.json()) as HwahaeApiResponse;
      }

      // 404 Not Found
      if (response.status === 404) {
        throw new Error("Product not found (deleted or unavailable)");
      }

      // 429 Rate Limiting
      if (response.status === 429) {
        if (attempt < this.httpStrategy.http.retryCount) {
          await this.sleep(this.config.errorHandling.rateLimitDelay);
          return this.fetchWithRetry(url, attempt + 1);
        }
        throw new Error("Rate limit exceeded");
      }

      // 500 Server Error
      if (response.status >= 500) {
        if (
          this.config.errorHandling.serverErrorRetry &&
          attempt < this.httpStrategy.http.retryCount
        ) {
          await this.sleep(this.httpStrategy.http.retryDelay);
          return this.fetchWithRetry(url, attempt + 1);
        }
        throw new Error(`Server error: ${response.status}`);
      }

      // 기타 에러
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      if (error instanceof Error) {
        // Timeout
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          if (attempt < this.httpStrategy.http.retryCount) {
            await this.sleep(this.httpStrategy.http.retryDelay);
            return this.fetchWithRetry(url, attempt + 1);
          }
          throw new Error("Request timeout");
        }
        throw error;
      }
      throw new Error("Unknown error occurred");
    }
  }

  /**
   * Sleep 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

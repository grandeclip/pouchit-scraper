/**
 * 무신사 HTTP 스캐너
 * HTTP API 기반 상품 정보 스캔
 *
 * Strategy Pattern 구현체 - HTTP API 전략
 * BaseScanner의 Template Method 패턴을 따름
 *
 * SOLID 원칙:
 * - SRP: HTTP API 호출만 담당
 * - LSP: BaseScanner를 대체 가능
 * - DIP: 설정에 의존
 */

import { BaseScanner } from "@/scanners/base/BaseScanner.generic";
import { PlatformConfig } from "@/core/domain/PlatformConfig";
import { HttpStrategyConfig } from "@/core/domain/StrategyConfig";
import { MusinsaProduct } from "@/core/domain/MusinsaProduct";

/**
 * 무신사 API 응답 타입
 */
export interface MusinsaApiResponse {
  meta: {
    result: string;
    errorCode: string;
    message: string;
  };
  data: {
    goodsNo: number;
    goodsNm: string;
    thumbnailImageUrl: string;
    goodsSaleType: "SALE" | "SOLDOUT" | "STOP_SALE";
    goodsPrice: {
      normalPrice: number;
      salePrice: number;
    };
  };
}

/**
 * 무신사 HTTP 스캐너
 */
export class MusinsaHttpScanner extends BaseScanner<
  MusinsaApiResponse,
  MusinsaProduct,
  PlatformConfig
> {
  constructor(config: PlatformConfig, strategy: HttpStrategyConfig) {
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
  protected async extractData(goodsNo: string): Promise<MusinsaApiResponse> {
    // Rate limiting 방지: requestDelay 설정이 있으면 대기
    if (this.httpStrategy.http.requestDelay) {
      await this.sleep(this.httpStrategy.http.requestDelay);
    }

    const url = this.buildUrl(goodsNo);
    return await this.fetchWithRetry(url);
  }

  /**
   * 데이터 파싱 (API 응답 → 도메인 모델)
   */
  protected async parseData(
    rawData: MusinsaApiResponse,
  ): Promise<MusinsaProduct> {
    // 에러 확인
    if (rawData.meta?.errorCode || !rawData.data) {
      throw new Error(
        `Musinsa API error: ${rawData.meta?.message || "Unknown error"}`,
      );
    }

    const { data } = rawData;

    // 판매 상태 매핑 (YAML fieldMapping.saleStatus.mapping 필수)
    const saleStatusMapping = this.config.fieldMapping?.saleStatus?.mapping;
    if (!saleStatusMapping) {
      throw new Error(
        "Missing required config: fieldMapping.saleStatus.mapping",
      );
    }

    // 썸네일 prefix (YAML fieldMapping.thumbnail.prefix 필수)
    const imagePrefix = this.config.fieldMapping?.thumbnail?.prefix;
    if (!imagePrefix) {
      throw new Error("Missing required config: fieldMapping.thumbnail.prefix");
    }

    // 판매 상태 결정
    const saleStatus =
      saleStatusMapping[data.goodsSaleType] ||
      saleStatusMapping["STOP_SALE"] ||
      "off_sale";

    return MusinsaProduct.fromApiResponse({
      id: String(data.goodsNo),
      productNo: String(data.goodsNo),
      productName: data.goodsNm,
      thumbnail: `${imagePrefix}${data.thumbnailImageUrl}`,
      originalPrice: data.goodsPrice.normalPrice,
      discountedPrice: data.goodsPrice.salePrice,
      saleStatus,
    });
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
  private buildUrl(goodsNo: string): string {
    const template = this.config.endpoints.goodsDetail;
    return template
      .replace("${baseUrl}", this.config.baseUrl)
      .replace("${goodsId}", goodsNo)
      .replace("${goodsNo}", goodsNo);
  }

  /**
   * Retry 로직이 포함된 fetch
   */
  private async fetchWithRetry(
    url: string,
    attempt: number = 1,
  ): Promise<MusinsaApiResponse> {
    try {
      const response = await fetch(url, {
        method: this.httpStrategy.http.method,
        headers: this.httpStrategy.http.headers,
        signal: AbortSignal.timeout(this.httpStrategy.http.timeout),
      });

      // 성공
      if (response.ok) {
        return (await response.json()) as MusinsaApiResponse;
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

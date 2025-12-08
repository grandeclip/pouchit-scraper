/**
 * ApiPlatformScanner
 *
 * HTTP/GraphQL API 기반 플랫폼 스캐너
 *
 * SOLID 원칙:
 * - SRP: API 기반 스캔만 담당
 * - LSP: BasePlatformScanner 대체 가능
 * - DIP: ScannerRegistry 인터페이스에 의존
 *
 * 특징:
 * - 기존 ScannerRegistry 재사용 (hwahae, musinsa, zigzag)
 * - 브라우저 없이 HTTP 요청으로 데이터 조회
 * - 단순 변환 로직 (플랫폼별 복잡한 NOT_FOUND 로직 불필요)
 *
 * 지원 플랫폼:
 * - hwahae: HTTP API
 * - musinsa: HTTP API
 * - zigzag: GraphQL API
 */

import type { Page } from "playwright";
import { BasePlatformScanner } from "../BasePlatformScanner";
import type { PlatformScanResult } from "../IPlatformScanner";
import { ScannerRegistry } from "@/services/ScannerRegistry";
import { logger } from "@/config/logger";

/**
 * ApiPlatformScanner
 *
 * HTTP/GraphQL API를 사용하는 플랫폼 공통 스캐너
 * ScannerRegistry의 기존 스캐너 인스턴스 재사용
 */
export class ApiPlatformScanner extends BasePlatformScanner {
  readonly scanMethod = "api" as const;

  /** ScannerRegistry 싱글톤 */
  private readonly scannerRegistry = ScannerRegistry.getInstance();

  /**
   * 생성자
   *
   * @param platform 플랫폼 식별자 (hwahae, musinsa, zigzag)
   * @param strategyId 전략 ID (api, graphql 등)
   */
  constructor(
    readonly platform: string,
    private readonly strategyId?: string,
  ) {
    super();
  }

  /**
   * 상품 스캔 실행
   *
   * ScannerRegistry의 기존 스캐너 사용:
   * 1. URL에서 상품 ID 추출
   * 2. ScannerRegistry에서 스캐너 조회
   * 3. 스캐너 scan() 호출
   * 4. 결과 변환
   *
   * @param url 상품 URL
   * @param page Playwright Page (API 방식에서는 미사용)
   * @returns 스캔 결과
   */
  async scan(url: string, page?: Page): Promise<PlatformScanResult> {
    // 상품 ID 추출
    const productId = this.extractProductId(url);
    if (!productId) {
      return this.createFailedResult(
        `Failed to extract product ID from URL: ${url}`,
      );
    }

    logger.debug(
      { platform: this.platform, productId, strategyId: this.strategyId },
      "ApiPlatformScanner.scan() 시작",
    );

    try {
      // ScannerRegistry에서 스캐너 조회
      const scanner = this.scannerRegistry.getScanner(
        this.platform,
        this.strategyId,
      );

      // 스캔 실행
      const result = await scanner.scan(productId);

      // 결과가 없으면 NOT_FOUND
      if (!result) {
        return {
          success: false,
          error: `${this.platform} 상품 정보 없음`,
          isNotFound: true,
          source: "api",
        };
      }

      // 성공 결과 변환
      return this.transformApiResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { platform: this.platform, productId, error: message },
        "ApiPlatformScanner.scan() 실패",
      );
      return this.createFailedResult(message);
    }
  }

  /**
   * API 스캔 결과 변환
   *
   * IScanner.scan() 결과를 PlatformScanResult로 변환
   *
   * @param result 스캐너 결과
   * @returns 정규화된 스캔 결과
   */
  private transformApiResult(result: any): PlatformScanResult {
    // 결과 구조 파악 (플랫폼별 차이 있음)
    // 공통적으로 product_name, thumbnail, price 등 포함

    // 플랫폼별 필드명 매핑
    const productName =
      result.productName || result.product_name || result.name || "";
    const thumbnail =
      result.thumbnail || result.imageUrl || result.title_images?.[0] || "";
    const originalPrice =
      result.originalPrice ||
      result.consumer_price ||
      result.listPrice ||
      result.price ||
      0;
    const discountedPrice =
      result.discountedPrice || result.price || result.salePrice || 0;
    const saleStatus =
      result.saleStatus || result.sale_status || result.status || "on_sale";

    return {
      success: true,
      data: {
        product_name: productName,
        thumbnail: thumbnail,
        original_price: Number(originalPrice) || 0,
        discounted_price: Number(discountedPrice) || 0,
        sale_status: this.normalizeSaleStatus(saleStatus),
      },
      source: "api",
      isNotFound: false,
    };
  }

  /**
   * IPlatformScanner.isNotFound 구현
   *
   * API 방식은 결과가 없으면 에러가 발생하므로
   * isNotFound 플래그로 판별
   */
  isNotFound(result: PlatformScanResult): boolean {
    return result.isNotFound === true;
  }
}

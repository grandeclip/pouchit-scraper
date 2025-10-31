/**
 * Oliveyoung Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 올리브영 검증 및 비교만 담당
 * - DIP: OliveyoungScanService에 의존
 * - Strategy Pattern: INodeStrategy 구현
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { ConfigLoader } from "@/config/ConfigLoader";
import type { PlatformConfig } from "@/core/domain/PlatformConfig";
import type { IScanner } from "@/core/interfaces/IScanner";
import { ScannerRegistry } from "@/services/ScannerRegistry";
import { logger } from "@/config/logger";

/**
 * 단일 상품 검증 결과
 */
interface ProductValidationResult {
  product_set_id: string;
  product_id: string;
  db: {
    product_name: string | null;
    thumbnail?: string | null;
    original_price?: number | null;
    discounted_price?: number | null;
    sale_status?: string | null;
  };
  fetch: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  } | null;
  comparison: {
    product_name: boolean;
    thumbnail: boolean;
    original_price: boolean;
    discounted_price: boolean;
    sale_status: boolean;
  };
  match: boolean;
  status: "success" | "failed" | "not_found";
  error?: string;
  validated_at: string;
}

/**
 * Oliveyoung Validation Node Strategy
 */
export class OliveyoungValidationNode implements INodeStrategy {
  public readonly type = "oliveyoung_validation";
  private configLoader: ConfigLoader;
  private registry: ScannerRegistry;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.registry = ScannerRegistry.getInstance();
  }

  /**
   * 노드 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { input, params } = context;

    // Platform ID 추출 (params 우선, 없으면 "oliveyoung")
    const platform = (params.platform as string) || "oliveyoung";

    // 이전 노드(SupabaseSearchNode)의 결과 가져오기
    const supabaseResult = input.supabase_search as
      | { products: ProductSetSearchResult[]; count: number }
      | undefined;

    if (!supabaseResult || !supabaseResult.products) {
      return {
        success: false,
        data: {},
        error: {
          message: "No products found from previous node",
          code: "MISSING_INPUT_DATA",
        },
      };
    }

    const products = supabaseResult.products;
    logger.info({ type: this.type, count: products.length }, "검증 시작");

    // Scanner 획득 (Registry에서 가져오거나 생성)
    const scanner: IScanner = this.registry.getScanner(platform);

    try {
      // Platform Config에서 설정 로드
      const config: PlatformConfig = this.configLoader.loadConfig(
        platform,
      ) as PlatformConfig;
      const waitTimeMs = config.workflow?.rate_limit?.wait_time_ms || 3000;
      const maxConcurrency = config.workflow?.concurrency?.max || 10;

      // 순차 검증 (MVP) - Rate Limiting 적용
      const validations: ProductValidationResult[] = [];

      for (let i = 0; i < products.length; i++) {
        const product = products[i];

        // Rate Limiting: 첫 번째 요청이 아니면 대기
        if (i > 0) {
          logger.debug(
            { type: this.type, waitTimeMs },
            "Rate limiting 대기 중",
          );
          await this.sleep(waitTimeMs);
        }

        // 개별 에러 격리
        try {
          const validation = await this.validateProduct(product, scanner);
          validations.push(validation);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(
            {
              type: this.type,
              productSetId: product.product_set_id,
              error: message,
            },
            "상품 검증 실패",
          );
          validations.push(this.createFailedValidation(product, message));
        }
      }

      // 요약 통계 계산
      const summary = this.calculateSummary(validations);

      logger.info({ type: this.type, summary }, "검증 완료");

      return {
        success: true,
        data: {
          oliveyoung_validation: {
            validations,
            summary,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ type: this.type, error: message }, "검증 실패");

      return {
        success: false,
        data: {},
        error: {
          message,
          code: "OLIVEYOUNG_VALIDATION_ERROR",
        },
      };
    } finally {
      // Scanner 리소스 정리 (브라우저 종료)
      try {
        await scanner.cleanup();
        logger.debug({ type: this.type }, "Scanner cleanup 완료");
      } catch (cleanupError) {
        logger.warn(
          { type: this.type, error: cleanupError },
          "Scanner cleanup 실패",
        );
      }
    }
  }

  /**
   * 단일 상품 검증
   */
  private async validateProduct(
    product: ProductSetSearchResult,
    scanner: IScanner,
  ): Promise<ProductValidationResult> {
    try {
      // link_url에서 goodsNo 추출
      if (!product.link_url) {
        return this.createFailedValidation(product, "link_url is null");
      }

      const goodsNo = this.extractGoodsNo(product.link_url);

      if (!goodsNo) {
        return this.createFailedValidation(
          product,
          "Failed to extract goodsNo from link_url",
        );
      }

      logger.debug(
        { type: this.type, productSetId: product.product_set_id, goodsNo },
        "상품 검증 중",
      );

      // 올리브영 Playwright로 상품 조회 (cleanup 없이)
      const scannedProduct = await scanner.scanWithoutCleanup(goodsNo);
      const oliveyoungProduct = scannedProduct.toPlainObject();

      // 비교 결과 생성
      return this.compareProducts(product, oliveyoungProduct);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found") || message.includes("삭제된 상품")) {
        return this.createNotFoundValidation(product);
      }

      return this.createFailedValidation(product, message);
    }
  }

  /**
   * goodsNo 추출
   *
   * 지원 패턴:
   * - 정상: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822
   * - Query params: https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000231822&srsltid=...
   *
   * 추출 전략:
   * 1. URL에서 goodsNo query parameter 추출
   */
  private extractGoodsNo(linkUrl: string): string | null {
    // oliveyoung URL인지 확인
    if (!linkUrl.includes("oliveyoung.co.kr")) {
      return null;
    }

    try {
      const url = new URL(linkUrl);
      return url.searchParams.get("goodsNo");
    } catch {
      return null;
    }
  }

  /**
   * 상품 비교
   */
  private compareProducts(
    supabase: ProductSetSearchResult,
    oliveyoung: {
      productName: string;
      thumbnail: string;
      originalPrice: number;
      discountedPrice: number;
      saleStatus: string;
    },
  ): ProductValidationResult {
    const comparison = {
      product_name: supabase.product_name === oliveyoung.productName,
      thumbnail: supabase.thumbnail === oliveyoung.thumbnail,
      original_price: supabase.original_price === oliveyoung.originalPrice,
      discounted_price:
        supabase.discounted_price === oliveyoung.discountedPrice,
      sale_status: supabase.sale_status === oliveyoung.saleStatus,
    };

    // 모든 필드가 true인지 확인
    const match = Object.values(comparison).every((value) => value === true);

    return {
      product_set_id: supabase.product_set_id,
      product_id: supabase.product_id,
      db: {
        product_name: supabase.product_name,
        thumbnail: supabase.thumbnail,
        original_price: supabase.original_price,
        discounted_price: supabase.discounted_price,
        sale_status: supabase.sale_status,
      },
      fetch: {
        product_name: oliveyoung.productName,
        thumbnail: oliveyoung.thumbnail,
        original_price: oliveyoung.originalPrice,
        discounted_price: oliveyoung.discountedPrice,
        sale_status: oliveyoung.saleStatus,
      },
      comparison,
      match,
      status: "success",
      validated_at: getTimestampWithTimezone(),
    };
  }

  /**
   * 실패 검증 결과 생성
   */
  private createFailedValidation(
    product: ProductSetSearchResult,
    errorMessage: string,
  ): ProductValidationResult {
    return {
      product_set_id: product.product_set_id,
      product_id: product.product_id,
      db: {
        product_name: product.product_name,
        thumbnail: product.thumbnail,
        original_price: product.original_price,
        discounted_price: product.discounted_price,
        sale_status: product.sale_status,
      },
      fetch: null,
      comparison: {
        product_name: false,
        thumbnail: false,
        original_price: false,
        discounted_price: false,
        sale_status: false,
      },
      match: false,
      status: "failed",
      error: errorMessage,
      validated_at: getTimestampWithTimezone(),
    };
  }

  /**
   * Not Found 검증 결과 생성
   */
  private createNotFoundValidation(
    product: ProductSetSearchResult,
  ): ProductValidationResult {
    return {
      ...this.createFailedValidation(
        product,
        "Product not found in Oliveyoung",
      ),
      status: "not_found",
    };
  }

  /**
   * 요약 통계 계산
   */
  private calculateSummary(validations: ProductValidationResult[]) {
    const total = validations.length;
    const success = validations.filter((v) => v.status === "success").length;
    const failed = validations.filter((v) => v.status === "failed").length;
    const notFound = validations.filter((v) => v.status === "not_found").length;

    // 매칭된 상품 수 계산 (모든 필드가 true인 상품)
    const totalMatched = validations.filter((v) => v.match === true).length;

    // 매칭률 계산 (전체 상품 중 완전히 일치하는 상품 비율)
    const matchRate = total > 0 ? (totalMatched / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      not_found: notFound,
      total_matched: totalMatched,
      match_rate: Math.round(matchRate * 100) / 100,
    };
  }

  /**
   * Sleep 유틸리티 (Rate Limiting용)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Config 검증
   */
  validateConfig(config: Record<string, unknown>): void {
    if (
      config.strategy_id !== undefined &&
      typeof config.strategy_id !== "string"
    ) {
      throw new Error("strategy_id must be a string");
    }

    if (config.concurrency !== undefined) {
      const concurrency = config.concurrency as number;
      if (typeof concurrency !== "number" || concurrency <= 0) {
        throw new Error("concurrency must be a positive number");
      }
    }

    if (config.timeout_ms !== undefined) {
      const timeoutMs = config.timeout_ms as number;
      if (typeof timeoutMs !== "number" || timeoutMs <= 0) {
        throw new Error("timeout_ms must be a positive number");
      }
    }
  }
}

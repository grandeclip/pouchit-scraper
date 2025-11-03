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
import { ScannerFactory } from "@/scanners/base/ScannerFactory";
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
  private static readonly DEFAULT_MAX_CONCURRENCY = 10;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * 노드 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { input, params, config } = context;

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

    // Platform Config에서 설정 로드
    const platformConfig: PlatformConfig = this.configLoader.loadConfig(
      platform,
    ) as PlatformConfig;
    const waitTimeMs =
      platformConfig.workflow?.rate_limit?.wait_time_ms || 3000;
    const maxConcurrency =
      platformConfig.workflow?.concurrency?.max ||
      OliveyoungValidationNode.DEFAULT_MAX_CONCURRENCY;

    // Concurrency 설정: config → YAML default → 1 (순차)
    const requestedConcurrency =
      (config.concurrency as number) ||
      platformConfig.workflow?.concurrency?.default ||
      1;
    const concurrency = Math.min(requestedConcurrency, maxConcurrency);

    // Concurrency 제한 경고
    if (requestedConcurrency > maxConcurrency) {
      logger.warn(
        {
          type: this.type,
          requested: requestedConcurrency,
          max: maxConcurrency,
          applied: concurrency,
        },
        "Concurrency 제한 적용됨",
      );
    }

    logger.info(
      { type: this.type, count: products.length, concurrency },
      "병렬 검증 시작",
    );

    try {
      // 배치 분할
      const batches = this.splitIntoBatches(products, concurrency);

      logger.debug(
        {
          type: this.type,
          batchCount: batches.length,
          itemsPerBatch: batches.map((b) => b.length),
        },
        "배치 분할 완료",
      );

      // 병렬 실행: 배치별 독립 Scanner 생성 (Factory 직접 사용)
      const batchResults = await Promise.all(
        batches.map(async (batch, index) => {
          // Scanner 생성 실패 시 에러 격리
          let batchScanner: IScanner;
          try {
            batchScanner = ScannerFactory.createScanner(platform);
            logger.debug(
              { type: this.type, batchIndex: index, batchSize: batch.length },
              "배치 Scanner 생성 완료",
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            logger.error(
              { type: this.type, batchIndex: index, error: message },
              "Scanner 생성 실패",
            );
            return batch.map((p) =>
              this.createFailedValidation(p, "Scanner unavailable"),
            );
          }

          return this.validateBatch(
            batch,
            index,
            batchScanner,
            waitTimeMs,
          ).finally(() => {
            batchScanner.cleanup().catch((error) => {
              logger.warn(
                { type: this.type, batchIndex: index, error },
                "Batch scanner cleanup 실패",
              );
            });
          });
        }),
      );

      // 결과 병합
      const validations = batchResults.flat();
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
    }
  }

  /**
   * 상품 목록을 N개 배치로 분할
   */
  private splitIntoBatches<T>(items: T[], batchCount: number): T[][] {
    if (batchCount <= 0) {
      throw new Error("batchCount must be positive");
    }

    if (batchCount === 1) {
      return [items];
    }

    const batchSize = Math.ceil(items.length / batchCount);
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * 단일 배치 검증 (병렬 실행 단위)
   */
  private async validateBatch(
    products: ProductSetSearchResult[],
    batchIndex: number,
    scanner: IScanner,
    waitTimeMs: number,
  ): Promise<ProductValidationResult[]> {
    const validations: ProductValidationResult[] = [];

    logger.debug(
      { type: this.type, batchIndex, count: products.length },
      "배치 검증 시작",
    );

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      // Rate Limiting: 배치 내부만 적용 (첫 번째 요청 제외)
      if (i > 0) {
        await this.sleep(waitTimeMs);
      }

      // 개별 에러 격리
      try {
        const validation = await this.validateProduct(product, scanner);
        validations.push(validation);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            type: this.type,
            batchIndex,
            productSetId: product.product_set_id,
            error: message,
          },
          "상품 검증 실패",
        );
        validations.push(this.createFailedValidation(product, message));
      }
    }

    logger.info(
      { type: this.type, batchIndex, count: validations.length },
      "배치 검증 완료",
    );

    return validations;
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
      return this.compareProducts(product, {
        productName: oliveyoungProduct.productName as string,
        thumbnail: oliveyoungProduct.thumbnail as string,
        originalPrice: oliveyoungProduct.originalPrice as number,
        discountedPrice: oliveyoungProduct.discountedPrice as number,
        saleStatus: oliveyoungProduct.saleStatus as string,
      });
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

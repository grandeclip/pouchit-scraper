/**
 * Hwahae Validation Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 화해 검증 및 비교만 담당
 * - DIP: HwahaeScanService에 의존
 * - Strategy Pattern: INodeStrategy 구현
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { HwahaeScanService } from "@/services/HwahaeScanService";
import { ProductSetSearchResult } from "@/core/domain/ProductSet";

/**
 * Hwahae Validation Node Config
 */
interface HwahaeValidationConfig {
  strategy_id?: string;
  concurrency?: number;
  timeout_ms?: number;
}

/**
 * 단일 상품 검증 결과
 */
interface ProductValidationResult {
  product_set_id: string;
  supabase_data: {
    product_name: string | null;
    thumbnail?: string | null;
    original_price?: number | null;
    discounted_price?: number | null;
    sale_status?: string | null;
  };
  hwahae_data: {
    product_name: string;
    thumbnail: string;
    original_price: number;
    discounted_price: number;
    sale_status: string;
  } | null;
  comparison: {
    product_name: {
      match: boolean;
      supabase: string | null;
      hwahae: string | null;
    };
    thumbnail: {
      match: boolean;
      supabase?: string | null;
      hwahae: string | null;
    };
    original_price: {
      match: boolean;
      supabase?: number | null;
      hwahae: number | null;
    };
    discounted_price: {
      match: boolean;
      supabase?: number | null;
      hwahae: number | null;
    };
    sale_status: {
      match: boolean;
      supabase?: string | null;
      hwahae: string | null;
    };
  };
  status: "success" | "failed" | "not_found";
  error?: string;
  validated_at: string;
}

/**
 * Hwahae Validation Node Strategy
 */
export class HwahaeValidationNode implements INodeStrategy {
  public readonly type = "hwahae_validation";
  private service: HwahaeScanService;

  constructor(service?: HwahaeScanService) {
    // Dependency Injection
    this.service = service || new HwahaeScanService();
  }

  /**
   * 노드 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { input } = context;

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
    console.log(`[${this.type}] Validating ${products.length} products`);

    try {
      // 순차 검증 (MVP) - Rate Limiting 적용
      const validations: ProductValidationResult[] = [];

      for (let i = 0; i < products.length; i++) {
        const product = products[i];

        // Rate Limiting: 첫 번째 요청이 아니면 1초 대기
        if (i > 0) {
          console.log(
            `[${this.type}] Rate limiting: waiting 1000ms before next request...`,
          );
          await this.sleep(1000);
        }

        const validation = await this.validateProduct(product);
        validations.push(validation);
      }

      // 요약 통계 계산
      const summary = this.calculateSummary(validations);

      console.log(
        `[${this.type}] Validation complete. Success: ${summary.success}, Failed: ${summary.failed}, Not Found: ${summary.not_found}`,
      );

      return {
        success: true,
        data: {
          hwahae_validation: {
            validations,
            summary,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.type}] Validation failed:`, message);

      return {
        success: false,
        data: {},
        error: {
          message,
          code: "HWAHAE_VALIDATION_ERROR",
        },
      };
    }
  }

  /**
   * 단일 상품 검증
   */
  private async validateProduct(
    product: ProductSetSearchResult,
  ): Promise<ProductValidationResult> {
    try {
      // link_url에서 goodsId 추출
      if (!product.link_url) {
        return this.createFailedValidation(product, "link_url is null");
      }

      const goodsId = this.extractGoodsId(product.link_url);

      if (!goodsId) {
        return this.createFailedValidation(
          product,
          "Failed to extract goodsId from link_url",
        );
      }

      console.log(
        `[${this.type}] Validating product ${product.product_set_id} (goodsId: ${goodsId})`,
      );

      // 화해 API로 상품 조회
      const hwahaeProduct = await this.service.scanProduct(goodsId);

      // 비교 결과 생성
      return this.compareProducts(product, hwahaeProduct);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        return this.createNotFoundValidation(product);
      }

      return this.createFailedValidation(product, message);
    }
  }

  /**
   * goodsId 추출
   *
   * 지원 패턴:
   * - https://www.hwahae.co.kr/goods/21320
   * - https://www.hwahae.co.kr/products/12345
   */
  private extractGoodsId(linkUrl: string): string | null {
    // hwahae URL인지 확인
    if (!linkUrl.includes("hwahae.co.kr")) {
      return null;
    }

    // /goods/숫자 또는 /products/숫자 패턴 매칭
    const match = linkUrl.match(/\/(?:goods|products)\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * 상품 비교
   */
  private compareProducts(
    supabase: ProductSetSearchResult,
    hwahae: {
      productName: string;
      thumbnail: string;
      originalPrice: number;
      discountedPrice: number;
      saleStatus: string;
    },
  ): ProductValidationResult {
    return {
      product_set_id: supabase.product_set_id,
      supabase_data: {
        product_name: supabase.product_name,
        thumbnail: supabase.thumbnail,
        original_price: supabase.original_price,
        discounted_price: supabase.discounted_price,
        sale_status: supabase.sale_status,
      },
      hwahae_data: {
        product_name: hwahae.productName,
        thumbnail: hwahae.thumbnail,
        original_price: hwahae.originalPrice,
        discounted_price: hwahae.discountedPrice,
        sale_status: hwahae.saleStatus,
      },
      comparison: {
        product_name: {
          match: supabase.product_name === hwahae.productName,
          supabase: supabase.product_name,
          hwahae: hwahae.productName,
        },
        thumbnail: {
          match: supabase.thumbnail === hwahae.thumbnail,
          supabase: supabase.thumbnail,
          hwahae: hwahae.thumbnail,
        },
        original_price: {
          match: supabase.original_price === hwahae.originalPrice,
          supabase: supabase.original_price,
          hwahae: hwahae.originalPrice,
        },
        discounted_price: {
          match: supabase.discounted_price === hwahae.discountedPrice,
          supabase: supabase.discounted_price,
          hwahae: hwahae.discountedPrice,
        },
        sale_status: {
          match: supabase.sale_status === hwahae.saleStatus,
          supabase: supabase.sale_status,
          hwahae: hwahae.saleStatus,
        },
      },
      status: "success",
      validated_at: new Date().toISOString(),
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
      supabase_data: {
        product_name: product.product_name,
        thumbnail: product.thumbnail,
        original_price: product.original_price,
        discounted_price: product.discounted_price,
        sale_status: product.sale_status,
      },
      hwahae_data: null,
      comparison: {
        product_name: {
          match: false,
          supabase: product.product_name,
          hwahae: null,
        },
        thumbnail: { match: false, supabase: product.thumbnail, hwahae: null },
        original_price: {
          match: false,
          supabase: product.original_price,
          hwahae: null,
        },
        discounted_price: {
          match: false,
          supabase: product.discounted_price,
          hwahae: null,
        },
        sale_status: {
          match: false,
          supabase: product.sale_status,
          hwahae: null,
        },
      },
      status: "failed",
      error: errorMessage,
      validated_at: new Date().toISOString(),
    };
  }

  /**
   * Not Found 검증 결과 생성
   */
  private createNotFoundValidation(
    product: ProductSetSearchResult,
  ): ProductValidationResult {
    return {
      ...this.createFailedValidation(product, "Product not found in Hwahae"),
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

    // 매칭률 계산
    const successfulValidations = validations.filter(
      (v) => v.status === "success",
    );
    const totalFields = successfulValidations.length * 5;
    const matchedFields = successfulValidations.reduce((count, v) => {
      return count + Object.values(v.comparison).filter((f) => f.match).length;
    }, 0);

    const matchRate = totalFields > 0 ? (matchedFields / totalFields) * 100 : 0;

    return {
      total,
      success,
      failed,
      not_found: notFound,
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
      if (
        typeof concurrency !== "number" ||
        concurrency <= 0 ||
        concurrency > 10
      ) {
        throw new Error("concurrency must be a positive number <= 10");
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

/**
 * 상품 필터링 서비스
 *
 * 쇼핑몰 상품명이 특정 브랜드/상품의 "본품"인지 판단하는 서비스
 * 구성품, 증정품, 다른 상품이 주가 되는 세트는 제외
 */

import { logger } from "@/config/logger";
import {
  GoogleGenAIClient,
  GoogleGenAIError,
  getGoogleGenAIClient,
} from "./GoogleGenAIClient";
import type { GenAIUsageMetadata } from "./GoogleGenAIClient";
import {
  ProductFilteringSchema,
  type ProductFilteringResult,
  type ProductFilteringInput,
} from "./schemas/ProductFilteringSchema";
import { productFilteringPrompt } from "./prompts/productFilteringPrompt";

// ============================================
// 인터페이스 정의
// ============================================

/**
 * 필터링 요청 파라미터
 */
export interface ProductFilteringParams extends ProductFilteringInput {
  /** 사용할 모델 (선택) */
  model?: string;
}

/**
 * 필터링 결과 (사용량 포함)
 */
export interface ProductFilteringResponse {
  result: ProductFilteringResult;
  usage: GenAIUsageMetadata;
  model: string;
}

// ============================================
// 서비스 클래스
// ============================================

/**
 * 상품 필터링 서비스
 */
export class ProductFilteringService {
  private client: GoogleGenAIClient;

  constructor(client?: GoogleGenAIClient) {
    this.client = client ?? getGoogleGenAIClient();
  }

  /**
   * 사용자 프롬프트 생성
   */
  private buildUserPrompt(input: ProductFilteringInput): string {
    const { brand, product_name, product_names } = input;

    return `brand: "${brand}"
product_name: "${product_name}"
product_names: ${JSON.stringify(product_names, null, 2)}`;
  }

  /**
   * 상품 필터링 실행
   *
   * @param params 필터링 요청 파라미터
   * @returns 플랫폼별 유효한 상품 인덱스
   */
  async filter(
    params: ProductFilteringParams,
  ): Promise<ProductFilteringResponse> {
    const { brand, product_name, product_names, model } = params;

    logger.debug(
      {
        brand,
        product_name,
        platformCount: Object.keys(product_names).length,
      },
      "[ProductFiltering] 필터링 시작",
    );

    try {
      const userPrompt = this.buildUserPrompt({
        brand,
        product_name,
        product_names,
      });

      const response =
        await this.client.generateStructuredOutput<ProductFilteringResult>({
          model,
          systemPrompt: productFilteringPrompt,
          userPrompt,
          schema: ProductFilteringSchema,
        });

      // 결과 통계 로깅
      const stats = response.result.platforms.map((p) => ({
        platform: p.platform,
        valid: p.valid_indices.length,
        total: product_names[p.platform]?.length ?? 0,
      }));

      logger.debug(
        {
          stats,
          tokens: response.usage.totalTokenCount,
        },
        "[ProductFiltering] 필터링 완료",
      );

      return response;
    } catch (err) {
      if (err instanceof GoogleGenAIError) {
        logger.error(
          { err, brand, product_name },
          "[ProductFiltering] LLM 호출 실패",
        );
        throw err;
      }

      const error = new GoogleGenAIError(
        `상품 필터링 실패: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      logger.error({ err: error }, "[ProductFiltering] 필터링 실패");
      throw error;
    }
  }

  /**
   * 유효한 상품명만 추출
   *
   * @param params 필터링 요청 파라미터
   * @returns 플랫폼별 유효한 상품명 목록
   */
  async getValidProducts(
    params: ProductFilteringParams,
  ): Promise<Record<string, string[]>> {
    const response = await this.filter(params);
    const validProducts: Record<string, string[]> = {};

    for (const platformResult of response.result.platforms) {
      const { platform, valid_indices } = platformResult;
      const products = params.product_names[platform] ?? [];
      validProducts[platform] = valid_indices
        .filter((idx) => idx >= 0 && idx < products.length)
        .map((idx) => products[idx]);
    }

    return validProducts;
  }
}

// ============================================
// 편의 함수
// ============================================

let defaultService: ProductFilteringService | null = null;

/**
 * 기본 서비스 인스턴스 반환
 */
export function getProductFilteringService(): ProductFilteringService {
  if (!defaultService) {
    defaultService = new ProductFilteringService();
  }
  return defaultService;
}

/**
 * 상품 필터링 (편의 함수)
 */
export async function filterProducts(
  brand: string,
  productName: string,
  productNames: Record<string, string[]>,
  model?: string,
): Promise<ProductFilteringResponse> {
  const service = getProductFilteringService();
  return service.filter({
    brand,
    product_name: productName,
    product_names: productNames,
    model,
  });
}

/**
 * 유효한 상품명만 추출 (편의 함수)
 */
export async function getValidProductNames(
  brand: string,
  productName: string,
  productNames: Record<string, string[]>,
  model?: string,
): Promise<Record<string, string[]>> {
  const service = getProductFilteringService();
  return service.getValidProducts({
    brand,
    product_name: productName,
    product_names: productNames,
    model,
  });
}

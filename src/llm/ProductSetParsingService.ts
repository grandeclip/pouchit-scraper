/**
 * Product Set 파싱 서비스
 *
 * 쇼핑몰 상품명에서 메인 상품과 증정품을 분리하고
 * 구조화된 정보를 추출하는 서비스
 */

import { logger } from "@/config/logger";
import {
  GoogleGenAIClient,
  GoogleGenAIError,
  getGoogleGenAIClient,
} from "./GoogleGenAIClient";
import type { GenAIUsageMetadata } from "./GoogleGenAIClient";
import {
  ProductSetParsingSchema,
  type ProductSetParsingResult,
} from "./schemas";
import { productSetParsingPrompt } from "./prompts/productSetParsingPrompt";

// ============================================
// 인터페이스 정의
// ============================================

/**
 * 파싱 요청 파라미터
 */
export interface ProductSetParsingParams {
  /** 쇼핑몰에서 수집한 전체 상품명 */
  productName: string;
  /** 메인 상품의 정식 이름 (브랜드명 제외) */
  mainProductName: string;
  /** 사용할 모델 (선택) */
  model?: string;
}

/**
 * 파싱 결과 (사용량 포함)
 */
export interface ProductSetParsingResponse {
  result: ProductSetParsingResult;
  usage: GenAIUsageMetadata;
  model: string;
}

// ============================================
// 서비스 클래스
// ============================================

/**
 * Product Set 파싱 서비스
 */
export class ProductSetParsingService {
  private client: GoogleGenAIClient;

  constructor(client?: GoogleGenAIClient) {
    this.client = client ?? getGoogleGenAIClient();
  }

  /**
   * 사용자 프롬프트 생성
   */
  private buildUserPrompt(
    productName: string,
    mainProductName: string,
  ): string {
    return `product_name: "${productName}"
main_product_name: "${mainProductName}"`;
  }

  /**
   * Product Set 파싱 실행
   *
   * @param params 파싱 요청 파라미터
   * @returns 구조화된 파싱 결과
   */
  async parse(
    params: ProductSetParsingParams,
  ): Promise<ProductSetParsingResponse> {
    const { productName, mainProductName, model } = params;

    // logger.debug(
    //   { productName, mainProductName },
    //   "[ProductSetParsing] 파싱 시작",
    // );

    try {
      const userPrompt = this.buildUserPrompt(productName, mainProductName);

      const response =
        await this.client.generateStructuredOutput<ProductSetParsingResult>({
          model,
          systemPrompt: productSetParsingPrompt,
          userPrompt,
          schema: ProductSetParsingSchema,
        });

      // logger.debug(
      //   {
      //     mainProductsCount: response.result.main_products.length,
      //     giftsCount: response.result.gifts.length,
      //     tokens: response.usage.totalTokenCount,
      //   },
      //   "[ProductSetParsing] 파싱 완료",
      // );

      return response;
    } catch (err) {
      if (err instanceof GoogleGenAIError) {
        logger.error(
          { err, productName, mainProductName },
          "[ProductSetParsing] LLM 호출 실패",
        );
        throw err;
      }

      const error = new GoogleGenAIError(
        `Product Set 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      logger.error({ err: error }, "[ProductSetParsing] 파싱 실패");
      throw error;
    }
  }

  /**
   * 배치 파싱 실행
   *
   * @param items 파싱할 항목 목록
   * @returns 파싱 결과 목록
   */
  async parseBatch(
    items: ProductSetParsingParams[],
  ): Promise<ProductSetParsingResponse[]> {
    logger.info({ count: items.length }, "[ProductSetParsing] 배치 파싱 시작");

    const results: ProductSetParsingResponse[] = [];

    for (const item of items) {
      try {
        const result = await this.parse(item);
        results.push(result);
      } catch (err) {
        logger.error(
          { err, productName: item.productName },
          "[ProductSetParsing] 배치 항목 파싱 실패",
        );
        // 실패한 항목은 건너뛰고 계속 진행
      }
    }

    logger.info(
      { total: items.length, success: results.length },
      "[ProductSetParsing] 배치 파싱 완료",
    );

    return results;
  }
}

// ============================================
// 편의 함수
// ============================================

let defaultService: ProductSetParsingService | null = null;

/**
 * 기본 서비스 인스턴스 반환
 */
export function getProductSetParsingService(): ProductSetParsingService {
  if (!defaultService) {
    defaultService = new ProductSetParsingService();
  }
  return defaultService;
}

/**
 * Product Set 파싱 (편의 함수)
 */
export async function parseProductSet(
  productName: string,
  mainProductName: string,
  model?: string,
): Promise<ProductSetParsingResponse> {
  const service = getProductSetParsingService();
  return service.parse({ productName, mainProductName, model });
}

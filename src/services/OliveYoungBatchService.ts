/**
 * OliveYoung Batch Service
 *
 * products 테이블의 상품들을 올리브영에서 검색하고
 * 첫 번째 결과를 product_platform_listings에 저장하는 배치 서비스
 *
 * SOLID 원칙:
 * - SRP: 올리브영 배치 처리만 담당
 * - DIP: Repository 인터페이스에 의존
 *
 * Design Pattern:
 * - Facade Pattern: 복잡한 배치 로직을 단순화
 */

import {
  SupabaseProductsRepository,
  ProductWithBrand,
} from "@/repositories/SupabaseProductsRepository";
import {
  ProductPlatformListingsRepository,
  ProductPlatformListingUpsertRequest,
} from "@/repositories/ProductPlatformListingsRepository";
import { SearcherFactory } from "@/searchers/base/SearcherFactory";
import { registerAllSearchers } from "@/searchers/SearcherRegistration";
import { ISearcher } from "@/core/interfaces/search/ISearcher";
import { logger } from "@/config/logger";

/**
 * 배치 처리 옵션
 */
export interface BatchOptions {
  limit?: number;
  offset?: number;
  delayMs?: number; // 각 요청 사이 지연 (Rate Limiting)
  brandLocale?: string; // 브랜드 locale 필터 (예: "en_KR")
}

/**
 * 단일 상품 처리 결과
 */
export interface SingleResult {
  productId: string;
  productName: string;
  brandName: string;
  keyword: string;
  success: boolean;
  oliveyoungUrl?: string;
  oliveyoungPrice?: number;
  error?: string;
}

/**
 * 배치 처리 결과
 */
export interface BatchResult {
  totalProducts: number;
  processed: number;
  success: number;
  failed: number;
  results: SingleResult[];
  durationMs: number;
}

/**
 * 올리브영 배치 처리 서비스
 */
export class OliveYoungBatchService {
  private readonly OLIVEYOUNG_PLATFORM_ID =
    "50143368-5343-4682-8c78-5c66a50bb716";
  private readonly DEFAULT_DELAY_MS = 2000; // 2초 기본 지연

  private productsRepository: SupabaseProductsRepository;
  private listingsRepository: ProductPlatformListingsRepository;

  constructor() {
    this.productsRepository = new SupabaseProductsRepository();
    this.listingsRepository = new ProductPlatformListingsRepository();
    registerAllSearchers();
  }

  /**
   * 전체 상품 배치 처리
   */
  async processAllProducts(options?: BatchOptions): Promise<BatchResult> {
    const startTime = Date.now();
    const delayMs = options?.delayMs ?? this.DEFAULT_DELAY_MS;

    logger.info(
      {
        limit: options?.limit,
        offset: options?.offset,
        delayMs,
        brandLocale: options?.brandLocale,
      },
      "[OliveYoungBatch] 배치 처리 시작",
    );

    // 상품 목록 조회
    const products = await this.productsRepository.findAllWithBrand({
      limit: options?.limit,
      offset: options?.offset,
      brandLocale: options?.brandLocale,
    });

    logger.info(
      { productCount: products.length },
      "[OliveYoungBatch] 상품 목록 조회 완료",
    );

    const results: SingleResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    // Searcher 재사용 (브라우저 1개로 모든 상품 처리)
    const searcher = SearcherFactory.createSearcher("oliveyoung");

    try {
      // 각 상품 순차 처리
      for (let i = 0; i < products.length; i++) {
        const product = products[i];

        logger.info(
          {
            progress: `${i + 1}/${products.length}`,
            productId: product.id,
            productName: product.name_ko || product.name,
          },
          "[OliveYoungBatch] 상품 처리 중",
        );

        const result = await this.processSingleProductWithSearcher(
          product,
          searcher,
        );
        results.push(result);

        if (result.success) {
          successCount++;
        } else {
          failedCount++;
        }

        // Rate Limiting (마지막 항목 제외)
        if (i < products.length - 1 && delayMs > 0) {
          await this.delay(delayMs);
        }
      }
    } finally {
      // 모든 처리 완료 후 브라우저 정리
      await searcher.cleanup();
      logger.info("[OliveYoungBatch] 브라우저 리소스 정리 완료");
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        totalProducts: products.length,
        success: successCount,
        failed: failedCount,
        durationMs,
      },
      "[OliveYoungBatch] 배치 처리 완료",
    );

    return {
      totalProducts: products.length,
      processed: results.length,
      success: successCount,
      failed: failedCount,
      results,
      durationMs,
    };
  }

  /**
   * 단일 상품 처리 (외부 Searcher 사용 - 배치용)
   */
  private async processSingleProductWithSearcher(
    product: ProductWithBrand,
    searcher: ISearcher,
  ): Promise<SingleResult> {
    const { keyword, brandName, productName } =
      this.buildSearchKeyword(product);

    const baseResult: SingleResult = {
      productId: product.id,
      productName,
      brandName,
      keyword,
      success: false,
    };

    try {
      // 올리브영 검색
      const searchResult = await searcher.search({ keyword, limit: 1 });

      if (searchResult.products.length === 0) {
        logger.warn(
          { keyword, productId: product.id },
          "[OliveYoungBatch] 검색 결과 없음",
        );

        // 기존 데이터 삭제 (Neural Search 결과 또는 실제 상품 없음)
        await this.listingsRepository.deleteByProductAndPlatform(
          product.id,
          this.OLIVEYOUNG_PLATFORM_ID,
        );

        return {
          ...baseResult,
          error: "No search results",
        };
      }

      // 첫 번째 결과
      const firstProduct = searchResult.products[0];
      const oliveyoungUrl = firstProduct.productUrl;
      const oliveyoungPrice = firstProduct.originalPrice ?? firstProduct.price;

      if (!oliveyoungUrl || oliveyoungPrice === undefined) {
        logger.warn(
          { keyword, productId: product.id, firstProduct },
          "[OliveYoungBatch] URL 또는 가격 정보 없음",
        );
        return {
          ...baseResult,
          error: "Missing URL or price",
        };
      }

      // product_platform_listings에 upsert
      const upsertData: ProductPlatformListingUpsertRequest = {
        product_id: product.id,
        platform_id: this.OLIVEYOUNG_PLATFORM_ID,
        price: oliveyoungPrice,
        link: oliveyoungUrl,
      };

      const upsertSuccess = await this.listingsRepository.upsert(upsertData);

      if (!upsertSuccess) {
        return {
          ...baseResult,
          oliveyoungUrl,
          oliveyoungPrice,
          error: "Failed to upsert to database",
        };
      }

      logger.debug(
        {
          productId: product.id,
          keyword,
          oliveyoungUrl,
          oliveyoungPrice,
        },
        "[OliveYoungBatch] 상품 처리 성공",
      );

      return {
        ...baseResult,
        success: true,
        oliveyoungUrl,
        oliveyoungPrice,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error(
        { productId: product.id, keyword, error: errorMessage },
        "[OliveYoungBatch] 상품 처리 실패",
      );

      return {
        ...baseResult,
        error: errorMessage,
      };
    }
  }

  /**
   * 단일 상품 처리 (독립 실행용 - 자체 Searcher 생성/정리)
   */
  async processSingleProduct(product: ProductWithBrand): Promise<SingleResult> {
    const searcher = SearcherFactory.createSearcher("oliveyoung");

    try {
      return await this.processSingleProductWithSearcher(product, searcher);
    } finally {
      await searcher.cleanup();
    }
  }

  /**
   * 검색 키워드 생성
   * - name_ko에서 브랜드명(영문/한글) 제거 후 순수 상품명 추출
   * - 한글 브랜드명 + 순수 상품명 조합 (중복 방지)
   */
  private buildSearchKeyword(product: ProductWithBrand): {
    keyword: string;
    brandName: string;
    productName: string;
  } {
    const brandNameKo = product.brand_name_ko;
    const brandNameEn = product.brand_name;
    const preferredBrand = brandNameKo || brandNameEn;

    // 순수 상품명 추출: name_ko에서 브랜드명(영문/한글) 제거
    let pureProductName: string;
    if (product.name_ko) {
      pureProductName = product.name_ko;

      // 영문 브랜드명 제거 (대소문자 무시)
      if (brandNameEn) {
        const regex = new RegExp(this.escapeRegex(brandNameEn), "gi");
        pureProductName = pureProductName.replace(regex, "");
      }

      // 한글 브랜드명 제거
      if (brandNameKo) {
        pureProductName = pureProductName.replace(brandNameKo, "");
      }

      // 검색 방해 패턴 제거
      pureProductName = this.removeSearchNoisePatterns(pureProductName);

      // 앞뒤 공백 및 중복 공백 정리
      pureProductName = pureProductName.replace(/\s+/g, " ").trim();
    } else {
      pureProductName = product.name;
    }

    // 한글 브랜드 + 순수 상품명 조합
    const keyword = pureProductName
      ? `${preferredBrand} ${pureProductName}`
      : preferredBrand;

    return {
      keyword,
      brandName: preferredBrand,
      productName: product.name_ko || product.name,
    };
  }

  /**
   * 정규식 특수문자 이스케이프
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 검색 방해 패턴 제거
   * - SPF/PA 표기, 용량, 수량 등 제거
   */
  private removeSearchNoisePatterns(text: string): string {
    const patterns = [
      /SPF\s?\d+\+?/gi, // SPF50, SPF 30+
      /PA\+{1,4}/gi, // PA+, PA++++
      /\d+\s?(ml|g|mg|oz|L|kg)/gi, // 70ml, 200g, 1L
      /\d+\s?(매|개|ea|팩|장|정)/gi, // 10매, 5개, 30ea
      /\(\s*\d+[^)]*\)/g, // (50ml), (2개입)
      /\[\s*\d+[^]]*\]/g, // [50ml]
    ];

    let result = text;
    for (const pattern of patterns) {
      result = result.replace(pattern, "");
    }

    return result;
  }

  /**
   * 단일 상품 ID로 처리
   */
  async processById(productId: string): Promise<SingleResult> {
    const product = await this.productsRepository.findByIdWithBrand(productId);

    if (!product) {
      return {
        productId,
        productName: "",
        brandName: "",
        keyword: "",
        success: false,
        error: "Product not found",
      };
    }

    return this.processSingleProduct(product);
  }

  /**
   * 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

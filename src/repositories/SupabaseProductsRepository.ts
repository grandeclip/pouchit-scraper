/**
 * Supabase Products Repository
 *
 * products 테이블에서 상품 정보를 조회하는 Repository 구현
 * (product_sets 테이블과 별개)
 *
 * SOLID 원칙:
 * - SRP: products 테이블 조회만 담당
 * - DIP: IProductsRepository 인터페이스 구현
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  IProductsRepository,
  ProductEntity,
} from "@/core/interfaces/IProductsRepository";
import { logger } from "@/config/logger";
import { REPOSITORY_CONFIG } from "@/config/constants";

/**
 * Supabase Products Repository
 */
export class SupabaseProductsRepository implements IProductsRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "products";
  private readonly defaultFields = ["product_id", "name", "brand_id"];

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (SupabaseProductsRepository.instance) {
      return SupabaseProductsRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    SupabaseProductsRepository.instance = createClient(
      supabaseUrl,
      supabaseKey,
    );
    logger.debug("SupabaseProductsRepository 초기화 완료");

    return SupabaseProductsRepository.instance;
  }

  /**
   * 전체 상품 조회 (pagination 지원)
   */
  async findAll(): Promise<ProductEntity[]> {
    const PAGE_SIZE = REPOSITORY_CONFIG.PAGINATION_PAGE_SIZE;
    const allResults: ProductEntity[] = [];
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;

    logger.info(
      { pageSize: PAGE_SIZE },
      "[ProductsRepository] 전체 상품 조회 시작",
    );

    try {
      while (hasMore) {
        const { data, error } = await this.client
          .from(this.tableName)
          .select(this.defaultFields.join(", "))
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          logger.error(
            { error: error.message, code: error.code, offset },
            "[ProductsRepository] 조회 실패",
          );
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allResults.push(...(data as unknown as ProductEntity[]));
          offset += PAGE_SIZE;
          pageCount++;
          hasMore = data.length === PAGE_SIZE;

          logger.debug(
            {
              page: pageCount,
              fetched: data.length,
              total: allResults.length,
              hasMore,
            },
            "[ProductsRepository] Pagination 진행 중",
          );
        }
      }

      logger.info(
        { totalCount: allResults.length, pageCount },
        "[ProductsRepository] 전체 상품 조회 완료",
      );

      return allResults;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[ProductsRepository] 전체 상품 조회 예외",
      );
      throw error;
    }
  }

  /**
   * 상품 ID로 단일 상품 조회
   */
  async findById(productId: string): Promise<ProductEntity | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select(this.defaultFields.join(", "))
        .eq("product_id", productId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        logger.error(
          {
            error: error.message,
            code: error.code,
            product_id: productId,
          },
          "[ProductsRepository] 상품 조회 실패",
        );
        return null;
      }

      return data as unknown as ProductEntity;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          product_id: productId,
        },
        "[ProductsRepository] 상품 조회 예외",
      );
      return null;
    }
  }

  /**
   * 전체 상품 수 조회
   */
  async count(): Promise<number> {
    try {
      const { count, error } = await this.client
        .from(this.tableName)
        .select("*", { count: "exact", head: true });

      if (error) {
        logger.error(
          { error: error.message, code: error.code },
          "[ProductsRepository] 상품 수 조회 실패",
        );
        return 0;
      }

      return count ?? 0;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[ProductsRepository] 상품 수 조회 예외",
      );
      return 0;
    }
  }
}

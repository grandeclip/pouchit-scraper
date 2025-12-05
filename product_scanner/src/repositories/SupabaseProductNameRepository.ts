/**
 * Supabase Product Name Repository
 *
 * products 테이블에서 상품명(name)을 조회하는 Repository 구현
 *
 * SOLID 원칙:
 * - SRP: products.name 조회만 담당
 * - DIP: IProductNameRepository 인터페이스 구현
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { IProductNameRepository } from "@/core/interfaces/IProductNameRepository";
import { logger } from "@/config/logger";

/**
 * Supabase Product Name Repository
 */
export class SupabaseProductNameRepository implements IProductNameRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "products";

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (SupabaseProductNameRepository.instance) {
      return SupabaseProductNameRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    SupabaseProductNameRepository.instance = createClient(
      supabaseUrl,
      supabaseKey,
    );
    logger.debug("SupabaseProductNameRepository 초기화 완료");

    return SupabaseProductNameRepository.instance;
  }

  /**
   * 여러 product_id에 대한 name 조회
   *
   * @param productIds product_id 배열
   * @returns product_id → name 매핑
   */
  async getNamesByIds(productIds: string[]): Promise<Map<string, string>> {
    const resultMap = new Map<string, string>();

    if (productIds.length === 0) {
      return resultMap;
    }

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("product_id, name")
        .in("product_id", productIds);

      if (error) {
        logger.error(
          {
            error: error.message,
            code: error.code,
            count: productIds.length,
          },
          "[ProductNameRepository] products 조회 실패",
        );
        return resultMap;
      }

      for (const product of data ?? []) {
        if (product.name) {
          resultMap.set(product.product_id, product.name);
        }
      }

      logger.debug(
        {
          requested: productIds.length,
          found: resultMap.size,
        },
        "[ProductNameRepository] products.name 조회 완료",
      );

      return resultMap;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          count: productIds.length,
        },
        "[ProductNameRepository] products 조회 예외",
      );
      return resultMap;
    }
  }

  /**
   * 단일 product_id에 대한 name 조회
   *
   * @param productId product_id
   * @returns name 또는 null
   */
  async getNameById(productId: string): Promise<string | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("name")
        .eq("product_id", productId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Not found
          return null;
        }
        logger.error(
          {
            error: error.message,
            code: error.code,
            product_id: productId,
          },
          "[ProductNameRepository] product 조회 실패",
        );
        return null;
      }

      return data?.name ?? null;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          product_id: productId,
        },
        "[ProductNameRepository] product 조회 예외",
      );
      return null;
    }
  }
}

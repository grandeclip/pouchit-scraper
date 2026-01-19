/**
 * Product Platform Listings Repository
 *
 * product_platform_listings 테이블에서 플랫폼별 상품 정보를 관리하는 Repository
 *
 * SOLID 원칙:
 * - SRP: product_platform_listings 테이블 관리만 담당
 * - DIP: 인터페이스 기반 구현
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/config/logger";

/**
 * ProductPlatformListing 엔티티
 */
export interface ProductPlatformListing {
  id: string;
  product_id: string;
  platform_id: string;
  price: number;
  link: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Upsert 요청 데이터
 */
export interface ProductPlatformListingUpsertRequest {
  product_id: string;
  platform_id: string;
  price: number;
  link: string | null;
}

/**
 * Product Platform Listings Repository
 */
export class ProductPlatformListingsRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "product_platform_listings";

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (ProductPlatformListingsRepository.instance) {
      return ProductPlatformListingsRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    ProductPlatformListingsRepository.instance = createClient(
      supabaseUrl,
      supabaseKey,
    );
    logger.debug("ProductPlatformListingsRepository 초기화 완료");

    return ProductPlatformListingsRepository.instance;
  }

  /**
   * Upsert: product_id + platform_id 기준으로 삽입 또는 업데이트
   */
  async upsert(data: ProductPlatformListingUpsertRequest): Promise<boolean> {
    try {
      const { error } = await this.client.from(this.tableName).upsert(
        {
          product_id: data.product_id,
          platform_id: data.platform_id,
          price: data.price,
          link: data.link,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "product_id,platform_id",
        },
      );

      if (error) {
        logger.error(
          {
            error: error.message,
            code: error.code,
            product_id: data.product_id,
            platform_id: data.platform_id,
          },
          "[ProductPlatformListingsRepository] upsert 실패",
        );
        return false;
      }

      logger.debug(
        {
          product_id: data.product_id,
          platform_id: data.platform_id,
          price: data.price,
        },
        "[ProductPlatformListingsRepository] upsert 성공",
      );

      return true;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          product_id: data.product_id,
        },
        "[ProductPlatformListingsRepository] upsert 예외",
      );
      return false;
    }
  }

  /**
   * product_id + platform_id로 조회
   */
  async findByProductAndPlatform(
    productId: string,
    platformId: string,
  ): Promise<ProductPlatformListing | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("*")
        .eq("product_id", productId)
        .eq("platform_id", platformId)
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
            platform_id: platformId,
          },
          "[ProductPlatformListingsRepository] 조회 실패",
        );
        return null;
      }

      return data as ProductPlatformListing;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          product_id: productId,
          platform_id: platformId,
        },
        "[ProductPlatformListingsRepository] 조회 예외",
      );
      return null;
    }
  }

  /**
   * 특정 플랫폼의 모든 리스팅 조회
   */
  async findByPlatform(platformId: string): Promise<ProductPlatformListing[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("*")
        .eq("platform_id", platformId);

      if (error) {
        logger.error(
          {
            error: error.message,
            code: error.code,
            platform_id: platformId,
          },
          "[ProductPlatformListingsRepository] 플랫폼별 조회 실패",
        );
        return [];
      }

      return (data as ProductPlatformListing[]) || [];
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          platform_id: platformId,
        },
        "[ProductPlatformListingsRepository] 플랫폼별 조회 예외",
      );
      return [];
    }
  }

  /**
   * product_id + platform_id로 삭제 (단종 상품 처리용)
   */
  async deleteByProductAndPlatform(
    productId: string,
    platformId: string,
  ): Promise<boolean> {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .eq("product_id", productId)
        .eq("platform_id", platformId);

      if (error) {
        logger.error(
          {
            error: error.message,
            code: error.code,
            product_id: productId,
            platform_id: platformId,
          },
          "[ProductPlatformListingsRepository] 삭제 실패",
        );
        return false;
      }

      logger.info(
        { product_id: productId, platform_id: platformId },
        "[ProductPlatformListingsRepository] 삭제 완료 (단종 처리)",
      );

      return true;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          product_id: productId,
          platform_id: platformId,
        },
        "[ProductPlatformListingsRepository] 삭제 예외",
      );
      return false;
    }
  }
}

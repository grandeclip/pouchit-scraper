/**
 * Supabase Brand Repository
 *
 * brands 테이블에서 브랜드 정보를 조회하는 Repository 구현
 *
 * SOLID 원칙:
 * - SRP: brands 테이블 조회만 담당
 * - DIP: IBrandRepository 인터페이스 구현
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  IBrandRepository,
  BrandEntity,
} from "@/core/interfaces/IBrandRepository";
import { logger } from "@/config/logger";

/**
 * Supabase Brand Repository
 */
export class SupabaseBrandRepository implements IBrandRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "brands";

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (SupabaseBrandRepository.instance) {
      return SupabaseBrandRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    SupabaseBrandRepository.instance = createClient(supabaseUrl, supabaseKey);
    logger.debug("SupabaseBrandRepository 초기화 완료");

    return SupabaseBrandRepository.instance;
  }

  /**
   * 브랜드 ID로 브랜드명 조회
   */
  async getNameById(brandId: string): Promise<string | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("name")
        .eq("brand_id", brandId)
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
            brand_id: brandId,
          },
          "[BrandRepository] brand 조회 실패",
        );
        return null;
      }

      return data?.name ?? null;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          brand_id: brandId,
        },
        "[BrandRepository] brand 조회 예외",
      );
      return null;
    }
  }

  /**
   * 여러 브랜드 ID에 대한 브랜드명 일괄 조회
   */
  async getNamesByIds(brandIds: string[]): Promise<Map<string, string>> {
    const resultMap = new Map<string, string>();

    if (brandIds.length === 0) {
      return resultMap;
    }

    // 중복 제거
    const uniqueBrandIds = [...new Set(brandIds)];

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("brand_id, name")
        .in("brand_id", uniqueBrandIds);

      if (error) {
        logger.error(
          {
            error: error.message,
            code: error.code,
            count: uniqueBrandIds.length,
          },
          "[BrandRepository] brands 일괄 조회 실패",
        );
        return resultMap;
      }

      for (const brand of data ?? []) {
        if (brand.name) {
          resultMap.set(brand.brand_id, brand.name);
        }
      }

      logger.debug(
        {
          requested: uniqueBrandIds.length,
          found: resultMap.size,
        },
        "[BrandRepository] brands 일괄 조회 완료",
      );

      return resultMap;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          count: uniqueBrandIds.length,
        },
        "[BrandRepository] brands 일괄 조회 예외",
      );
      return resultMap;
    }
  }
}

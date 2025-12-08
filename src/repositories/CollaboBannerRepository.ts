/**
 * Collabo Banner Repository
 *
 * collabo_banners 테이블 조회 Repository
 *
 * SOLID 원칙:
 * - SRP: collabo_banners 테이블 조회만 담당
 * - DIP: Supabase 클라이언트 의존성 주입 가능
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/config/logger";

/**
 * 활성 배너 정보
 */
export interface ActiveCollaboBanner {
  /** collabo_banners 테이블의 id */
  id: number;
  /** product_sets 테이블의 product_set_id (UUID) */
  product_set_id: string;
}

/**
 * Collabo Banner Repository
 */
export class CollaboBannerRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "collabo_banners";

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (CollaboBannerRepository.instance) {
      return CollaboBannerRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    CollaboBannerRepository.instance = createClient(supabaseUrl, supabaseKey);
    logger.info("CollaboBannerRepository: Supabase client 초기화 완료");

    return CollaboBannerRepository.instance;
  }

  /**
   * 현재 활성 상태인 배너 목록 조회
   *
   * 조건:
   * - is_active = true
   * - start_date <= now() <= end_date
   *
   * @returns 활성 배너 목록 [{ id, product_set_id }]
   */
  async findActiveBanners(): Promise<ActiveCollaboBanner[]> {
    logger.info("[CollaboBannerRepository] 활성 배너 조회 시작");

    try {
      const now = new Date().toISOString();

      const { data, error } = await this.client
        .from(this.tableName)
        .select("id, product_set_id")
        .eq("is_active", true)
        .lte("start_date", now)
        .gte("end_date", now);

      if (error) {
        logger.error(
          { error: error.message, code: error.code },
          "[CollaboBannerRepository] Supabase 쿼리 실패",
        );
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        logger.info("[CollaboBannerRepository] 활성 배너 없음");
        return [];
      }

      logger.info(
        { count: data.length },
        "[CollaboBannerRepository] 활성 배너 조회 완료",
      );

      return data as ActiveCollaboBanner[];
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[CollaboBannerRepository] 활성 배너 조회 실패",
      );
      throw error;
    }
  }

  /**
   * 연결 상태 확인
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .select("id")
        .limit(1);

      if (error) {
        logger.error(
          { error: error.message },
          "[CollaboBannerRepository] Health check 실패",
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[CollaboBannerRepository] Health check 실패",
      );
      return false;
    }
  }
}

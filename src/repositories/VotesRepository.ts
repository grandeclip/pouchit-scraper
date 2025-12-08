/**
 * Votes Repository
 *
 * votes 테이블 조회 Repository
 *
 * SOLID 원칙:
 * - SRP: votes 테이블 조회만 담당
 * - DIP: Supabase 클라이언트 의존성 주입 가능
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/config/logger";

/**
 * 활성 투표 정보
 */
export interface ActiveVote {
  /** votes 테이블의 id */
  id: number;
  /** product_sets 테이블의 product_set_id (UUID) - A 옵션 */
  product_set_a: string;
  /** product_sets 테이블의 product_set_id (UUID) - B 옵션 */
  product_set_b: string;
}

/**
 * Votes Repository
 */
export class VotesRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "votes";

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (VotesRepository.instance) {
      return VotesRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    VotesRepository.instance = createClient(supabaseUrl, supabaseKey);
    logger.info("VotesRepository: Supabase client 초기화 완료");

    return VotesRepository.instance;
  }

  /**
   * 현재 활성 상태인 투표 목록 조회
   *
   * 조건:
   * - start_date <= now() <= end_date
   *
   * @returns 활성 투표 목록 [{ id, product_set_a, product_set_b }]
   */
  async findActiveVotes(): Promise<ActiveVote[]> {
    logger.info("[VotesRepository] 활성 투표 조회 시작");

    try {
      const now = new Date().toISOString();

      const { data, error } = await this.client
        .from(this.tableName)
        .select("id, product_set_a, product_set_b")
        .lte("start_date", now)
        .gte("end_date", now);

      if (error) {
        logger.error(
          { error: error.message, code: error.code },
          "[VotesRepository] Supabase 쿼리 실패",
        );
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        logger.info("[VotesRepository] 활성 투표 없음");
        return [];
      }

      logger.info(
        { count: data.length },
        "[VotesRepository] 활성 투표 조회 완료",
      );

      return data as ActiveVote[];
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[VotesRepository] 활성 투표 조회 실패",
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
          "[VotesRepository] Health check 실패",
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[VotesRepository] Health check 실패",
      );
      return false;
    }
  }
}

/**
 * PickSections Repository
 *
 * pick_sections 테이블 조회 Repository
 *
 * SOLID 원칙:
 * - SRP: pick_sections 테이블 조회만 담당
 * - DIP: Supabase 클라이언트 의존성 주입 가능
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 *
 * 테이블 구조:
 * - content: JSONB 컬럼
 *   - upper: Section[] - 상단 섹션
 *   - lower: Section[] - 하단 섹션
 *   - Section: { keyword: string, items: Item[] }
 *   - Item: { product_id: string, product_set_id: string[] }
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/config/logger";

/**
 * pick_sections 아이템 정보
 */
export interface PickSectionItem {
  product_id: string;
  product_set_id: string[];
}

/**
 * pick_sections 섹션 정보
 */
export interface PickSection {
  keyword: string;
  items: PickSectionItem[];
}

/**
 * pick_sections content 구조
 */
export interface PickSectionsContent {
  upper?: PickSection[];
  lower?: PickSection[];
}

/**
 * 모니터링용 product_set 정보 (평탄화)
 */
export interface PickSectionProductSet {
  /** 섹션 위치 (upper/lower) */
  section: "upper" | "lower";
  /** 섹션 키워드 */
  keyword: string;
  /** 원본 product_id */
  product_id: string;
  /** 검사할 product_set_id */
  product_set_id: string;
}

/**
 * PickSections Repository
 */
export class PickSectionsRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "pick_sections";

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (PickSectionsRepository.instance) {
      return PickSectionsRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    PickSectionsRepository.instance = createClient(supabaseUrl, supabaseKey);
    logger.info("PickSectionsRepository: Supabase client 초기화 완료");

    return PickSectionsRepository.instance;
  }

  /**
   * 최신 pick_sections의 content 조회 (created_at 기준 최신 1개)
   *
   * @returns content 배열 (최신 1개만 포함)
   */
  async findAllContents(): Promise<PickSectionsContent[]> {
    logger.info("[PickSectionsRepository] 최신 content 조회 시작");

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("content")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        logger.error(
          { error: error.message, code: error.code },
          "[PickSectionsRepository] Supabase 쿼리 실패",
        );
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        logger.info("[PickSectionsRepository] 데이터 없음");
        return [];
      }

      logger.info("[PickSectionsRepository] 최신 content 조회 완료");

      return data.map((row) => row.content as PickSectionsContent);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[PickSectionsRepository] content 조회 실패",
      );
      throw error;
    }
  }

  /**
   * 모든 product_set_id를 평탄화하여 반환
   *
   * 중첩 구조:
   * - content.upper[].items[].product_set_id[]
   * - content.lower[].items[].product_set_id[]
   *
   * @returns 평탄화된 product_set 목록
   */
  async findAllProductSets(): Promise<PickSectionProductSet[]> {
    const contents = await this.findAllContents();
    const productSets: PickSectionProductSet[] = [];

    for (const content of contents) {
      // upper 섹션 처리
      if (content.upper) {
        for (const section of content.upper) {
          for (const item of section.items) {
            for (const productSetId of item.product_set_id) {
              productSets.push({
                section: "upper",
                keyword: section.keyword,
                product_id: item.product_id,
                product_set_id: productSetId,
              });
            }
          }
        }
      }

      // lower 섹션 처리
      if (content.lower) {
        for (const section of content.lower) {
          for (const item of section.items) {
            for (const productSetId of item.product_set_id) {
              productSets.push({
                section: "lower",
                keyword: section.keyword,
                product_id: item.product_id,
                product_set_id: productSetId,
              });
            }
          }
        }
      }
    }

    logger.info(
      { total_product_sets: productSets.length },
      "[PickSectionsRepository] product_set 평탄화 완료",
    );

    return productSets;
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
          "[PickSectionsRepository] Health check 실패",
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[PickSectionsRepository] Health check 실패",
      );
      return false;
    }
  }
}

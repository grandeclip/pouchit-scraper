/**
 * Supabase Platform Repository
 *
 * platforms 테이블에서 플랫폼 정보를 조회하는 Repository
 *
 * SOLID 원칙:
 * - SRP: platforms 테이블 조회만 담당
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/config/logger";

/**
 * Platform Entity
 */
export interface PlatformEntity {
  platform_id: number;
  name: string;
}

/**
 * Supabase Platform Repository
 */
export class SupabasePlatformRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = "platforms";

  // 플랫폼 이름 → platform_id 캐시 (한 번 조회 후 재사용)
  private platformIdCache: Map<string, number> | null = null;

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (SupabasePlatformRepository.instance) {
      return SupabasePlatformRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    SupabasePlatformRepository.instance = createClient(
      supabaseUrl,
      supabaseKey,
    );
    logger.debug("SupabasePlatformRepository 초기화 완료");

    return SupabasePlatformRepository.instance;
  }

  /**
   * 전체 플랫폼 조회
   */
  async findAll(): Promise<PlatformEntity[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select("platform_id, name");

      if (error) {
        logger.error(
          { error: error.message, code: error.code },
          "[PlatformRepository] 조회 실패",
        );
        return [];
      }

      return (data ?? []) as PlatformEntity[];
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[PlatformRepository] 조회 예외",
      );
      return [];
    }
  }

  /**
   * 플랫폼 이름으로 platform_id 조회
   * name 컬럼에서 platformName을 포함하는 레코드 검색
   *
   * @param platformName 플랫폼 이름 (oliveyoung, hwahae, zigzag 등)
   * @returns platform_id (없으면 null)
   */
  async findIdByName(platformName: string): Promise<number | null> {
    // 캐시 초기화 (없으면)
    if (!this.platformIdCache) {
      await this.initializeCache();
    }

    // initializeCache() 후 platformIdCache는 반드시 초기화됨
    return this.platformIdCache!.get(platformName.toLowerCase()) ?? null;
  }

  /**
   * 여러 플랫폼 이름으로 platform_id Map 조회
   *
   * @param platformNames 플랫폼 이름 배열
   * @returns Map<platformName, platform_id>
   */
  async findIdsByNames(platformNames: string[]): Promise<Map<string, number>> {
    // 캐시 초기화 (없으면)
    if (!this.platformIdCache) {
      await this.initializeCache();
    }

    const result = new Map<string, number>();
    // initializeCache() 후 platformIdCache는 반드시 초기화됨
    const cache = this.platformIdCache!;
    for (const name of platformNames) {
      const id = cache.get(name.toLowerCase());
      if (id !== undefined) {
        result.set(name.toLowerCase(), id);
      }
    }

    return result;
  }

  /**
   * 캐시 초기화
   */
  private async initializeCache(): Promise<void> {
    const platforms = await this.findAll();

    this.platformIdCache = new Map();

    for (const platform of platforms) {
      // name에서 플랫폼 키워드 추출하여 매핑
      const nameLower = platform.name.toLowerCase();

      // 직접 매핑
      if (nameLower.includes("oliveyoung") || nameLower.includes("올리브영")) {
        this.platformIdCache.set("oliveyoung", platform.platform_id);
      }
      if (nameLower.includes("hwahae") || nameLower.includes("화해")) {
        this.platformIdCache.set("hwahae", platform.platform_id);
      }
      if (nameLower.includes("zigzag") || nameLower.includes("지그재그")) {
        this.platformIdCache.set("zigzag", platform.platform_id);
      }
      if (nameLower.includes("musinsa") || nameLower.includes("무신사")) {
        this.platformIdCache.set("musinsa", platform.platform_id);
      }
      if (nameLower.includes("ably") || nameLower.includes("에이블리")) {
        this.platformIdCache.set("ably", platform.platform_id);
      }
      if (nameLower.includes("kurly") || nameLower.includes("컬리")) {
        this.platformIdCache.set("kurly", platform.platform_id);
      }
    }

    logger.debug(
      { cachedPlatforms: Array.from(this.platformIdCache.keys()) },
      "[PlatformRepository] 캐시 초기화 완료",
    );
  }
}

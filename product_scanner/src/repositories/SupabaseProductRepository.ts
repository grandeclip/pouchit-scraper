/**
 * Supabase Product Repository 구현
 *
 * SOLID 원칙:
 * - SRP: Supabase와의 데이터 통신만 담당
 * - DIP: IProductRepository 인터페이스 구현
 * - OCP: 새로운 저장소 추가 시 이 코드는 수정하지 않음
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { IProductRepository } from "@/core/interfaces/IProductRepository";
import {
  ProductSet,
  ProductSetEntity,
  ProductSetSchema,
  ProductSetSearchRequest,
} from "@/core/domain/ProductSet";
import {
  API_CONFIG,
  DATABASE_CONFIG,
  REPOSITORY_CONFIG,
} from "@/config/constants";
import { logger } from "@/config/logger";

/**
 * Supabase Product Repository
 */
export class SupabaseProductRepository implements IProductRepository {
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = DATABASE_CONFIG.PRODUCT_TABLE_NAME;
  private readonly defaultFields = REPOSITORY_CONFIG.DEFAULT_PRODUCT_FIELDS;

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (SupabaseProductRepository.instance) {
      return SupabaseProductRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    SupabaseProductRepository.instance = createClient(supabaseUrl, supabaseKey);
    logger.info("Supabase client 초기화 완료");

    return SupabaseProductRepository.instance;
  }

  /**
   * 상품 검색
   * @param request 검색 조건
   * @returns 검색된 상품 목록
   */
  async search(request: ProductSetSearchRequest): Promise<ProductSetEntity[]> {
    const { link_url_pattern, sale_status, product_id, limit } = request;

    // limit이 없으면 전체 조회 (pagination), 있으면 제한 조회
    const shouldFetchAll = limit === undefined;

    logger.info(
      {
        link_url_pattern,
        sale_status,
        product_id,
        limit,
        fetchAll: shouldFetchAll,
      },
      "[Repository] 상품 검색 시작",
    );

    try {
      // 전체 조회 모드: pagination으로 모든 데이터 조회
      if (shouldFetchAll) {
        return await this.searchWithPagination(request);
      }

      // 제한 조회 모드: limit 적용
      const query = this.buildSearchQuery(request).limit(limit);

      const { data, error } = await query;

      if (error) {
        logger.error(
          { error: error.message, code: error.code },
          "[Repository] Supabase 쿼리 실패",
        );
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        logger.info("[Repository] 검색 결과 없음");
        return [];
      }

      logger.info({ count: data.length }, "[Repository] 검색 완료");

      return this.parseResults(data);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Repository] 상품 검색 실패",
      );
      throw error;
    }
  }

  /**
   * 검색 쿼리 빌더 (공통 로직)
   */
  private buildSearchQuery(request: ProductSetSearchRequest) {
    const { link_url_pattern, sale_status, product_id } = request;

    let query = this.client
      .from(this.tableName)
      .select(this.defaultFields.join(", "));

    if (product_id) {
      query = query.eq("product_id", product_id);
    }

    if (link_url_pattern) {
      query = query.ilike("link_url", `%${link_url_pattern}%`);
    }

    if (sale_status) {
      query = query.eq("sale_status", sale_status);
    }

    return query;
  }

  /**
   * Pagination으로 모든 결과 조회
   *
   * Supabase 1000개 제한을 우회하여 조건에 맞는 모든 데이터 조회
   */
  private async searchWithPagination(
    request: ProductSetSearchRequest,
  ): Promise<ProductSetEntity[]> {
    const PAGE_SIZE = REPOSITORY_CONFIG.PAGINATION_PAGE_SIZE;
    const allResults: ProductSetEntity[] = [];
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;

    logger.info(
      { request, pageSize: PAGE_SIZE },
      "[Repository] Pagination 검색 시작",
    );

    while (hasMore) {
      const query = this.buildSearchQuery(request).range(
        offset,
        offset + PAGE_SIZE - 1,
      );

      const { data, error } = await query;

      if (error) {
        logger.error(
          { error: error.message, code: error.code, offset },
          "[Repository] Pagination 쿼리 실패",
        );
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        const entities = this.parseResults(data);
        allResults.push(...entities);
        offset += PAGE_SIZE;
        pageCount++;
        hasMore = data.length === PAGE_SIZE;

        logger.info(
          {
            page: pageCount,
            fetched: data.length,
            total: allResults.length,
            hasMore,
          },
          "[Repository] Pagination 진행 중",
        );
      }
    }

    logger.info(
      { totalCount: allResults.length, pageCount },
      "[Repository] Pagination 검색 완료",
    );

    return allResults;
  }

  /**
   * DB 레코드를 도메인 엔티티로 변환
   */
  private parseResults(data: unknown[]): ProductSetEntity[] {
    return data.map((record) => {
      const validated = ProductSetSchema.parse(record);
      return ProductSetEntity.fromDbRecord(validated);
    });
  }

  /**
   * 상품 ID로 조회
   * @param productSetId 상품 세트 ID (UUID)
   * @returns 상품 정보
   */
  async findById(productSetId: string): Promise<ProductSetEntity | null> {
    logger.info(
      { product_set_id: productSetId },
      "[Repository] 상품 조회 시작",
    );

    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select(this.defaultFields.join(", "))
        .eq("product_set_id", productSetId)
        .single();

      if (error) {
        // 404는 정상 케이스
        if (error.code === "PGRST116") {
          logger.info(
            { product_set_id: productSetId },
            "[Repository] 상품을 찾을 수 없음",
          );
          return null;
        }

        logger.error(
          { error: error.message, code: error.code },
          "[Repository] Supabase 쿼리 실패",
        );
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!data) {
        logger.info(
          { product_set_id: productSetId },
          "[Repository] 상품을 찾을 수 없음",
        );
        return null;
      }

      logger.info("[Repository] 상품 조회 완료");

      // Zod 스키마로 검증
      const validated = ProductSetSchema.parse(data);
      // 도메인 엔티티로 변환
      return ProductSetEntity.fromDbRecord(validated);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Repository] 상품 조회 실패",
      );
      throw error;
    }
  }

  /**
   * 연결 상태 확인
   * @returns 연결 여부
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .select("product_set_id")
        .limit(1);

      if (error) {
        logger.error(
          { error: error.message },
          "[Repository] Health check 실패",
        );
        return false;
      }

      logger.debug("[Repository] Health check 성공");
      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[Repository] Health check 실패",
      );
      return false;
    }
  }
}

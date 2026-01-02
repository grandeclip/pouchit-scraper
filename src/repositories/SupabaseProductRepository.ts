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
import {
  IProductRepository,
  ProductSetInsertRequest,
  ProductSetInsertResult,
} from "@/core/interfaces/IProductRepository";
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
    const { link_url_pattern, sale_status, product_id, exclude_auto_crawled } =
      request;

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

    // 스케줄러용: auto_crawled=true인 항목 제외
    if (exclude_auto_crawled) {
      query = query.or("auto_crawled.is.null,auto_crawled.eq.false");
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

  /**
   * 새 product_set 삽입
   * @param request 삽입할 데이터
   * @returns 생성된 product_set 정보
   */
  async insert(
    request: ProductSetInsertRequest,
  ): Promise<ProductSetInsertResult | null> {
    logger.info(
      {
        product_id: request.product_id,
        link_url: request.link_url,
        auto_crawled: request.auto_crawled,
      },
      "[Repository] product_set 삽입 시작",
    );

    try {
      const insertData: Record<string, unknown> = {
        product_id: request.product_id,
        link_url: request.link_url,
        platform_id: request.platform_id,
        auto_crawled: request.auto_crawled ?? false,
      };

      // sale_status가 제공된 경우 추가
      if (request.sale_status) {
        insertData.sale_status = request.sale_status;
      }

      // mobile_link_url이 제공된 경우 추가
      if (request.mobile_link_url) {
        insertData.mobile_link_url = request.mobile_link_url;
      }

      const { data, error } = await this.client
        .from(this.tableName)
        .insert(insertData)
        .select("product_set_id, product_id, link_url, mobile_link_url")
        .single();

      if (error) {
        logger.error(
          {
            error: error.message,
            code: error.code,
            product_id: request.product_id,
          },
          "[Repository] product_set 삽입 실패",
        );
        return null;
      }

      logger.info(
        {
          product_set_id: data.product_set_id,
          product_id: data.product_id,
        },
        "[Repository] product_set 삽입 완료",
      );

      return {
        product_set_id: data.product_set_id,
        product_id: data.product_id,
        link_url: data.link_url,
        mobile_link_url: data.mobile_link_url,
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          product_id: request.product_id,
        },
        "[Repository] product_set 삽입 예외",
      );
      return null;
    }
  }

  /**
   * 여러 product_set 일괄 삽입
   * @param requests 삽입할 데이터 배열
   * @returns 생성된 product_set 정보 배열
   */
  async insertMany(
    requests: ProductSetInsertRequest[],
  ): Promise<ProductSetInsertResult[]> {
    if (requests.length === 0) {
      return [];
    }

    logger.info(
      { count: requests.length },
      "[Repository] product_set 일괄 삽입 시작",
    );

    try {
      const insertData = requests.map((req) => {
        const data: Record<string, unknown> = {
          product_id: req.product_id,
          link_url: req.link_url,
          platform_id: req.platform_id,
          auto_crawled: req.auto_crawled ?? false,
        };
        // sale_status가 제공된 경우 추가
        if (req.sale_status) {
          data.sale_status = req.sale_status;
        }
        // mobile_link_url이 제공된 경우 추가
        if (req.mobile_link_url) {
          data.mobile_link_url = req.mobile_link_url;
        }
        return data;
      });

      const { data, error } = await this.client
        .from(this.tableName)
        .insert(insertData)
        .select("product_set_id, product_id, link_url, mobile_link_url");

      if (error) {
        logger.error(
          {
            error: error.message,
            code: error.code,
            count: requests.length,
          },
          "[Repository] product_set 일괄 삽입 실패",
        );
        return [];
      }

      const results: ProductSetInsertResult[] = (data ?? []).map((d) => ({
        product_set_id: d.product_set_id,
        product_id: d.product_id,
        link_url: d.link_url,
        mobile_link_url: d.mobile_link_url,
      }));

      logger.info(
        {
          requested: requests.length,
          inserted: results.length,
        },
        "[Repository] product_set 일괄 삽입 완료",
      );

      return results;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          count: requests.length,
        },
        "[Repository] product_set 일괄 삽입 예외",
      );
      return [];
    }
  }
}

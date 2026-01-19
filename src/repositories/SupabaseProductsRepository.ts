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

/**
 * 상품 + 브랜드 조인 결과 타입
 */
export interface ProductWithBrand {
  id: string;
  name: string;
  name_ko: string | null;
  brand_id: string;
  brand_name: string;
  brand_name_ko: string | null;
}
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

  /**
   * 단일 상품 + 브랜드 조인 조회
   */
  async findByIdWithBrand(productId: string): Promise<ProductWithBrand | null> {
    try {
      // 1. 상품 조회
      const { data: product, error: productError } = await this.client
        .from(this.tableName)
        .select("id, name, name_ko, brand_id")
        .eq("id", productId)
        .single();

      if (productError || !product) {
        if (productError?.code !== "PGRST116") {
          logger.error(
            { error: productError?.message, productId },
            "[ProductsRepository] 상품 조회 실패",
          );
        }
        return null;
      }

      // 2. 브랜드 조회
      const { data: brand, error: brandError } = await this.client
        .from("brands")
        .select("id, name, name_ko")
        .eq("id", product.brand_id)
        .single();

      if (brandError) {
        logger.warn(
          { error: brandError.message, brandId: product.brand_id },
          "[ProductsRepository] 브랜드 조회 실패",
        );
      }

      return {
        id: product.id,
        name: product.name,
        name_ko: product.name_ko,
        brand_id: product.brand_id,
        brand_name: brand?.name || "",
        brand_name_ko: brand?.name_ko || null,
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          productId,
        },
        "[ProductsRepository] findByIdWithBrand 예외",
      );
      return null;
    }
  }

  /**
   * 상품 + 브랜드 조인 조회 (애플리케이션 레벨 조인)
   * DB에 FK 관계 미정의 시 별도 쿼리 후 매핑
   */
  async findAllWithBrand(options?: {
    limit?: number;
    offset?: number;
    brandLocale?: string;
  }): Promise<ProductWithBrand[]> {
    const limit = options?.limit || REPOSITORY_CONFIG.PAGINATION_PAGE_SIZE;
    const offset = options?.offset || 0;
    const brandLocale = options?.brandLocale;

    logger.info(
      { limit, offset, brandLocale },
      "[ProductsRepository] 상품+브랜드 조회 시작",
    );

    try {
      // brandLocale이 있으면 inner join으로 SQL 레벨에서 필터링
      if (brandLocale) {
        const { data: productsWithBrands, error } = await this.client
          .from(this.tableName)
          .select(
            "id, name, name_ko, brand_id, brands!inner(id, name, name_ko, locale)",
          )
          .eq("status", "PUBLISHED")
          .eq("brands.locale", brandLocale)
          .not("brand_id", "is", null)
          .not("name", "like", "%테스트%")
          .not("name", "like", "%매핑%")
          .range(offset, offset + limit - 1);

        if (error) {
          logger.error(
            { error: error.message, code: error.code },
            "[ProductsRepository] 상품+브랜드 조회 실패",
          );
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        if (!productsWithBrands || productsWithBrands.length === 0) {
          logger.info("[ProductsRepository] 조회된 상품 없음");
          return [];
        }

        // 결과 매핑 (inner join 결과는 단일 객체)
        const results: ProductWithBrand[] = productsWithBrands.map((p) => {
          const brandData = p.brands as unknown as {
            id: string;
            name: string;
            name_ko: string | null;
            locale: string;
          };
          return {
            id: p.id,
            name: p.name,
            name_ko: p.name_ko,
            brand_id: p.brand_id,
            brand_name: brandData?.name || "",
            brand_name_ko: brandData?.name_ko || null,
          };
        });

        logger.info(
          { count: results.length, brandLocale },
          "[ProductsRepository] 상품+브랜드 조회 완료",
        );

        return results;
      }

      // brandLocale 없으면 기존 로직
      const { data: products, error: productsError } = await this.client
        .from(this.tableName)
        .select("id, name, name_ko, brand_id")
        .eq("status", "PUBLISHED")
        .not("brand_id", "is", null)
        .not("name", "like", "%테스트%")
        .not("name", "like", "%매핑%")
        .range(offset, offset + limit - 1);

      if (productsError) {
        logger.error(
          { error: productsError.message, code: productsError.code },
          "[ProductsRepository] 상품 조회 실패",
        );
        throw new Error(`Supabase query failed: ${productsError.message}`);
      }

      if (!products || products.length === 0) {
        logger.info("[ProductsRepository] 조회된 상품 없음");
        return [];
      }

      // 브랜드 ID 추출
      const brandIds = [
        ...new Set(products.map((p) => p.brand_id).filter(Boolean)),
      ];

      // 브랜드 조회
      const { data: brands, error: brandsError } = await this.client
        .from("brands")
        .select("id, name, name_ko, locale")
        .in("id", brandIds);

      if (brandsError) {
        logger.error(
          { error: brandsError.message, code: brandsError.code },
          "[ProductsRepository] 브랜드 조회 실패",
        );
        throw new Error(`Supabase query failed: ${brandsError.message}`);
      }

      // 브랜드 맵 생성
      const brandMap = new Map<
        string,
        { name: string; name_ko: string | null }
      >();
      brands?.forEach((b) => {
        brandMap.set(b.id, { name: b.name, name_ko: b.name_ko });
      });

      // 결과 매핑
      const results: ProductWithBrand[] = products.map((p) => {
        const brand = brandMap.get(p.brand_id);
        return {
          id: p.id,
          name: p.name,
          name_ko: p.name_ko,
          brand_id: p.brand_id,
          brand_name: brand?.name || "",
          brand_name_ko: brand?.name_ko || null,
        };
      });

      logger.info(
        { count: results.length, brandLocale },
        "[ProductsRepository] 상품+브랜드 조회 완료",
      );

      return results;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[ProductsRepository] 조회 예외",
      );
      throw error;
    }
  }

  /**
   * 스크래핑이 필요한 상품 조회 (애플리케이션 레벨 조인)
   * - en_KR 브랜드 상품 중
   * - product_platform_listings에 없거나
   * - updated_at이 기준일 이전인 상품
   * - 처리된 상품은 updated_at 갱신되어 다음 조회에서 자동 제외됨
   */
  async findProductsNeedingScrape(options: {
    platformId: string;
    cutoffDate: string; // 'YYYY-MM-DD' 형식
    limit?: number;
  }): Promise<ProductWithBrand[]> {
    const { platformId, cutoffDate, limit = 50 } = options;

    logger.info(
      { platformId, cutoffDate, limit },
      "[ProductsRepository] 스크래핑 필요 상품 조회 시작",
    );

    try {
      // 1단계: 상품 조회
      const { data: allProducts, error: productsError } = await this.client
        .from(this.tableName)
        .select("id, name, name_ko, brand_id")
        .eq("status", "PUBLISHED")
        .not("brand_id", "is", null)
        .not("name", "like", "%테스트%")
        .not("name", "like", "%매핑%");

      if (productsError) {
        logger.error(
          { error: productsError.message },
          "[ProductsRepository] 상품 조회 실패",
        );
        throw new Error(`Supabase query failed: ${productsError.message}`);
      }

      if (!allProducts || allProducts.length === 0) {
        logger.info("[ProductsRepository] 조회된 상품 없음");
        return [];
      }

      // 2단계: 브랜드 조회 (en_KR만)
      const brandIds = [
        ...new Set(allProducts.map((p) => p.brand_id).filter(Boolean)),
      ];

      const { data: brands, error: brandsError } = await this.client
        .from("brands")
        .select("id, name, name_ko, locale")
        .in("id", brandIds)
        .eq("locale", "en_KR");

      if (brandsError) {
        logger.error(
          { error: brandsError.message },
          "[ProductsRepository] 브랜드 조회 실패",
        );
        throw new Error(`Supabase query failed: ${brandsError.message}`);
      }

      // 3단계: en_KR 브랜드 상품만 필터링
      const brandMap = new Map<
        string,
        { name: string; name_ko: string | null }
      >();
      const allowedBrandIds = new Set<string>();
      brands?.forEach((b) => {
        brandMap.set(b.id, { name: b.name, name_ko: b.name_ko });
        allowedBrandIds.add(b.id);
      });

      const enKrProducts = allProducts.filter((p) =>
        allowedBrandIds.has(p.brand_id),
      );

      if (enKrProducts.length === 0) {
        logger.info("[ProductsRepository] en_KR 브랜드 상품 없음");
        return [];
      }

      // 4단계: listings 조회 (최근 업데이트된 것만)
      const productIds = enKrProducts.map((p) => p.id);
      const { data: recentListings, error: listingsError } = await this.client
        .from("product_platform_listings")
        .select("product_id")
        .eq("platform_id", platformId)
        .in("product_id", productIds)
        .gte("updated_at", cutoffDate);

      if (listingsError) {
        logger.error(
          { error: listingsError.message },
          "[ProductsRepository] listings 조회 실패",
        );
        throw new Error(`Supabase query failed: ${listingsError.message}`);
      }

      // 5단계: 최근 업데이트된 상품 제외
      const recentProductIds = new Set(
        recentListings?.map((l) => l.product_id) || [],
      );

      const filteredProducts = enKrProducts.filter(
        (p) => !recentProductIds.has(p.id),
      );

      // 6단계: limit 적용 및 결과 매핑
      const results: ProductWithBrand[] = filteredProducts
        .slice(0, limit)
        .map((p) => {
          const brand = brandMap.get(p.brand_id);
          return {
            id: p.id,
            name: p.name,
            name_ko: p.name_ko,
            brand_id: p.brand_id,
            brand_name: brand?.name || "",
            brand_name_ko: brand?.name_ko || null,
          };
        });

      logger.info(
        {
          totalFetched: allProducts.length,
          enKrProducts: enKrProducts.length,
          recentlyUpdated: recentProductIds.size,
          needsScrape: results.length,
        },
        "[ProductsRepository] 스크래핑 필요 상품 조회 완료",
      );

      return results;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "[ProductsRepository] 스크래핑 필요 상품 조회 예외",
      );
      throw error;
    }
  }
}

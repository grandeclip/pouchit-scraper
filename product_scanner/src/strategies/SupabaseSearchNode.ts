/**
 * Supabase Search Node Strategy
 *
 * SOLID 원칙:
 * - SRP: Supabase 검색만 담당
 * - DIP: IProductSearchService 인터페이스에 의존
 * - Strategy Pattern: INodeStrategy 구현
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import { ProductSearchService } from "@/services/ProductSearchService";

/**
 * Supabase Search Node Config
 */
interface SupabaseSearchConfig {
  link_url_pattern?: string;
  sale_status?: string;
  limit?: number;
}

/**
 * Supabase Search Node Strategy
 */
export class SupabaseSearchNode implements INodeStrategy {
  public readonly type = "supabase_search";
  private service: IProductSearchService;

  constructor(service?: IProductSearchService) {
    // Dependency Injection
    this.service = service || new ProductSearchService();
  }

  /**
   * 노드 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { config, params } = context;

    // Config와 params 병합 (변수 치환)
    const searchConfig = this.mergeConfig(config, params);

    console.log(`[${this.type}] Searching products:`, searchConfig);

    try {
      // 검색 실행
      const products = await this.service.searchProducts({
        link_url_pattern: searchConfig.link_url_pattern,
        sale_status: searchConfig.sale_status,
        limit: searchConfig.limit || 100,
      });

      console.log(`[${this.type}] Found ${products.length} products`);

      return {
        success: true,
        data: {
          supabase_search: {
            products,
            count: products.length,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.type}] Search failed:`, message);

      return {
        success: false,
        data: {},
        error: {
          message,
          code: "SUPABASE_SEARCH_ERROR",
        },
      };
    }
  }

  /**
   * Config 검증
   */
  validateConfig(config: Record<string, unknown>): void {
    if (config.limit !== undefined) {
      // 템플릿 변수는 검증 스킵 (런타임에 치환됨)
      if (typeof config.limit === "string") {
        // 템플릿 변수 패턴 (${variable}) 확인
        if (!/^\$\{.+\}$/.test(config.limit)) {
          // 일반 문자열은 숫자로 파싱
          const limit = parseInt(config.limit, 10);
          if (isNaN(limit) || limit <= 0 || limit > 1000) {
            throw new Error("limit must be a positive number <= 1000");
          }
        }
      } else if (typeof config.limit === "number") {
        if (config.limit <= 0 || config.limit > 1000) {
          throw new Error("limit must be a positive number <= 1000");
        }
      } else {
        throw new Error("limit must be a number or template variable");
      }
    }

    if (
      config.sale_status !== undefined &&
      typeof config.sale_status !== "string"
    ) {
      throw new Error("sale_status must be a string");
    }

    if (
      config.link_url_pattern !== undefined &&
      typeof config.link_url_pattern !== "string"
    ) {
      throw new Error("link_url_pattern must be a string");
    }
  }

  /**
   * Config와 params 병합 (변수 치환)
   */
  private mergeConfig(
    config: Record<string, unknown>,
    params: Record<string, unknown>,
  ): SupabaseSearchConfig {
    const merged: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      merged[key] = this.substituteVariables(value, params);
    }

    // Type coercion: limit을 숫자로 변환
    if (merged.limit !== undefined && typeof merged.limit === "string") {
      merged.limit = parseInt(merged.limit, 10);
    }

    return merged as SupabaseSearchConfig;
  }

  /**
   * 변수 치환 (${variable} → 실제 값)
   */
  private substituteVariables(
    value: unknown,
    params: Record<string, unknown>,
  ): unknown {
    if (typeof value === "string") {
      return value.replace(/\$\{(\w+)\}/g, (_, key) => {
        const replacement = params[key];
        return replacement !== undefined ? String(replacement) : `\${${key}}`;
      });
    }

    return value;
  }
}

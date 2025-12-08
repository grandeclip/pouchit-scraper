/**
 * SearchConfig - Search YAML 설정 스키마
 *
 * SOLID 원칙:
 * - SRP: Search 설정 스키마 정의만 담당
 * - OCP: 전략별 설정 확장 가능
 */

import { z } from "zod";

/**
 * GraphQL 전략 설정 스키마
 */
export const GraphQLStrategySchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(["POST", "GET"]).default("POST"),
  headers: z.record(z.string()).default({}),
  query: z.string(),
  variables: z.record(z.unknown()),
  timeout: z.number().default(10000),
  retryCount: z.number().default(3),
  retryDelay: z.number().default(1000),
  requestDelay: z.number().optional(),
});

export type GraphQLStrategy = z.infer<typeof GraphQLStrategySchema>;

/**
 * Playwright API 인터셉트 전략 설정
 */
export const PlaywrightApiStrategySchema = z.object({
  headless: z.boolean().default(true),
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .default({ width: 390, height: 844 }),
  userAgent: z.string().optional(),
  isMobile: z.boolean().default(true),
  hasTouch: z.boolean().default(true),
  deviceScaleFactor: z.number().default(3),
});

export type PlaywrightApiStrategy = z.infer<typeof PlaywrightApiStrategySchema>;

/**
 * API 인터셉트 설정
 */
export const ApiInterceptConfigSchema = z.object({
  interceptPattern: z.string(),
  excludePattern: z.string().optional(),
  navigation: z.array(
    z.object({
      action: z.enum(["goto", "wait", "fill", "click", "press"]),
      url: z.string().optional(),
      selector: z.string().optional(),
      value: z.string().optional(),
      key: z.string().optional(),
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
      timeout: z.number().optional(),
    }),
  ),
  timeout: z.number().default(60000),
  responseTimeout: z.number().default(10000),
});

export type ApiInterceptConfig = z.infer<typeof ApiInterceptConfigSchema>;

/**
 * DOM 파싱 전략 설정
 */
export const DomParsingStrategySchema = z.object({
  headless: z.boolean().default(true),
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .default({ width: 390, height: 844 }),
  userAgent: z.string().optional(),
  isMobile: z.boolean().default(true),
  navigation: z.array(
    z.object({
      action: z.enum(["goto", "wait", "scroll"]),
      url: z.string().optional(),
      timeout: z.number().optional(),
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
    }),
  ),
  selectors: z.object({
    container: z.string(),
    item: z.string(),
    productId: z.string().optional(),
    productName: z.string(),
    brand: z.string().optional(),
    thumbnail: z.string().optional(),
    price: z.string().optional(),
    productUrl: z.string().optional(),
  }),
  timeout: z.number().default(30000),
});

export type DomParsingStrategy = z.infer<typeof DomParsingStrategySchema>;

/**
 * Search 전략 설정 스키마
 */
export const SearchStrategyConfigSchema = z.object({
  id: z.string(),
  type: z.enum(["graphql", "playwright_api", "dom"]),
  priority: z.number().default(1),
  description: z.string().optional(),
  graphql: GraphQLStrategySchema.optional(),
  playwright: PlaywrightApiStrategySchema.optional(),
  api: ApiInterceptConfigSchema.optional(),
  dom: DomParsingStrategySchema.optional(),
});

export type SearchStrategyConfig = z.infer<typeof SearchStrategyConfigSchema>;

/**
 * 필드 매핑 설정
 */
export const FieldMappingSchema = z.object({
  source: z.string(),
  type: z.enum(["string", "number", "boolean"]).default("string"),
  transform: z.string().optional(),
  required: z.boolean().default(false),
});

export type FieldMapping = z.infer<typeof FieldMappingSchema>;

/**
 * 에러 처리 설정
 */
export const ErrorHandlingSchema = z.object({
  rateLimitDelay: z.number().default(2000),
  serverErrorRetry: z.boolean().default(true),
  notFound: z.string().optional(),
});

export type ErrorHandling = z.infer<typeof ErrorHandlingSchema>;

/**
 * Search 플랫폼 설정 스키마 (YAML 전체)
 */
export const SearchConfigSchema = z.object({
  platform: z.string(),
  name: z.string(),
  baseUrl: z.string().url(),
  strategies: z.array(SearchStrategyConfigSchema),
  fieldMapping: z.record(FieldMappingSchema),
  errorHandling: ErrorHandlingSchema.optional(),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

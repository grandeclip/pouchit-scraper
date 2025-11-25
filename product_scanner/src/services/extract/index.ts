/**
 * Extract Service 모듈 Barrel Export
 */

// Interfaces
export type { IExtractService } from "./interfaces/IExtractService";

export type {
  ExtractServiceType,
  ExtractParams,
  ExtractByProductSetParams,
  ExtractByUrlParams,
  ExtractByIdParams,
} from "./interfaces/IExtractParams";

export type {
  ExtractResult,
  ExtractedProduct,
  ExtractError,
  ExtractErrorCode,
} from "./interfaces/IExtractResult";

// URL Utilities
export {
  PlatformDetector,
  SUPPORTED_PLATFORMS,
  type SupportedPlatform,
  type PlatformDetectionResult,
} from "./url/PlatformDetector";

export { UrlTemplateEngine } from "./url/UrlTemplateEngine";

// Services
export { ExtractByProductSetService } from "./ExtractByProductSetService";
export { ExtractByUrlService } from "./ExtractByUrlService";

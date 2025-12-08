/**
 * Platform Validation Config Barrel Export
 *
 * Phase 4 Step 4.9
 */

export {
  type UrlPattern,
  type ScanConfig,
  type IPlatformValidationConfig,
  type SupportedPlatform,
  PLATFORM_VALIDATION_CONFIGS,
  getPlatformConfig,
  detectPlatformFromUrl,
  extractProductIdFromUrl,
  buildProductDetailUrl,
  getSupportedPlatforms,
  isPlatformSupported,
} from "./PlatformValidationConfig";

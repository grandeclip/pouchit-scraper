/**
 * Extractors Module Entry Point
 */

// Registry
export { ExtractorRegistry } from "./ExtractorRegistry";

// Base Interfaces
export type { IProductExtractor, ProductData } from "./base/IProductExtractor";
export type { IPriceExtractor, PriceData } from "./base/IPriceExtractor";
export type {
  ISaleStatusExtractor,
  SaleStatusData,
  SaleStatus,
} from "./base/ISaleStatusExtractor";
export type {
  IMetadataExtractor,
  MetadataData,
} from "./base/IMetadataExtractor";

// Platform Extractors
export { OliveyoungExtractor } from "./oliveyoung/OliveyoungExtractor";
export { OliveyoungPriceExtractor } from "./oliveyoung/OliveyoungPriceExtractor";
export { OliveyoungSaleStatusExtractor } from "./oliveyoung/OliveyoungSaleStatusExtractor";
export { OliveyoungMetadataExtractor } from "./oliveyoung/OliveyoungMetadataExtractor";

// Common Helpers
export { DOMHelper } from "./common/DOMHelper";

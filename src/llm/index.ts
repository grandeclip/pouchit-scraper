/**
 * LLM 모듈 Barrel Export
 */

// Gemini API Client
export {
  fetchGeminiCompletion,
  GeminiApiClient,
  GeminiApiError,
} from "./GeminiApiClient";
export type {
  GeminiCompletionParams,
  GeminiApiResponse,
  IGeminiApiClient,
} from "./GeminiApiClient";

// Product Labeling Service
export {
  processProductLabeling,
  processProductLabelingWithUsage,
  normalizeProductName,
  extractLabel,
} from "./ProductLabelingService";
export type {
  ProductLabelingResult,
  ProductLabelingResultWithUsage,
  LlmUsageInfo,
} from "./ProductLabelingService";

// LLM Cost Logger
export {
  logLlmCost,
  logLlmCostBatch,
  getTodayTotalCost,
  getTodayCostStats,
} from "./LlmCostLogger";
export type {
  LlmCostRecord,
  LlmCostLogParams,
  LlmOperation,
} from "./LlmCostLogger";

// Postprocessors
export {
  applyNormalizePostprocessing,
  removeDuplicatesAndSort,
} from "./postprocessors/normalizePostprocessor";
export type {
  NormalizeResult,
  GiftItem,
} from "./postprocessors/normalizePostprocessor";

export {
  preprocessForLabel,
  extractLabelFromLlmResponse,
  postprocessLabel,
} from "./postprocessors/labelPostprocessor";
export type { LabelPreprocessResult } from "./postprocessors/labelPostprocessor";

// Prompts
export { normalizeProductPrompt } from "./prompts/normalizeProductPrompt";
export { classificationPrompt } from "./prompts/classificationPrompt";
export { productSetParsingPrompt } from "./prompts/productSetParsingPrompt";
export { productFilteringPrompt } from "./prompts/productFilteringPrompt";

// Google GenAI Client (공식 SDK)
export {
  GoogleGenAIClient,
  GoogleGenAIError,
  getGoogleGenAIClient,
} from "./GoogleGenAIClient";
export type {
  StructuredOutputParams,
  StructuredOutputResult,
  GenAIUsageMetadata,
} from "./GoogleGenAIClient";

// Schemas
export { ProductItemSchema, ProductSetParsingSchema } from "./schemas";
export type { ProductItem, ProductSetParsingResult } from "./schemas";
export { ProductFilteringSchema } from "./schemas";
export type { ProductFilteringResult, ProductFilteringInput } from "./schemas";

// Product Set Parsing Service
export {
  ProductSetParsingService,
  getProductSetParsingService,
  parseProductSet,
} from "./ProductSetParsingService";
export type {
  ProductSetParsingParams,
  ProductSetParsingResponse,
} from "./ProductSetParsingService";

// Product Set Postprocessor
export {
  buildProductSetColumns,
  createEmptyColumns,
} from "./postprocessors/productSetPostprocessor";
export type { ProductSetColumns } from "./postprocessors/productSetPostprocessor";

// Product Filtering Service
export {
  ProductFilteringService,
  getProductFilteringService,
  filterProducts,
  getValidProductNames,
} from "./ProductFilteringService";
export type {
  ProductFilteringParams,
  ProductFilteringResponse,
} from "./ProductFilteringService";

// Product Description Service (URL Context 기반)
export {
  ProductDescriptionService,
  getProductDescriptionService,
  generateProductDescription,
} from "./ProductDescriptionService";
export type {
  ProductDescriptionResponse,
  StageUsage,
} from "./ProductDescriptionService";

// Product Description Schema & Prompts
export {
  ProductDescriptionSchema,
  CategoryClassificationSchema,
} from "./schemas/ProductDescriptionSchema";
export type {
  ProductDescriptionResult,
  CategoryClassification,
  ProductDescriptionInput,
} from "./schemas/ProductDescriptionSchema";
export {
  buildExtractionPrompt,
  buildProductDescriptionSystemPrompt,
  buildStructuredOutputPrompt,
  buildProductDescriptionUserPrompt, // @deprecated
  productDescriptionSystemPrompt,
} from "./prompts/productDescriptionPrompt";

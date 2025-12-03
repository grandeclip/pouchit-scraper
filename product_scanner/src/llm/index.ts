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
export type { LlmCostRecord, LlmCostLogParams } from "./LlmCostLogger";

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

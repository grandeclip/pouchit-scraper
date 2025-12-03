/**
 * Product Labeling Service
 *
 * product_name으로부터 normalized_product_name과 label을 생성하는 서비스
 *
 * 처리 흐름:
 * 1. product_name → normalizeProductNameExtractVolume() → normalized_product_name
 * 2. normalized_product_name → extractLabel() → label
 */

import {
  fetchGeminiCompletion,
  fetchGeminiCompletionWithUsage,
} from "./GeminiApiClient";
import { normalizeProductPrompt } from "./prompts/normalizeProductPrompt";
import { classificationPrompt } from "./prompts/classificationPrompt";
import {
  NormalizeResult,
  applyNormalizePostprocessing,
} from "./postprocessors/normalizePostprocessor";
import {
  preprocessForLabel,
  extractLabelFromLlmResponse,
  postprocessLabel,
} from "./postprocessors/labelPostprocessor";

export interface ProductLabelingResult {
  /** 원본 제품명 */
  productName: string;
  /** 정규화된 제품명 (증정품/프로모션 정보) */
  normalizedProductName: string;
  /** 분류 라벨 (예: "단품", "1+1", "거울", "토너,에센스") */
  label: string;
}

/** LLM 사용량 정보 */
export interface LlmUsageInfo {
  /** 작업 유형 */
  operation: "normalize" | "label" | "full";
  /** 모델명 */
  model: string;
  /** 입력 토큰 수 */
  input_tokens: number;
  /** 출력 토큰 수 */
  output_tokens: number;
}

/** 비용 정보가 포함된 라벨링 결과 */
export interface ProductLabelingResultWithUsage extends ProductLabelingResult {
  /** LLM 사용량 정보 배열 (normalize + label 각각) */
  usages: LlmUsageInfo[];
  /** 총 입력 토큰 */
  totalInputTokens: number;
  /** 총 출력 토큰 */
  totalOutputTokens: number;
}

/**
 * 1단계: 제품명 정규화
 *
 * product_name에서 증정품/프로모션 정보를 추출하여 normalized_product_name 생성
 */
export async function normalizeProductName(
  productName: string,
): Promise<string> {
  const llmResult = await fetchGeminiCompletion<NormalizeResult>({
    model: "gemini-2.5-flash",
    systemPrompt: normalizeProductPrompt,
    userPrompt: `extract volume from the following product name: ${productName}`,
    thinkingBudget: 0,
  });

  // 후처리 적용
  const processed = applyNormalizePostprocessing(llmResult);

  return processed.normalizeProductName || "";
}

/**
 * 2단계: 라벨 추출
 *
 * normalized_product_name을 기반으로 label 분류
 */
export async function extractLabel(
  normalizedProductName: string,
): Promise<string> {
  // 전처리
  const preprocessed = preprocessForLabel(normalizedProductName);

  // LLM 호출 불필요한 경우 (빈 문자열, 단독 리필/1+1 등)
  if (preprocessed.skipLlmCall && preprocessed.directLabel) {
    return preprocessed.directLabel;
  }

  // LLM 호출
  const llmResult = await fetchGeminiCompletion<unknown>({
    model: "gemini-2.5-flash",
    systemPrompt: classificationPrompt,
    userPrompt: `분류할 제품명: ${preprocessed.processedName}`,
    thinkingBudget: 0,
  });

  // LLM 응답에서 라벨 추출
  const llmLabel = extractLabelFromLlmResponse(llmResult);

  // 후처리 (제거된 패턴 추가)
  return postprocessLabel(
    llmLabel,
    preprocessed.hasRefill,
    preprocessed.hasPromotion,
  );
}

/**
 * 전체 파이프라인: product_name → normalized_product_name + label
 */
export async function processProductLabeling(
  productName: string,
): Promise<ProductLabelingResult> {
  // 1단계: 제품명 정규화
  const normalizedProductName = await normalizeProductName(productName);

  // 2단계: 라벨 추출
  const label = await extractLabel(normalizedProductName);

  return {
    productName,
    normalizedProductName,
    label,
  };
}

/**
 * 전체 파이프라인 (비용 정보 포함): product_name → normalized_product_name + label + usage
 *
 * 비용 추적이 필요한 경우 이 함수를 사용합니다.
 */
export async function processProductLabelingWithUsage(
  productName: string,
): Promise<ProductLabelingResultWithUsage> {
  const usages: LlmUsageInfo[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // 1단계: 제품명 정규화 (with usage)
  const normalizeResponse =
    await fetchGeminiCompletionWithUsage<NormalizeResult>({
      model: "gemini-2.5-flash",
      systemPrompt: normalizeProductPrompt,
      userPrompt: `extract volume from the following product name: ${productName}`,
      thinkingBudget: 0,
    });

  const processed = applyNormalizePostprocessing(normalizeResponse.result);
  const normalizedProductName = processed.normalizeProductName || "";

  usages.push({
    operation: "normalize",
    model: normalizeResponse.model,
    input_tokens: normalizeResponse.usage.promptTokenCount,
    output_tokens: normalizeResponse.usage.candidatesTokenCount,
  });
  totalInputTokens += normalizeResponse.usage.promptTokenCount;
  totalOutputTokens += normalizeResponse.usage.candidatesTokenCount;

  // 2단계: 라벨 추출 (with usage)
  const preprocessed = preprocessForLabel(normalizedProductName);
  let label: string;

  if (preprocessed.skipLlmCall && preprocessed.directLabel) {
    // LLM 호출 불필요한 경우
    label = preprocessed.directLabel;
  } else {
    // LLM 호출 필요
    const labelResponse = await fetchGeminiCompletionWithUsage<unknown>({
      model: "gemini-2.5-flash",
      systemPrompt: classificationPrompt,
      userPrompt: `분류할 제품명: ${preprocessed.processedName}`,
      thinkingBudget: 0,
    });

    const llmLabel = extractLabelFromLlmResponse(labelResponse.result);
    label = postprocessLabel(
      llmLabel,
      preprocessed.hasRefill,
      preprocessed.hasPromotion,
    );

    usages.push({
      operation: "label",
      model: labelResponse.model,
      input_tokens: labelResponse.usage.promptTokenCount,
      output_tokens: labelResponse.usage.candidatesTokenCount,
    });
    totalInputTokens += labelResponse.usage.promptTokenCount;
    totalOutputTokens += labelResponse.usage.candidatesTokenCount;
  }

  return {
    productName,
    normalizedProductName,
    label,
    usages,
    totalInputTokens,
    totalOutputTokens,
  };
}

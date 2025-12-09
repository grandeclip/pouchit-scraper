/**
 * Product Description Service
 *
 * URL Context를 활용한 상품 설명 및 카테고리 생성 서비스
 *
 * Gemini 2.5 Flash 2단계 호출 방식:
 * 1단계: URL Context로 정보 추출 (텍스트)
 * 2단계: Structured Output으로 정형화 (JSON)
 *
 * @note URL Context + Structured Output 동시 사용 불가 (Gemini 2.5 제약)
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Schema } from "@google/genai";
import { logger } from "@/config/logger";
import {
  ProductDescriptionSchema,
  type ProductDescriptionResult,
  type ProductDescriptionInput,
} from "@/llm/schemas/ProductDescriptionSchema";
import {
  buildExtractionPrompt,
  buildProductDescriptionSystemPrompt,
  buildStructuredOutputPrompt,
} from "@/llm/prompts/productDescriptionPrompt";

// ============================================
// 설정
// ============================================

const MODEL = "gemini-2.5-flash";
const THINKING_BUDGET = 0;

/** Gemini 2.5 Flash 가격 (2024-12 기준) */
const PRICING = {
  inputPer1M: 0.15,
  outputPer1M: 0.6,
};

// ============================================
// 타입 정의
// ============================================

/** 단계별 사용량 정보 */
export interface StageUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  toolUsePromptTokenCount: number;
}

/** 서비스 응답 타입 */
export interface ProductDescriptionResponse {
  /** 생성 결과 */
  result: ProductDescriptionResult;
  /** 1단계 사용량 (URL Context) */
  stage1Usage: StageUsage;
  /** 2단계 사용량 (Structured Output) */
  stage2Usage: StageUsage;
  /** 총 사용량 */
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    urlContextTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  /** 사용 모델 */
  model: string;
  /** 소요 시간 (ms) */
  durationMs: number;
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * Zod 스키마를 Gemini responseSchema 형식으로 변환
 */
function convertToResponseSchema(zodSchema: z.ZodTypeAny): Schema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = zodToJsonSchema(zodSchema as any, {
    $refStrategy: "none",
    target: "openApi3",
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...schemaWithoutMeta } = jsonSchema as Record<
    string,
    unknown
  >;
  return schemaWithoutMeta as Schema;
}

/**
 * 비용 계산
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICING.inputPer1M +
    (outputTokens / 1_000_000) * PRICING.outputPer1M
  );
}

// ============================================
// 서비스 클래스
// ============================================

export class ProductDescriptionService {
  private client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * 상품 설명 생성 (2단계 호출)
   */
  async generate(
    input: ProductDescriptionInput,
  ): Promise<ProductDescriptionResponse> {
    const startTime = Date.now();

    logger.info(
      {
        brand: input.brand,
        product_name: input.product_name,
        url_count: input.urls.length,
      },
      "[ProductDescriptionService] 상품 설명 생성 시작",
    );

    // 1단계: URL Context로 정보 추출
    const stage1Result = await this.extractInfoWithUrlContext(input);

    // 2단계: Structured Output 생성
    const stage2Result = await this.generateStructuredOutput(
      input,
      stage1Result.text,
    );

    const durationMs = Date.now() - startTime;

    // 총 사용량 계산
    const inputTokens =
      stage1Result.usage.promptTokenCount + stage2Result.usage.promptTokenCount;
    const outputTokens =
      stage1Result.usage.candidatesTokenCount +
      stage2Result.usage.candidatesTokenCount;
    const urlContextTokens = stage1Result.usage.toolUsePromptTokenCount;
    const effectiveInput = inputTokens + urlContextTokens;

    const response: ProductDescriptionResponse = {
      result: stage2Result.result,
      stage1Usage: stage1Result.usage,
      stage2Usage: stage2Result.usage,
      totalUsage: {
        inputTokens,
        outputTokens,
        urlContextTokens,
        totalTokens: effectiveInput + outputTokens,
        costUsd: calculateCost(effectiveInput, outputTokens),
      },
      model: MODEL,
      durationMs,
    };

    logger.info(
      {
        brand: input.brand,
        category_id: response.result.category.id,
        total_tokens: response.totalUsage.totalTokens,
        cost_usd: response.totalUsage.costUsd,
        duration_ms: durationMs,
      },
      "[ProductDescriptionService] 상품 설명 생성 완료",
    );

    return response;
  }

  /**
   * 1단계: URL Context로 정보 추출
   */
  private async extractInfoWithUrlContext(
    input: ProductDescriptionInput,
  ): Promise<{ text: string; usage: StageUsage }> {
    const extractionPrompt = buildExtractionPrompt(
      input.brand,
      input.product_name,
      input.urls,
    );

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: extractionPrompt,
      config: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 4096,
        tools: [{ urlContext: {} }],
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    });

    const text = response.text ?? "";
    const rawUsage = response.usageMetadata;

    const usage: StageUsage = {
      promptTokenCount: rawUsage?.promptTokenCount ?? 0,
      candidatesTokenCount: rawUsage?.candidatesTokenCount ?? 0,
      totalTokenCount: rawUsage?.totalTokenCount ?? 0,
      toolUsePromptTokenCount:
        ((rawUsage as Record<string, unknown>)
          ?.toolUsePromptTokenCount as number) ?? 0,
    };

    return { text, usage };
  }

  /**
   * 2단계: Structured Output 생성
   */
  private async generateStructuredOutput(
    input: ProductDescriptionInput,
    extractedInfo: string,
  ): Promise<{ result: ProductDescriptionResult; usage: StageUsage }> {
    const systemPrompt = buildProductDescriptionSystemPrompt();
    const userPrompt = buildStructuredOutputPrompt(
      input.brand,
      input.product_name,
      extractedInfo,
    );

    const structuredPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const responseSchema = convertToResponseSchema(ProductDescriptionSchema);

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: structuredPrompt,
      config: {
        temperature: 0.1,
        topP: 0.95,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("API 응답에 텍스트가 없습니다.");
    }

    const result: ProductDescriptionResult = JSON.parse(responseText);
    const rawUsage = response.usageMetadata;

    const usage: StageUsage = {
      promptTokenCount: rawUsage?.promptTokenCount ?? 0,
      candidatesTokenCount: rawUsage?.candidatesTokenCount ?? 0,
      totalTokenCount: rawUsage?.totalTokenCount ?? 0,
      toolUsePromptTokenCount: 0, // 2단계는 URL Context 미사용
    };

    return { result, usage };
  }
}

// ============================================
// 싱글톤 및 헬퍼 함수
// ============================================

let serviceInstance: ProductDescriptionService | null = null;

/**
 * ProductDescriptionService 싱글톤 인스턴스 반환
 */
export function getProductDescriptionService(): ProductDescriptionService {
  if (!serviceInstance) {
    serviceInstance = new ProductDescriptionService();
  }
  return serviceInstance;
}

/**
 * 상품 설명 생성 헬퍼 함수
 */
export async function generateProductDescription(
  input: ProductDescriptionInput,
): Promise<ProductDescriptionResponse> {
  const service = getProductDescriptionService();
  return service.generate(input);
}

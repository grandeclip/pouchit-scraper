/**
 * Google GenAI SDK 클라이언트
 *
 * @google/genai 공식 SDK를 사용하는 클라이언트
 * - Structured Output (responseSchema) 지원
 * - Zod 스키마 → JSON Schema 변환
 */

import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import { logger } from "@/config/logger";

// ============================================
// 상수 정의
// ============================================

/** 기본 모델명 */
const DEFAULT_MODEL = "gemini-2.5-flash";

/** 기본 temperature */
const DEFAULT_TEMPERATURE = 0.1;

/** 기본 topP */
const DEFAULT_TOP_P = 0.95;

/** 기본 최대 출력 토큰 수 */
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

// ============================================
// 인터페이스 정의
// ============================================

/** 기본 thinking budget (0 = 비활성화) */
const DEFAULT_THINKING_BUDGET = 0;

/**
 * Structured Output 요청 파라미터
 */
export interface StructuredOutputParams<T> {
  /** 사용할 Gemini 모델 */
  model?: string;
  /** 시스템 프롬프트 */
  systemPrompt?: string;
  /** 사용자 프롬프트 */
  userPrompt: string;
  /** Zod 스키마 (responseSchema로 변환됨) */
  schema: ZodTypeAny;
  /** temperature (0.0-2.0) */
  temperature?: number;
  /** topP (0.0-1.0) */
  topP?: number;
  /** 최대 출력 토큰 수 */
  maxOutputTokens?: number;
  /** Thinking budget (0 = 비활성화, 기본값: 0) */
  thinkingBudget?: number;
}

/**
 * 사용량 메타데이터
 */
export interface GenAIUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

/**
 * Structured Output 응답 (사용량 포함)
 */
export interface StructuredOutputResult<T> {
  result: T;
  usage: GenAIUsageMetadata;
  model: string;
}

// ============================================
// 에러 클래스
// ============================================

export class GoogleGenAIError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GoogleGenAIError";
  }
}

// ============================================
// 클라이언트 클래스
// ============================================

/**
 * Google GenAI 클라이언트
 *
 * @google/genai SDK를 사용하여 Structured Output을 지원합니다.
 */
export class GoogleGenAIClient {
  private client: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GEMINI_API_KEY;

    if (!key) {
      throw new GoogleGenAIError(
        "GEMINI_API_KEY가 환경변수에 설정되지 않았습니다.",
      );
    }

    this.client = new GoogleGenAI({ apiKey: key });
  }

  /**
   * Zod 스키마를 Gemini responseSchema 형식으로 변환
   */
  private convertZodToResponseSchema(zodSchema: ZodTypeAny): Schema {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = zodToJsonSchema(zodSchema as any, {
      $refStrategy: "none",
      target: "openApi3",
    });

    // zodToJsonSchema 결과에서 불필요한 필드 제거
    const { $schema, ...schemaWithoutMeta } = jsonSchema as Record<
      string,
      unknown
    >;

    return schemaWithoutMeta as Schema;
  }

  /**
   * Structured Output으로 콘텐츠 생성
   *
   * @param params 요청 파라미터
   * @returns 파싱된 결과와 사용량 메타데이터
   */
  async generateStructuredOutput<T>(
    params: StructuredOutputParams<T>,
  ): Promise<StructuredOutputResult<T>> {
    const {
      model = DEFAULT_MODEL,
      systemPrompt,
      userPrompt,
      schema,
      temperature = DEFAULT_TEMPERATURE,
      topP = DEFAULT_TOP_P,
      maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
      thinkingBudget = DEFAULT_THINKING_BUDGET,
    } = params;

    if (!userPrompt) {
      throw new GoogleGenAIError("userPrompt는 반드시 제공되어야 합니다.");
    }

    const responseSchema = this.convertZodToResponseSchema(schema);

    // 프롬프트 결합
    const contents = systemPrompt
      ? `${systemPrompt}\n\n${userPrompt}`
      : userPrompt;

    // Gemini 2.5 모델 thinking mode 지원 여부
    const supportsThinking = model.includes("2.5");

    logger.debug(
      { model, temperature, topP, maxOutputTokens, thinkingBudget },
      "[GoogleGenAI] API 호출 시작",
    );

    try {
      const response = await this.client.models.generateContent({
        model,
        contents,
        config: {
          temperature,
          topP,
          maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema,
          ...(supportsThinking && {
            thinkingConfig: { thinkingBudget },
          }),
        },
      });

      // 응답 텍스트 추출
      const responseText = response.text;

      if (!responseText) {
        throw new GoogleGenAIError("API 응답에 텍스트가 없습니다.");
      }

      // JSON 파싱
      const result = JSON.parse(responseText) as T;

      // 사용량 메타데이터 추출
      const usage: GenAIUsageMetadata = {
        promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount ?? 0,
      };

      logger.debug(
        {
          input_tokens: usage.promptTokenCount,
          output_tokens: usage.candidatesTokenCount,
        },
        "[GoogleGenAI] API 호출 성공",
      );

      return { result, usage, model };
    } catch (err) {
      if (err instanceof GoogleGenAIError) {
        throw err;
      }

      const error = new GoogleGenAIError(
        `Gemini API 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
      logger.error({ err: error }, "[GoogleGenAI] API 호출 실패");
      throw error;
    }
  }
}

// ============================================
// 싱글톤 인스턴스 (편의용)
// ============================================

let defaultClient: GoogleGenAIClient | null = null;

/**
 * 기본 GoogleGenAI 클라이언트 인스턴스 반환
 */
export function getGoogleGenAIClient(): GoogleGenAIClient {
  if (!defaultClient) {
    defaultClient = new GoogleGenAIClient();
  }
  return defaultClient;
}

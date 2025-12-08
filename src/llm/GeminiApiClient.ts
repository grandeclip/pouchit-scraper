/**
 * Google Gemini API Client
 *
 * Gemini REST API를 직접 호출하여 JSON 응답을 반환하는 클라이언트
 * - 모델: gemini-2.5-flash (기본값)
 * - thinkingBudget: 0 (thinking 비활성화)
 * - responseMimeType: application/json
 */

import { logger } from "@/config/logger";

// ============================================
// 상수 정의
// ============================================

/** 기본 Gemini API Base URL */
const DEFAULT_GEMINI_API_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

/** 기본 모델명 */
const DEFAULT_MODEL = "gemini-2.5-flash";

/** 기본 temperature (응답 창의성, 0.0-2.0) */
const DEFAULT_TEMPERATURE = 0.1;

/** 기본 topP (토큰 선택 범위, 0.0-1.0) */
const DEFAULT_TOP_P = 0.95;

/** 기본 최대 출력 토큰 수 */
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/** 기본 thinking budget (0 = 비활성화) */
const DEFAULT_THINKING_BUDGET = 0;

// ============================================
// 인터페이스 정의
// ============================================

export interface GeminiCompletionParams {
  /** 사용할 Gemini 모델 (기본값: gemini-2.5-flash) */
  model?: string;
  /** 시스템 프롬프트 (역할 및 지시사항) */
  systemPrompt?: string;
  /** 사용자 프롬프트 (실제 요청) */
  userPrompt: string;
  /** 응답의 창의성 조절 (0.0 - 2.0, 기본값: 0.1) */
  temperature?: number;
  /** 토큰 선택 범위 조절 (0.0 - 1.0, 기본값: 0.95) */
  topP?: number;
  /** 최대 출력 토큰 수 (기본값: 8192) */
  maxOutputTokens?: number;
  /** Thinking mode budget (0으로 설정하면 thinking 비활성화, 기본값: 0) */
  thinkingBudget?: number;
}

/** Gemini API 토큰 사용량 메타데이터 */
export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  promptTokensDetails?: Array<{
    modality: string;
    tokenCount: number;
  }>;
}

export interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

/** 비용 정보가 포함된 응답 */
export interface GeminiCompletionWithUsage<T = unknown> {
  result: T;
  usage: GeminiUsageMetadata;
  model: string;
}

/**
 * Gemini API 클라이언트 인터페이스
 *
 * 테스트 및 DI를 위한 인터페이스 정의
 */
export interface IGeminiApiClient {
  fetchCompletion<T = unknown>(params: GeminiCompletionParams): Promise<T>;
}

// ============================================
// 에러 클래스
// ============================================

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: unknown,
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

// ============================================
// API 함수
// ============================================

/**
 * Gemini API Base URL 조회
 */
function getApiBaseUrl(): string {
  return process.env.GEMINI_API_BASE_URL || DEFAULT_GEMINI_API_BASE_URL;
}

/** 내부 API 호출 결과 (raw response + parsed result) */
interface GeminiRawResult<T> {
  result: T;
  usage: GeminiUsageMetadata;
  model: string;
}

/**
 * Gemini API 공통 호출 로직 (내부 함수)
 *
 * API 호출, 응답 검증, JSON 파싱을 수행합니다.
 */
async function fetchGeminiCompletionInternal<T = unknown>(
  params: GeminiCompletionParams,
  logSuffix = "",
): Promise<GeminiRawResult<T>> {
  const {
    model = DEFAULT_MODEL,
    systemPrompt,
    userPrompt,
    temperature = DEFAULT_TEMPERATURE,
    topP = DEFAULT_TOP_P,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
    thinkingBudget = DEFAULT_THINKING_BUDGET,
  } = params;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new GeminiApiError(
      "GEMINI_API_KEY가 환경변수에 설정되지 않았습니다.",
    );
    logger.error({ err: error }, "[GeminiAPI] API 키 미설정");
    throw error;
  }

  if (!userPrompt) {
    const error = new GeminiApiError("userPrompt는 반드시 제공되어야 합니다.");
    logger.error({ err: error }, "[GeminiAPI] userPrompt 누락");
    throw error;
  }

  const baseUrl = getApiBaseUrl();
  const apiUrl = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  // systemPrompt와 userPrompt 결합
  const combinedPrompt = systemPrompt
    ? `${systemPrompt}\n\n${userPrompt}`
    : userPrompt;

  // Gemini 2.5 모델 thinking mode 지원 여부
  const supportsThinking = model.includes("2.5");

  // generationConfig 구성
  const generationConfig: Record<string, unknown> = {
    temperature,
    topP,
    maxOutputTokens,
    responseMimeType: "application/json",
  };

  if (supportsThinking) {
    generationConfig.thinkingConfig = {
      thinkingBudget,
    };
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: combinedPrompt,
          },
        ],
      },
    ],
    generationConfig,
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ],
  };

  logger.debug(
    { model, temperature, topP, maxOutputTokens, thinkingBudget },
    `[GeminiAPI] API 호출 시작${logSuffix}`,
  );

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const error = new GeminiApiError(
      `Gemini API 네트워크 오류: ${err instanceof Error ? err.message : String(err)}`,
    );
    logger.error({ err: error }, "[GeminiAPI] 네트워크 오류");
    throw error;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new GeminiApiError(
      `Gemini API 요청 실패: ${response.status} ${response.statusText}`,
      response.status,
      errorData,
    );
    logger.error(
      { err: error, statusCode: response.status, errorData },
      "[GeminiAPI] API 요청 실패",
    );
    throw error;
  }

  const data: GeminiApiResponse = await response.json();

  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    const error = new GeminiApiError(
      "Gemini API 응답 형식이 올바르지 않습니다.",
      undefined,
      data,
    );
    logger.error({ err: error, response: data }, "[GeminiAPI] 응답 형식 오류");
    throw error;
  }

  const responseText = data.candidates[0].content.parts[0].text;

  // usageMetadata 추출 (없으면 기본값)
  const usage: GeminiUsageMetadata = data.usageMetadata ?? {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  };

  // JSON 파싱 시도
  try {
    const result = JSON.parse(responseText) as T;
    logger.debug(
      {
        input_tokens: usage.promptTokenCount,
        output_tokens: usage.candidatesTokenCount,
      },
      `[GeminiAPI] API 호출 성공${logSuffix}`,
    );
    return { result, usage, model };
  } catch {
    // 마크다운 코드블록 제거 후 재시도
    const codeBlockMatch = responseText.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/i,
    );
    if (codeBlockMatch) {
      const result = JSON.parse(codeBlockMatch[1]) as T;
      logger.debug(`[GeminiAPI] 코드블록에서 JSON 파싱 성공${logSuffix}`);
      return { result, usage, model };
    }

    const error = new GeminiApiError(
      `Gemini 응답을 JSON으로 파싱할 수 없습니다: ${responseText.substring(0, 200)}...`,
    );
    logger.error(
      { err: error, responseText: responseText.substring(0, 500) },
      "[GeminiAPI] JSON 파싱 실패",
    );
    throw error;
  }
}

/**
 * Gemini API 호출 및 JSON 응답 반환
 */
export async function fetchGeminiCompletion<T = unknown>(
  params: GeminiCompletionParams,
): Promise<T> {
  const { result } = await fetchGeminiCompletionInternal<T>(params);
  return result;
}

/**
 * Gemini API 호출 및 JSON 응답 + 사용량 메타데이터 반환
 *
 * 비용 추적이 필요한 경우 이 함수를 사용합니다.
 */
export async function fetchGeminiCompletionWithUsage<T = unknown>(
  params: GeminiCompletionParams,
): Promise<GeminiCompletionWithUsage<T>> {
  return fetchGeminiCompletionInternal<T>(params, " (with usage)");
}

// ============================================
// 클래스 기반 클라이언트 (DI용)
// ============================================

/**
 * Gemini API 클라이언트 클래스
 *
 * DI 및 테스트 목 생성을 위한 클래스 기반 구현
 */
export class GeminiApiClient implements IGeminiApiClient {
  async fetchCompletion<T = unknown>(
    params: GeminiCompletionParams,
  ): Promise<T> {
    return fetchGeminiCompletion<T>(params);
  }

  async fetchCompletionWithUsage<T = unknown>(
    params: GeminiCompletionParams,
  ): Promise<GeminiCompletionWithUsage<T>> {
    return fetchGeminiCompletionWithUsage<T>(params);
  }
}

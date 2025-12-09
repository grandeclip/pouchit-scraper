/**
 * Gemini API 에러 파싱 유틸리티
 *
 * Gemini API 에러를 파싱하여 클라이언트에 안전하게 전달할 수 있는 형태로 변환
 * - 내부 정보 노출 방지 (API 키, 내부 경로 등)
 * - 재시도 가능 여부 판단
 * - 일관된 에러 코드 제공
 */

/**
 * Gemini API 에러 정보
 */
export interface GeminiErrorInfo {
  /** 에러 코드 */
  code: string;
  /** 클라이언트에 전달할 안전한 메시지 */
  message: string;
  /** 재시도 가능 여부 */
  retryable: boolean;
  /** 원본 에러 메시지 (로깅용, 클라이언트 미전달) */
  originalMessage?: string;
}

/**
 * 에러 코드별 안전한 메시지 정의
 */
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  INVALID_ARGUMENT: "요청 형식이 올바르지 않습니다",
  PERMISSION_DENIED: "API 인증에 실패했습니다",
  RATE_LIMIT_EXCEEDED: "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요",
  INTERNAL_ERROR: "AI 서비스에 일시적인 오류가 발생했습니다",
  SERVICE_UNAVAILABLE: "AI 서비스가 일시적으로 이용 불가합니다",
  UNKNOWN_ERROR: "알 수 없는 오류가 발생했습니다",
};

/**
 * 민감 정보 패턴 (제거 대상)
 */
const SENSITIVE_PATTERNS = [
  /api[_-]?key[=:]\s*["']?[\w-]+["']?/gi,
  /key[=:]\s*["']?AIza[\w-]+["']?/gi,
  /\/home\/[\w/]+/gi,
  /\/Users\/[\w/]+/gi,
  /\/app\/[\w/]+/gi,
  /at\s+[\w.]+\s+\(.*:\d+:\d+\)/gi, // stack trace
  /Bearer\s+[\w.-]+/gi,
  /Authorization[=:]\s*["']?[\w.-]+["']?/gi,
];

/**
 * 민감 정보 제거
 *
 * @param message 원본 메시지
 * @returns 민감 정보가 제거된 메시지
 */
export function sanitizeMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

/**
 * Gemini API 에러 파싱
 *
 * @param error 에러 객체
 * @returns 파싱된 에러 정보
 */
export function parseGeminiError(error: unknown): GeminiErrorInfo {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const sanitizedOriginal = sanitizeMessage(errorMessage);

  // HTTP 상태 코드 기반 에러 분류
  if (
    errorMessage.includes("400") ||
    errorMessage.includes("INVALID_ARGUMENT")
  ) {
    return {
      code: "INVALID_ARGUMENT",
      message: SAFE_ERROR_MESSAGES.INVALID_ARGUMENT,
      retryable: false,
      originalMessage: sanitizedOriginal,
    };
  }

  if (
    errorMessage.includes("403") ||
    errorMessage.includes("PERMISSION_DENIED")
  ) {
    return {
      code: "PERMISSION_DENIED",
      message: SAFE_ERROR_MESSAGES.PERMISSION_DENIED,
      retryable: false,
      originalMessage: sanitizedOriginal,
    };
  }

  if (
    errorMessage.includes("429") ||
    errorMessage.includes("RESOURCE_EXHAUSTED")
  ) {
    return {
      code: "RATE_LIMIT_EXCEEDED",
      message: SAFE_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
      retryable: true,
      originalMessage: sanitizedOriginal,
    };
  }

  if (errorMessage.includes("500") || errorMessage.includes("INTERNAL")) {
    return {
      code: "INTERNAL_ERROR",
      message: SAFE_ERROR_MESSAGES.INTERNAL_ERROR,
      retryable: true,
      originalMessage: sanitizedOriginal,
    };
  }

  if (errorMessage.includes("503") || errorMessage.includes("UNAVAILABLE")) {
    return {
      code: "SERVICE_UNAVAILABLE",
      message: SAFE_ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      retryable: true,
      originalMessage: sanitizedOriginal,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: SAFE_ERROR_MESSAGES.UNKNOWN_ERROR,
    retryable: false,
    originalMessage: sanitizedOriginal,
  };
}

/**
 * 클라이언트 응답용 에러 객체 생성
 *
 * @param errorInfo 파싱된 에러 정보
 * @returns 클라이언트에 전달할 에러 객체
 */
export function toClientError(
  errorInfo: GeminiErrorInfo,
): Pick<GeminiErrorInfo, "code" | "message"> {
  return {
    code: errorInfo.code,
    message: errorInfo.message,
  };
}

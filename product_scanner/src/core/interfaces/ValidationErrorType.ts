/**
 * Validation Error Type Enum
 *
 * 목적:
 * - 검증 실패 원인 세분화
 * - 에러별 로깅 전략 차별화
 * - 재시도 로직 결정
 *
 * SOLID 원칙:
 * - SRP: 에러 타입 정의만 담당
 * - OCP: 새로운 에러 타입 추가 가능
 */

/**
 * Validation 에러 타입
 */
export enum ValidationErrorType {
  /** 네트워크 에러 (타임아웃, 연결 실패) */
  NETWORK_ERROR = "NETWORK_ERROR",

  /** Cloudflare 차단 */
  CLOUDFLARE_BLOCKED = "CLOUDFLARE_BLOCKED",

  /** 상품 없음 (삭제됨, 판매중지) */
  PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND",

  /** 데이터 추출 실패 (DOM 파싱, API 응답 파싱) */
  EXTRACTION_FAILED = "EXTRACTION_FAILED",

  /** Browser/Page 에러 (크래시, Context 생성 실패) */
  BROWSER_ERROR = "BROWSER_ERROR",

  /** 알 수 없는 에러 */
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Validation Error 클래스
 */
export class ValidationError extends Error {
  public readonly type: ValidationErrorType;
  public readonly productId?: string;
  public readonly platform?: string;
  public readonly retryable: boolean;
  public readonly errorCause?: Error; // Error cause chain

  constructor(
    type: ValidationErrorType,
    message: string,
    options?: {
      productId?: string;
      platform?: string;
      retryable?: boolean;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = "ValidationError";
    this.type = type;
    this.productId = options?.productId;
    this.platform = options?.platform;
    this.retryable = options?.retryable ?? false;
    this.errorCause = options?.cause;
  }

  /**
   * 로그용 객체 변환
   */
  toLogObject(): Record<string, unknown> {
    return {
      errorType: this.type,
      message: this.message,
      productId: this.productId,
      platform: this.platform,
      retryable: this.retryable,
      stack: this.stack,
    };
  }

  /**
   * 에러 메시지로부터 타입 추론 (Helper)
   */
  static inferTypeFromMessage(message: string): ValidationErrorType {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("econnrefused")
    ) {
      return ValidationErrorType.NETWORK_ERROR;
    }

    if (
      lowerMessage.includes("cloudflare") ||
      lowerMessage.includes("just a moment")
    ) {
      return ValidationErrorType.CLOUDFLARE_BLOCKED;
    }

    if (
      lowerMessage.includes("not found") ||
      lowerMessage.includes("삭제된 상품") ||
      lowerMessage.includes("판매중지")
    ) {
      return ValidationErrorType.PRODUCT_NOT_FOUND;
    }

    if (
      lowerMessage.includes("extraction") ||
      lowerMessage.includes("parse") ||
      lowerMessage.includes("추출")
    ) {
      return ValidationErrorType.EXTRACTION_FAILED;
    }

    if (
      lowerMessage.includes("browser") ||
      lowerMessage.includes("context") ||
      lowerMessage.includes("page")
    ) {
      return ValidationErrorType.BROWSER_ERROR;
    }

    return ValidationErrorType.UNKNOWN_ERROR;
  }

  /**
   * 재시도 가능 여부 판단 (Helper)
   */
  static isRetryable(type: ValidationErrorType): boolean {
    switch (type) {
      case ValidationErrorType.NETWORK_ERROR:
      case ValidationErrorType.BROWSER_ERROR:
        return true; // 재시도 가능

      case ValidationErrorType.CLOUDFLARE_BLOCKED:
      case ValidationErrorType.PRODUCT_NOT_FOUND:
      case ValidationErrorType.EXTRACTION_FAILED:
      case ValidationErrorType.UNKNOWN_ERROR:
        return false; // 재시도 불가

      default:
        return false;
    }
  }
}

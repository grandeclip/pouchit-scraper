/**
 * Typed Node Strategy Interface (Phase 4)
 *
 * SOLID 원칙:
 * - SRP: 타입 안전한 노드 실행 인터페이스
 * - ISP: 입출력 타입이 명확한 인터페이스
 * - DIP: 제네릭 추상화에 의존
 *
 * 목적:
 * - 노드 간 데이터 전달 타입 안전성
 * - 파이프라인 구성 시 타입 검증
 * - IDE 자동완성 지원
 */

import { INodeContext } from "./INodeContext";

/**
 * 에러 정보 타입
 */
export interface INodeError {
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Typed Node Result (제네릭)
 *
 * 기존 NodeResult와 호환되면서 타입 안전성 추가
 *
 * 사용 패턴:
 * - 성공 시: { success: true, data: TOutput }
 * - 실패 시: { success: false, data: {} as TOutput, error: INodeError }
 *
 * Note: 실패 시 data는 빈 객체로 설정됨 (하위 호환성)
 * 실패 케이스에서는 반드시 success 체크 후 error 사용 권장
 */
export interface ITypedNodeResult<TOutput> {
  /** 실행 성공 여부 */
  success: boolean;

  /**
   * 출력 데이터 (타입 지정)
   * - success=true: 유효한 TOutput
   * - success=false: 빈 객체 (하위 호환성 유지)
   */
  data: TOutput;

  /** 에러 정보 (실패 시에만 존재) */
  error?: INodeError;

  /** 다음 Node ID 목록 오버라이드 (선택적, DAG 구조 지원) */
  next_nodes?: string[];
}

/**
 * Validation 결과
 */
export interface IValidationResult {
  /** 유효성 여부 */
  valid: boolean;

  /** 에러 목록 */
  errors: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
}

/**
 * Typed Node Strategy Interface (제네릭)
 *
 * Phase 4 노드의 기본 인터페이스
 * - TInput: 입력 데이터 타입
 * - TOutput: 출력 데이터 타입
 */
export interface ITypedNodeStrategy<TInput, TOutput> {
  /**
   * Node 타입 식별자
   */
  readonly type: string;

  /**
   * Node 이름 (로깅/디버깅용)
   */
  readonly name: string;

  /**
   * Node 실행
   * @param input 입력 데이터
   * @param context 실행 컨텍스트
   * @returns 실행 결과
   */
  execute(
    input: TInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<TOutput>>;

  /**
   * 입력 데이터 검증 (선택적)
   * @param input 입력 데이터
   * @returns 검증 결과
   */
  validate?(input: TInput): IValidationResult;

  /**
   * 롤백 처리 (선택적)
   * @param context 실행 컨텍스트
   */
  rollback?(context: INodeContext): Promise<void>;
}

/**
 * Typed Node 생성자 타입
 */
export type TypedNodeConstructor<TInput, TOutput> = new (
  ...args: unknown[]
) => ITypedNodeStrategy<TInput, TOutput>;

/**
 * 성공 결과 생성 헬퍼
 */
export function createSuccessResult<TOutput>(
  data: TOutput,
  nextNodes?: string[],
): ITypedNodeResult<TOutput> {
  return {
    success: true,
    data,
    ...(nextNodes && { next_nodes: nextNodes }),
  };
}

/**
 * 실패 결과 생성 헬퍼
 *
 * Note: data는 하위 호환성을 위해 빈 객체로 설정됨
 * 실패 케이스에서는 success 체크 후 error 사용 권장
 */
export function createErrorResult<TOutput>(
  message: string,
  code: string,
  details?: unknown,
): ITypedNodeResult<TOutput> {
  const error: INodeError = {
    message,
    code,
    ...(details !== undefined && { details }),
  };

  return {
    success: false,
    data: {} as TOutput, // 하위 호환성 유지
    error,
  };
}

/**
 * 유효성 검증 성공 결과
 */
export function validationSuccess(): IValidationResult {
  return {
    valid: true,
    errors: [],
  };
}

/**
 * 유효성 검증 실패 결과
 */
export function validationFailure(
  errors: Array<{ field: string; message: string; code?: string }>,
): IValidationResult {
  return {
    valid: false,
    errors,
  };
}

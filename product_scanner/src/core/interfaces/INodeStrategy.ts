/**
 * Node Strategy 인터페이스
 *
 * SOLID 원칙:
 * - ISP: 노드 처리 전략 전용 인터페이스
 * - DIP: 추상화에 의존
 * - Strategy Pattern: 노드별 처리 전략
 */

/**
 * Node 실행 컨텍스트
 */
export interface NodeContext {
  /** 현재 Job ID */
  job_id: string;

  /** 현재 Node ID */
  node_id: string;

  /** Node 설정 (workflow JSON의 config) */
  config: Record<string, unknown>;

  /** 이전 Node의 출력 데이터 */
  input: Record<string, unknown>;

  /** Job 실행 파라미터 (변수 치환용) */
  params: Record<string, unknown>;
}

/**
 * Node 실행 결과
 */
export interface NodeResult {
  /** 실행 성공 여부 */
  success: boolean;

  /** 출력 데이터 (다음 Node로 전달) */
  data: Record<string, unknown>;

  /** 에러 정보 (실패 시) */
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };

  /** 다음 Node ID 목록 오버라이드 (선택적, DAG 구조 지원) */
  next_nodes?: string[];
}

/**
 * Node Strategy 인터페이스
 * 각 노드 타입의 처리 전략
 */
export interface INodeStrategy {
  /**
   * Node 타입 식별자
   */
  readonly type: string;

  /**
   * Node 실행
   * @param context 실행 컨텍스트
   * @returns 실행 결과
   */
  execute(context: NodeContext): Promise<NodeResult>;

  /**
   * Node 설정 검증
   * @param config Node 설정
   * @throws Error 설정이 유효하지 않으면 예외 발생
   */
  validateConfig(config: Record<string, unknown>): void;
}

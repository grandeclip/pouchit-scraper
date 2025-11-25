/**
 * Extract Service 인터페이스
 *
 * Strategy Pattern:
 * - 각 추출 모드별 Service가 이 인터페이스 구현
 * - Factory에서 모드에 맞는 Service 생성
 */

import type { ExtractParams, ExtractServiceType } from "./IExtractParams";
import type { ExtractResult } from "./IExtractResult";

/**
 * Extract 서비스 인터페이스
 */
export interface IExtractService {
  /**
   * 서비스 타입 식별자
   */
  readonly type: ExtractServiceType;

  /**
   * 상품 데이터 추출
   * @param params 추출 파라미터
   * @returns 추출 결과
   */
  extract(params: ExtractParams): Promise<ExtractResult>;
}


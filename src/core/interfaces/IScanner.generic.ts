/**
 * 스캐너 공통 인터페이스 (제네릭)
 * Strategy Pattern의 핵심 인터페이스
 *
 * SOLID 원칙:
 * - SRP: 상품 스캔 실행 책임만 가짐
 * - OCP: 새로운 전략 추가 시 인터페이스 수정 불필요
 * - LSP: 모든 구현체는 이 인터페이스로 대체 가능
 * - ISP: 클라이언트가 필요한 메서드만 정의
 * - DIP: 상위 모듈이 이 추상화에 의존
 */

import { IProduct } from "@/core/interfaces/IProduct";

/**
 * 스캐너 인터페이스 (제네릭)
 * @template TProduct 플랫폼별 Product 타입
 */
export interface IScanner<TProduct extends IProduct> {
  /**
   * 상품 정보 스캔
   * @param id 상품 ID
   * @returns 스캔된 상품 정보
   */
  scan(id: string): Promise<TProduct>;

  /**
   * 초기화
   */
  initialize(): Promise<void>;

  /**
   * 리소스 정리
   */
  cleanup(): Promise<void>;

  /**
   * 전략 ID 반환
   */
  getStrategyId(): string;
}

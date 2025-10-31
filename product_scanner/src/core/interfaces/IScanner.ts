/**
 * 스캐너 공통 인터페이스
 * Strategy Pattern의 핵심 인터페이스
 *
 * SOLID 원칙:
 * - SRP: 상품 스캔 실행 책임만 가짐
 * - OCP: 새로운 전략 추가 시 인터페이스 수정 불필요
 * - LSP: 모든 구현체는 이 인터페이스로 대체 가능
 * - ISP: 클라이언트가 필요한 메서드만 정의
 * - DIP: 상위 모듈이 이 추상화에 의존
 *
 * @template T - 플랫폼별 Product 타입 (HwahaeProduct, OliveyoungProduct 등)
 */

import type { IProduct } from "@/core/interfaces/IProduct";

/**
 * 스캐너 인터페이스 (제네릭)
 */
export interface IScanner<T extends IProduct = IProduct> {
  /**
   * 상품 정보 스캔 (cleanup 포함)
   * @param productId 상품 ID (goodsId, goodsNo 등)
   * @returns 스캔된 상품 정보
   */
  scan(productId: string): Promise<T>;

  /**
   * 상품 정보 스캔 (cleanup 없이)
   *
   * 용도: ValidationNode처럼 여러 상품을 연속 스캔할 때
   * 주의: 사용 후 반드시 cleanup() 호출 필요
   *
   * @param productId 상품 ID
   * @returns 스캔된 상품 정보
   */
  scanWithoutCleanup(productId: string): Promise<T>;

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

/**
 * 데이터 추출기 인터페이스
 * Strategy Pattern for data extraction strategies
 *
 * @note 현재 미사용 - 향후 확장을 위해 정의됨
 * Scanner 클래스들이 직접 extractData()와 parseData()를 구현하고 있음
 *
 * SOLID 원칙:
 * - SRP: 데이터 추출만 담당
 * - OCP: 새로운 추출 방식 추가 시 확장 가능
 * - ISP: 추출에 필요한 메서드만 정의
 */

import { HwahaeProduct } from "@/core/domain/HwahaeProduct";

/**
 * 데이터 추출기 인터페이스
 *
 * @future 향후 Scanner와 Extractor를 분리할 때 사용 예정
 */
export interface IExtractor<TRawData = any> {
  /**
   * 원시 데이터 추출
   * @param goodsId 상품 ID
   * @returns 원시 데이터
   */
  extract(goodsId: string): Promise<TRawData>;

  /**
   * 원시 데이터를 도메인 모델로 변환
   * @param rawData 원시 데이터
   * @returns 화해 상품 도메인 객체
   */
  parse(rawData: TRawData): Promise<HwahaeProduct>;
}

/**
 * PriceParser Utility
 *
 * 목적: 가격 텍스트 파싱 유틸리티
 * 패턴: Utility Class (Static Methods)
 */

/**
 * 가격 파싱 결과 (통화 포함)
 */
export interface ParsedPrice {
  amount: number;
  currency: string;
}

/**
 * 가격 파서 유틸리티
 *
 * 한국 가격 형식 (쉼표 구분, "원" 단위)을 처리하는 정적 메서드 제공
 */
export class PriceParser {
  /**
   * 텍스트에서 가격 숫자 추출
   *
   * 정규식으로 "1,000" 형식의 모든 숫자를 추출
   * 예: "20,000원 15,000원" → ["20,000", "15,000"]
   *
   * @param text 추출 대상 텍스트
   * @returns 추출된 가격 문자열 배열
   */
  static extractNumbers(text: string): string[] {
    if (!text || typeof text !== "string") {
      return [];
    }

    // 한국 가격 형식: 1,000 또는 1000
    const regex = /(\d{1,3}(?:,\d{3})*)/g;
    const matches = text.match(regex);

    if (!matches) {
      return [];
    }

    // 필터링: 쉼표 있는 숫자만 (3자리 이상) - "20"은 제외, "1,000"은 포함
    // 또는 4자리 이상 숫자 (쉼표 없어도 가격으로 간주)
    return matches.filter((num) => {
      const withoutComma = num.replace(/,/g, "");
      return num.includes(",") || withoutComma.length >= 4;
    });
  }

  /**
   * 가격 문자열을 숫자로 변환
   *
   * "15,000원" → 15000
   * null/undefined/빈문자열 → 0
   *
   * @param text 변환 대상 가격 문자열
   * @returns 파싱된 숫자 (실패 시 0)
   */
  static parse(text: string | null | undefined): number {
    if (!text || typeof text !== "string") {
      return 0;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return 0;
    }

    // 숫자 추출
    const numbers = this.extractNumbers(trimmed);
    if (numbers.length === 0) {
      return 0;
    }

    // 첫 번째 숫자만 사용 (단일 가격 파싱 케이스)
    const firstNumber = numbers[0];

    // 쉼표 제거 후 정수로 변환
    const parsed = parseInt(firstNumber.replace(/,/g, ""), 10);

    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * 통화 정보를 포함한 가격 파싱
   *
   * @param text 변환 대상 가격 문자열
   * @returns 금액과 통화 코드
   */
  static parseWithCurrency(text: string | null | undefined): ParsedPrice {
    return {
      amount: this.parse(text),
      currency: "KRW",
    };
  }

  /**
   * 할인율 계산
   *
   * 할인율 = ((원가 - 판매가) / 원가) * 100
   * 소수점 반올림
   *
   * @param salePrice 판매가
   * @param originalPrice 원가
   * @returns 할인율 (%) - 0~100 사이 정수
   */
  static calculateDiscountRate(
    salePrice: number,
    originalPrice: number,
  ): number {
    // 유효하지 않은 케이스
    if (originalPrice <= 0 || salePrice <= 0) {
      return 0;
    }

    // 판매가가 원가보다 크면 할인 없음
    if (salePrice >= originalPrice) {
      return 0;
    }

    const rate = ((originalPrice - salePrice) / originalPrice) * 100;
    return Math.round(rate);
  }
}

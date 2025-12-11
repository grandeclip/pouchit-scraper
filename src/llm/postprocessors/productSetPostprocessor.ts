/**
 * Product Set Postprocessor
 *
 * LLM 파싱 결과를 3개의 컬럼 텍스트로 변환
 * - set_name: 메인 상품만 (타입 + 용량)
 * - sanitized_item_name: 모든 항목 (타입 + 용량)
 * - structured_item_name: 모든 항목 (풀네임 + 용량)
 *
 * 포맷 규칙:
 * - count > 1: "x N개" 형식 (예: "세럼 50ml x 2개")
 * - 단위: ml, g, L, kg, 개, 매 허용 (L은 대문자 유지)
 * - 기획 상품: gifts 비어있으면 "+ 증정품" 추가
 */

import type { ProductItem, ProductSetParsingResult } from "../schemas";

// ============================================
// 인터페이스 정의
// ============================================

/**
 * 후처리 결과
 */
export interface ProductSetColumns {
  /** 메인 상품만 (타입 + 용량) */
  set_name: string;
  /** 모든 항목 (타입 + 용량) */
  sanitized_item_name: string;
  /** 모든 항목 (풀네임 + 용량) */
  structured_item_name: string;
  /** 메인 상품 용량 (단일 상품일 때만, 복수 상품 세트는 null) */
  volume: number | null;
  /** 메인 상품 용량 단위 (단일 상품일 때만, 복수 상품 세트는 null) */
  volume_unit: string | null;
}

// ============================================
// 헬퍼 함수
// ============================================

/**
 * 단위 정규화: 소문자 (L은 대문자 유지)
 *
 * @example
 * "ML" → "ml"
 * "G" → "g"
 * "l" → "L" (리터는 대문자)
 * "매" → "매" (한글은 그대로)
 */
function normalizeUnit(unit: string): string {
  if (!unit) return unit;

  // 리터(L)는 대문자 유지
  if (unit.toLowerCase() === "l") {
    return "L";
  }

  // 영문 단위는 소문자로
  if (/^[a-zA-Z]+$/.test(unit)) {
    return unit.toLowerCase();
  }

  // 한글 단위는 그대로
  return unit;
}

/**
 * 단일 항목을 텍스트로 변환 (타입 + 용량)
 *
 * @example
 * { type: "세럼", volume: 50, unit: "ml", count: 1 } → "세럼 50ml"
 * { type: "세럼", volume: 2, unit: "ml", count: 3 } → "세럼 2ml x 3개"
 * { type: "마스크팩", volume: null, count: 1 } → "마스크팩"
 * { type: "립틴트", volume: null, count: 2 } → "립틴트 x 2개"
 */
function formatItemByType(item: ProductItem): string {
  const { type, volume, unit, count } = item;

  // volume이 없는 경우
  if (volume === null || volume === undefined) {
    // count가 있으면 표시
    if (count > 1) {
      return `${type} x ${count}개`;
    }
    return type;
  }

  // 단위 정규화
  const normalizedUnit = normalizeUnit(unit);

  // 기본: 타입 + 용량 + 단위
  let result = `${type} ${volume}${normalizedUnit}`;

  // count > 1인 경우 x count개 추가
  if (count > 1) {
    result += ` x ${count}개`;
  }

  return result;
}

/**
 * 단일 항목을 텍스트로 변환 (풀네임 기반)
 *
 * @example
 * { full_name: "다이브인 세럼", volume: 50, unit: "ml", count: 1 } → "다이브인 세럼 50ml"
 * { full_name: "다이브인 세럼", volume: 2, unit: "ml", count: 3 } → "다이브인 세럼 2ml x 3개"
 * { full_name: "립틴트", volume: null, count: 2 } → "립틴트 x 2개"
 */
function formatItemByFullName(item: ProductItem): string {
  const { full_name, volume, unit, count } = item;

  // volume이 없는 경우
  if (volume === null || volume === undefined) {
    // count가 있으면 표시
    if (count > 1) {
      return `${full_name} x ${count}개`;
    }
    return full_name;
  }

  // 단위 정규화
  const normalizedUnit = normalizeUnit(unit);

  // 기본: 풀네임 + 용량 + 단위
  let result = `${full_name} ${volume}${normalizedUnit}`;

  // count > 1인 경우 x count개 추가
  if (count > 1) {
    result += ` x ${count}개`;
  }

  return result;
}

/**
 * 여러 항목을 " + "로 연결
 */
function joinItems(items: string[]): string {
  return items.join(" + ");
}

// ============================================
// 메인 함수
// ============================================

/**
 * LLM 파싱 결과를 3개의 컬럼 텍스트로 변환
 *
 * @param result LLM 파싱 결과
 * @returns 3개의 컬럼 값
 */
export function buildProductSetColumns(
  result: ProductSetParsingResult,
): ProductSetColumns {
  const { main_products, gifts } = result;

  // set_name: 메인 상품만 (타입 + 용량)
  const setNameParts = main_products.map(formatItemByType);
  const set_name = joinItems(setNameParts);

  // sanitized_item_name: 모든 항목 (타입 + 용량)
  const allItemsByType = [
    ...main_products.map(formatItemByType),
    ...gifts.map(formatItemByType),
  ];
  const sanitized_item_name = joinItems(allItemsByType);

  // structured_item_name: 모든 항목 (풀네임 + 용량)
  const allItemsByFullName = [
    ...main_products.map(formatItemByFullName),
    ...gifts.map(formatItemByFullName),
  ];
  const structured_item_name = joinItems(allItemsByFullName);

  // volume, volume_unit: 메인 상품이 1개일 때만 추출 (복수 상품 세트는 null)
  let volume: number | null = null;
  let volume_unit: string | null = null;

  if (main_products.length === 1) {
    const mainProduct = main_products[0];
    volume = mainProduct.volume;
    volume_unit = mainProduct.unit ? normalizeUnit(mainProduct.unit) : null;
  }

  return {
    set_name,
    sanitized_item_name,
    structured_item_name,
    volume,
    volume_unit,
  };
}

/**
 * 빈 결과 생성 (에러 시 사용)
 */
export function createEmptyColumns(): ProductSetColumns {
  return {
    set_name: "",
    sanitized_item_name: "",
    structured_item_name: "",
    volume: null,
    volume_unit: null,
  };
}

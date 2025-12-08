/**
 * Product Set Postprocessor
 *
 * LLM 파싱 결과를 3개의 컬럼 텍스트로 변환
 * - set_name: 메인 상품만 (타입 + 용량)
 * - sanitized_item_name: 모든 항목 (타입 + 용량)
 * - structured_item_name: 모든 항목 (풀네임 + 용량)
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
}

// ============================================
// 헬퍼 함수
// ============================================

/**
 * 단일 항목을 텍스트로 변환 (타입 기반)
 *
 * @example
 * { type: "세럼", volume: 50, unit: "ml", count: 1 } → "세럼 50ml"
 * { type: "세럼", volume: 2, unit: "ml", count: 3 } → "세럼 2ml*3"
 * { type: "마스크팩", volume: 10, unit: "매", count: 1 } → "마스크팩 10매"
 */
function formatItemByType(item: ProductItem): string {
  const { type, volume, unit, count } = item;

  // volume이 없는 경우
  if (volume === null || volume === undefined) {
    return type;
  }

  // 기본: 타입 + 용량 + 단위
  let result = `${type} ${volume}${unit}`;

  // count > 1인 경우 *count 추가
  if (count > 1) {
    result += `*${count}`;
  }

  return result;
}

/**
 * 단일 항목을 텍스트로 변환 (풀네임 기반)
 *
 * @example
 * { full_name: "다이브인 세럼", volume: 50, unit: "ml", count: 1 } → "다이브인 세럼 50ml"
 * { full_name: "다이브인 세럼", volume: 2, unit: "ml", count: 3 } → "다이브인 세럼 2ml*3"
 */
function formatItemByFullName(item: ProductItem): string {
  const { full_name, volume, unit, count } = item;

  // volume이 없는 경우
  if (volume === null || volume === undefined) {
    return full_name;
  }

  // 기본: 풀네임 + 용량 + 단위
  let result = `${full_name} ${volume}${unit}`;

  // count > 1인 경우 *count 추가
  if (count > 1) {
    result += `*${count}`;
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

  return {
    set_name,
    sanitized_item_name,
    structured_item_name,
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
  };
}

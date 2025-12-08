/**
 * Label 전처리/후처리 로직
 *
 * LLM 호출 전 입력 정제 및 호출 후 결과 정제
 */

import { removeDuplicatesAndSort } from "./normalizePostprocessor";

export interface LabelPreprocessResult {
  /** 전처리된 제품명 (LLM에 전달할 입력) */
  processedName: string;
  /** 리필 패턴 존재 여부 */
  hasRefill: boolean;
  /** 프로모션 패턴 (1+1 등) 존재 여부 */
  hasPromotion: boolean;
  /** 전처리 후 빈 문자열 여부 (LLM 호출 불필요) */
  skipLlmCall: boolean;
  /** LLM 호출 없이 반환할 라벨 (skipLlmCall이 true일 때) */
  directLabel?: string;
}

/**
 * Label 추출을 위한 전처리
 *
 * - 빈 문자열 → "단품" 직접 반환
 * - "리필" 패턴 추출 및 제거
 * - "1+1" 프로모션 패턴 추출 및 제거
 */
export function preprocessForLabel(
  normalizeProductName: string,
): LabelPreprocessResult {
  // 빈 문자열이면 무조건 "단품"
  if (normalizeProductName === "") {
    return {
      processedName: "",
      hasRefill: false,
      hasPromotion: false,
      skipLlmCall: true,
      directLabel: "단품",
    };
  }

  let processedName = normalizeProductName;
  let hasRefill = false;
  let hasPromotion = false;

  // "리필" 패턴 확인 및 제거
  if (/리필/.test(processedName)) {
    hasRefill = true;
    // 1. 단독 "리필" 제거
    processedName = processedName.replace(/^리필$/, "");
    // 2. 시작 부분의 "리필 + " 제거
    processedName = processedName.replace(/^리필\s*\+\s*/g, "");
    // 3. 끝 부분의 " + 리필" 제거 (공백 여부 무관)
    processedName = processedName.replace(/\s*\+\s*리필\s*$/g, "");
    // 4. 중간 부분의 " + 리필 + " 제거
    processedName = processedName.replace(/\s*\+\s*리필\s*\+\s*/g, " + ");
  }

  // "1+1", "2+1" 등 숫자+플러스 조합 확인 및 제거
  if (/\b\d+(?:\+\d+)+/.test(processedName)) {
    hasPromotion = true;
    processedName = processedName.replace(/^\b\d+(?:\+\d+)+$/, ""); // 단독 "1+1" 제거
    processedName = processedName.replace(/\b\d+(?:\+\d+)+\s*\+\s*/g, ""); // "1+1 + " 제거
    processedName = processedName.replace(/\s*\+\s*\b\d+(?:\+\d+)+$/g, ""); // " + 1+1" (끝) 제거
    processedName = processedName.replace(
      /\s*\+\s*\b\d+(?:\+\d+)+\s*\+\s*/g,
      " + ",
    ); // " + 1+1 + " (중간) 제거
  }

  // 연속된 " + " 패턴 정리 (예: " + + " → " + ")
  processedName = processedName.replace(/\s*\+\s*\+\s*/g, " + ");

  // 앞뒤 공백 및 " + " 제거
  processedName = processedName.replace(/^\s*\+\s*|\s*\+\s*$/g, "").trim();

  // 전처리 후 processedName이 빈 문자열인 경우 (단독 "리필" 또는 "1+1")
  if (processedName === "") {
    if (hasRefill && hasPromotion) {
      return {
        processedName: "",
        hasRefill,
        hasPromotion,
        skipLlmCall: true,
        directLabel: removeDuplicatesAndSort("리필,1+1", ","),
      };
    } else if (hasRefill) {
      return {
        processedName: "",
        hasRefill,
        hasPromotion,
        skipLlmCall: true,
        directLabel: "리필",
      };
    } else if (hasPromotion) {
      return {
        processedName: "",
        hasRefill,
        hasPromotion,
        skipLlmCall: true,
        directLabel: "1+1",
      };
    }
  }

  return {
    processedName,
    hasRefill,
    hasPromotion,
    skipLlmCall: false,
  };
}

/**
 * LLM 응답에서 라벨 추출
 */
export function extractLabelFromLlmResponse(response: unknown): string {
  // Gemini는 JSON 객체를 반환하므로 직접 접근
  if (
    response &&
    Array.isArray(response) &&
    response[0] &&
    typeof response[0] === "object" &&
    "label" in response[0]
  ) {
    return (response[0] as { label: string }).label;
  }

  // 기본값
  return "단품";
}

/**
 * Label 후처리
 *
 * - 제거된 패턴들을 결과에 추가 (리필, 1+1)
 * - 중복 제거 및 정렬
 */
export function postprocessLabel(
  llmLabel: string,
  hasRefill: boolean,
  hasPromotion: boolean,
): string {
  const prefixes: string[] = [];

  if (hasRefill) {
    prefixes.push("리필");
  }
  if (hasPromotion) {
    prefixes.push("1+1");
  }

  // prefixes가 있으면 결과 조합
  if (prefixes.length > 0) {
    const combinedResult = prefixes.join(",") + "," + llmLabel;
    return removeDuplicatesAndSort(combinedResult, ",");
  }

  return llmLabel;
}

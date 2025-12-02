/**
 * Normalize 후처리 로직
 *
 * LLM 결과에서 normalizeProductName을 정제하는 순수 함수들
 */

export interface GiftItem {
  itemName: string;
  itemVolume: number | null;
  itemVolumeUnit: string;
}

export interface NormalizeResult {
  normalizeProductName: string;
  volume: number | null;
  volumeUnit: string;
  gifts: GiftItem[];
}

/**
 * 구분자로 분리된 문자열에서 중복 제거
 */
export function removeDuplicatesAndSort(
  text: string,
  separator: string,
): string {
  if (!text || typeof text !== "string") {
    return text;
  }

  const items = text
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item, index, arr) => arr.indexOf(item) === index);

  return items.join(separator);
}

/**
 * gifts 배열에서 "리필" 항목 제거
 *
 * LLM이 gifts에 리필을 포함시키는 경우가 있어 후처리로 제거
 */
export function postprocessRemoveRefillFromGifts(
  data: NormalizeResult,
): NormalizeResult {
  if (!data || typeof data !== "object" || !Array.isArray(data.gifts)) {
    return data;
  }

  const filteredGifts = data.gifts.filter(
    (gift) => !gift || typeof gift !== "object" || gift.itemName !== "리필",
  );

  return {
    ...data,
    gifts: filteredGifts,
  };
}

/**
 * normalizeProductName에서 본품 제거 및 정제
 *
 * - 본품 제거 (증정품만 남김)
 * - "1+1", "2+1" 프로모션 패턴 추출
 * - 리필/스티커 수식어 통일
 */
export function postprocessNormalizeProductName(
  data: NormalizeResult,
): NormalizeResult {
  if (!data || typeof data !== "object" || !data.normalizeProductName) {
    return data;
  }

  let normalized = data.normalizeProductName.trim();

  // " + " 기준으로 분리하여 각 부분에서 리필과 스티커 수식어 제거
  const parts = normalized.split(" + ");
  const processedParts = parts.map((part) => {
    const trimmedPart = part.trim();

    // 리필 관련 키워드를 "리필"로 통일 (수식어 제거)
    if (trimmedPart.includes("리필")) {
      return "리필";
    }

    // 스티커 관련 키워드를 "스티커"로 통일 (수식어 제거)
    if (trimmedPart.includes("스티커")) {
      return "스티커";
    }

    return trimmedPart;
  });

  normalized = processedParts.join(" + ");

  // " + " 기준으로 split하여 본품과 증정품 분리
  // 예시:
  // "레티놀 시카 흔적 앰플 1+1 + 하트거울" → ["레티놀 시카 흔적 앰플 1+1", "하트거울"]
  // "비건 팩클렌저 대용량 + 여행용 팩스크럽" → ["비건 팩클렌저 대용량", "여행용 팩스크럽"]
  // "마데카소사이드 흔적 리페어 세럼 1+1" → ["마데카소사이드 흔적 리페어 세럼 1+1"]
  // "윙크 쿠션 매트" → ["윙크 쿠션 매트"]

  if (normalized.includes(" + ")) {
    const splitParts = normalized.split(" + ");
    const mainProduct = splitParts[0].trim(); // 본품 부분
    const gifts = splitParts.slice(1); // 증정품들

    // 본품에서 "1+1", "1+1+1" 같은 숫자+플러스 조합 추출 (단위가 붙지 않은 것만)
    // 단어 경계를 사용하여 더 정확하게 매칭
    const numberPlusPattern = /\b(\d+(?:\+\d+)+)\b(?![a-zA-Z])/g;
    const numberPlusMatches = mainProduct.match(numberPlusPattern) || [];

    // 결과 구성: 숫자+플러스 조합 + 증정품들
    const result = [...numberPlusMatches, ...gifts].join(" + ");
    normalized = result;
  } else {
    // " + "가 없는 경우 (본품만 있는 경우)
    // 숫자+플러스 조합이 있으면 그것만 남기고, 없으면 빈 문자열
    const numberPlusPattern = /\b(\d+(?:\+\d+)+)\b(?![a-zA-Z])/g;
    const numberPlusMatches = normalized.match(numberPlusPattern) || [];

    if (numberPlusMatches.length > 0) {
      normalized = numberPlusMatches.join(" + ");
    } else {
      // 증정품이 없고 숫자+플러스 조합도 없으면 빈 문자열
      normalized = "";
    }
  }

  return {
    ...data,
    normalizeProductName: normalized,
  };
}

/**
 * 전체 후처리 파이프라인
 *
 * 1. gifts에서 리필 항목 제거
 * 2. normalizeProductName 정제 (본품 제거, 패턴 추출)
 * 3. 중복 제거
 */
export function applyNormalizePostprocessing(
  data: NormalizeResult,
): NormalizeResult {
  // 1. gifts에서 리필 항목 제거
  let result = postprocessRemoveRefillFromGifts(data);

  // 2. normalizeProductName 정제
  result = postprocessNormalizeProductName(result);

  // 3. normalizeProductName에서 "+" 구분자로 중복 제거
  if (result.normalizeProductName) {
    result.normalizeProductName = removeDuplicatesAndSort(
      result.normalizeProductName,
      " + ",
    );
  }

  return result;
}

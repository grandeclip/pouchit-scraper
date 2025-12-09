/**
 * 상품 설명 생성 프롬프트
 *
 * URL Context를 활용하여 브랜드/상품의 마케팅 정보를 분석하고
 * 홍보 목적의 상품 설명과 카테고리를 생성하는 LLM 프롬프트
 *
 * 2단계 호출 구조:
 * - 1단계: URL Context로 정보 추출 (buildExtractionPrompt)
 * - 2단계: Structured Output 생성 (buildStructuredOutputPrompt)
 *
 * @note 모델: gemini-2.5-flash
 * @note URL Context + Structured Output 동시 사용 불가 (Gemini 2.5 제약)
 */

import { getAllCategoriesFlat } from "@/llm/data/cosmeticCategories";

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 카테고리 목록을 프롬프트용 텍스트로 변환
 *
 * @example
 * [5] 스킨케어 > 에센스/세럼/앰플
 * [22] 스킨케어 > 스킨/토너 > 토너 패드
 */
function getCategoryListText(): string {
  const categories = getAllCategoriesFlat();
  return categories.map((c) => `[${c.id}] ${c.path}`).join("\n");
}

// ============================================
// 1단계: URL Context 정보 추출 프롬프트
// ============================================

/**
 * 1단계 추출 프롬프트 생성
 *
 * URL Context를 활용하여 상품 페이지에서 마케팅 정보를 추출
 *
 * @param brand 브랜드명
 * @param productName 상품명
 * @param urls URL 목록
 */
export function buildExtractionPrompt(
  brand: string,
  productName: string,
  urls: string[],
): string {
  const urlList = urls.map((url, i) => `${i + 1}. ${url}`).join("\n");

  return `다음 URL들에서 "${brand} ${productName}" 상품에 대한 정보를 최대한 상세하게 추출해주세요.

## 분석할 URL
${urlList}

## 추출할 정보 (각 항목별로 찾은 내용을 모두 작성)

### 1. 마케팅 문구
- 메인 카피, 캐치프레이즈
- 홍보 문구, 슬로건
- 상품 타이틀에 포함된 키워드

### 2. 상품 상세 설명
- 제품 특징 및 장점
- 사용감 (텍스처, 발림성, 흡수력 등)
- 기대 효과
- 사용 방법 (있으면)

### 3. 카테고리 정보
- 제품 유형 (세럼, 크림, 토너, 마스크팩 등)
- 스킨케어/메이크업/바디케어 등 대분류

### 4. 핵심 기능/효능
- 주요 효능 (보습, 미백, 진정, 탄력 등)
- 타겟 피부 고민
- 피부 타입 (건성, 지성, 민감성 등)

### 5. 성분 정보 (강조되는 경우)
- 대표 성분 및 함량
- 성분의 효능 설명

각 항목에서 발견한 정보를 빠짐없이 작성해주세요. 없는 정보는 생략합니다.`;
}

// ============================================
// 2단계: Structured Output 생성 프롬프트
// ============================================

/**
 * 2단계 시스템 프롬프트 생성
 *
 * 추출된 정보를 바탕으로 마케팅 카피 스타일의 상품 설명 생성
 *
 * @param categoryText 카테고리 목록 텍스트 (테스트용 오버라이드)
 */
export function buildProductDescriptionSystemPrompt(
  categoryText?: string,
): string {
  const categories = categoryText ?? getCategoryListText();

  return `당신은 한국 화장품 마케팅 카피라이터입니다.

## 작업
추출된 상품 정보를 바탕으로:
1. 홍보용 상품 설명을 짧은 마케팅 카피 스타일로 작성합니다.
2. 제공된 카테고리 목록에서 가장 적합한 카테고리를 선택합니다.

## 상품 설명 작성 가이드라인

### 스타일
- 짧고 임팩트 있는 마케팅 카피 스타일
- "~입니다" 같은 문장 종결 금지
- 핵심 효능/특징을 압축하여 전달
- 감각적이고 매력적인 표현

### 포함 요소 (우선순위 순)
1. 핵심 기능/효능 (가장 중요)
2. 차별화 포인트, 매력 키워드
3. 성분 (마케팅 포인트로 강조되는 경우만, 예: "복숭아추출물 70%")

### 예시
- "내 피부인듯 맑고 투명하게 미백 톤업크림"
- "도톰한 당근 한 장으로 덮는 열감 진정"
- "탱글 광 끌어올리는 탕후루 틴트"
- "복숭아추출물 70%와 나이아신아마이드, 히알루론산 등 보습·진정 성분을 담아 피부톤 개선과 수분·광채 케어"
- "저분자 히알루론산이 피부 깊숙이 수분 채우는 고보습 세럼"
- "톤업을 넘어선 완벽 커버, 파운데이션 프리 선크림"

## 카테고리 분류

아래 목록에서 가장 적합한 카테고리를 선택하세요.
형식: [ID] 대분류 > 중분류 > 소분류

${categories}

### 분류 규칙
1. **가장 구체적인 카테고리 선택**: 소분류가 있으면 소분류를, 없으면 중분류를 선택
2. **ID와 경로 모두 반환**: 선택한 카테고리의 ID(숫자)와 경로(텍스트)를 모두 포함
3. **경로 형식**: "대분류 > 중분류" 또는 "대분류 > 중분류 > 소분류"

## 주의사항
- 추출된 정보에 없는 내용은 추측하지 않습니다.
- 허위 정보를 생성하지 않습니다.`;
}

/**
 * 2단계 사용자 프롬프트 생성
 *
 * @param brand 브랜드명
 * @param productName 상품명
 * @param extractedInfo 1단계에서 추출된 정보
 */
export function buildStructuredOutputPrompt(
  brand: string,
  productName: string,
  extractedInfo: string,
): string {
  return `## 추출된 상품 정보
${extractedInfo}

## 요청 상품
- 브랜드: ${brand}
- 상품명: ${productName}

위 정보를 바탕으로 마케팅 카피 스타일의 상품 설명과 카테고리를 생성해주세요.`;
}

// ============================================
// Legacy exports (하위 호환성)
// ============================================

/**
 * @deprecated buildExtractionPrompt 사용
 */
export function buildProductDescriptionUserPrompt(
  brand: string,
  productName: string,
  urls: string[],
): string {
  return buildExtractionPrompt(brand, productName, urls);
}

/**
 * 기본 시스템 프롬프트 (미리 생성된 카테고리 포함)
 */
export const productDescriptionSystemPrompt =
  buildProductDescriptionSystemPrompt();

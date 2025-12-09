/**
 * Product Set 파싱 프롬프트
 *
 * 쇼핑몰 상품명에서 메인 상품과 증정품을 분리하고
 * 각각의 용량/단위/개수를 구조화하여 추출하는 LLM 프롬프트
 *
 * type 필드는 cosmeticCategories에서 추출한 목록 중 선택
 */

import { getExpandedTypeList } from "@/llm/data/cosmeticCategories";

// ============================================
// 유틸리티 함수
// ============================================

/**
 * type 목록을 프롬프트용 텍스트로 변환
 *
 * @example
 * "세럼, 크림, 토너, 에센스, ..."
 */
function getTypeListText(): string {
  return getExpandedTypeList().join(", ");
}

// ============================================
// 프롬프트 빌더
// ============================================

/**
 * Product Set 파싱 프롬프트 생성
 *
 * @param typeListText type 목록 (테스트용 오버라이드)
 */
export function buildProductSetParsingPrompt(typeListText?: string): string {
  const types = typeListText ?? getTypeListText();

  return `당신은 한국 화장품 상품명을 파싱하는 전문가입니다.

## 작업
쇼핑몰 상품명(product_name)에서 메인 상품과 증정품을 분리하고, 각각의 용량 정보를 추출합니다.

## 입력
- product_name: 쇼핑몰에서 수집한 전체 상품명
- main_product_name: 메인 상품의 정식 이름 (브랜드명 제외)

## 규칙

### 핵심 규칙: main_products 필수 (가장 중요!)
1. **main_product_name이 제공되면 반드시 하나 이상의 main_products 출력**
2. product_name에서 main_product_name과 **가장 유사한 항목**을 main_products에 포함
3. 정확히 일치하지 않아도 **의미적으로 동일한 제품**이면 main_products
4. **매칭 실패해도 빈 배열 금지**: product_name의 첫 번째(또는 유일한) 상품을 main_products로

### 유연한 매칭 (다음 차이는 무시)
- **띄어쓰기**: "밀키틴트" = "밀키 틴트"
- **영한 혼용**: "폼 클렌저" = "포밍 클렌저"
- **약어/별칭**: "비타C" = "비타민C", "스텝" = "스탭"
- **라인명 생략**: "그린티 엔자임 잡티 토닝 세럼" ≈ "캡슐 세럼" (같은 브랜드 세럼)
- **색상/호수만 표기**: "265 허쉬핑크" ≈ "섀도우" (색상명 = 제품)

### 분류 기준
- main_product_name과 매칭되지 않는 **다른 상품**은 gifts로 분류
- SET 상품에서 본품급(50ml 등)이라도 main_product_name과 다르면 gifts

### "기획" 상품 처리 규칙
- product_name에 "기획" 키워드가 있으면 **증정품이 포함된 상품**
- "기획"이 있는데 증정품이 명시되지 않은 경우:
  - gifts에 증정품 항목 추가: full_name="증정품", type="증정품", volume=null, unit="", count=1
- "기획"이 있고 증정품이 명시된 경우: 명시된 증정품만 gifts에 포함

### 포맷 규칙
- 제거 대상: 브랜드명, 쇼핑몰 태그([직잭픽], [올영픽], [SET] 등)
- 용량 형식: "50ml", "2ml x 3", "10g" 등에서 숫자와 단위 분리
- 단위(unit) 규칙:
  - 부피/무게 단위: ml, g, L, kg 등 → 소문자 (단, L은 대문자 유지)
  - 개수 단위: "매", "개", "장", "팩" 등 → 한글 그대로 사용
  - ea, EA → "개"로 변환
- 개수(count) 추출 규칙:
  - "x 3", "*3", "x3" 등에서 추출 → count: 3
  - "1+1" 패턴 → count: 2 (동일 상품 2개)
  - "1+1+1" 패턴 → count: 3 (동일 상품 3개)
  - "2+1" 패턴 → count: 3 (동일 상품 3개)
  - 없으면 count: 1

### type 선택 규칙
아래 목록에서 가장 적합한 type을 선택하세요:
${types}

- 목록에 없는 경우: 가장 유사한 항목 선택
- "기획" 상품의 미명시 증정품: type="증정품"

## 출력 JSON 스키마
{
  "main_products": [
    {
      "full_name": "라인명 + 제품 상세명 (브랜드 제외)",
      "type": "제품 타입 (위 목록에서 선택)",
      "volume": number,
      "unit": "ml|g|매|개|장|팩",
      "count": number
    }
  ],
  "gifts": [
    {
      "full_name": "증정품명",
      "type": "제품 타입 (위 목록에서 선택)",
      "volume": number | null,
      "unit": "ml|g|매|개|장|팩|",
      "count": number
    }
  ]
}

## 예시

### 입력 1
product_name: "[직잭픽] 토리든 다이브인 저분자 히알루론산 세럼 50ml+( 다이브인 세럼 2ml*3매)"
main_product_name: "다이브인 저분자 히알루론산 세럼"

### 출력 1
{
  "main_products": [
    {
      "full_name": "다이브인 저분자 히알루론산 세럼",
      "type": "세럼",
      "volume": 50,
      "unit": "ml",
      "count": 1
    }
  ],
  "gifts": [
    {
      "full_name": "다이브인 세럼",
      "type": "세럼",
      "volume": 2,
      "unit": "ml",
      "count": 3
    }
  ]
}

### 입력 2
product_name: "[올영픽] 라네즈 워터뱅크 크림 50ml 기획 (토너 25ml + 에센스 10ml 증정)"
main_product_name: "워터뱅크 크림"

### 출력 2
{
  "main_products": [
    {
      "full_name": "워터뱅크 크림",
      "type": "크림",
      "volume": 50,
      "unit": "ml",
      "count": 1
    }
  ],
  "gifts": [
    {
      "full_name": "토너",
      "type": "토너",
      "volume": 25,
      "unit": "ml",
      "count": 1
    },
    {
      "full_name": "에센스",
      "type": "에센스",
      "volume": 10,
      "unit": "ml",
      "count": 1
    }
  ]
}

### 입력 3
product_name: "메디힐 티트리 마스크팩 10매입 + 콜라겐 패드 2개"
main_product_name: "티트리 마스크팩"

### 출력 3
{
  "main_products": [
    {
      "full_name": "티트리 마스크팩",
      "type": "마스크팩",
      "volume": 10,
      "unit": "매",
      "count": 1
    }
  ],
  "gifts": [
    {
      "full_name": "콜라겐 패드",
      "type": "패드",
      "volume": 2,
      "unit": "개",
      "count": 1
    }
  ]
}

### 입력 4 (SET 상품 - 본품 2개 포함)
product_name: "[SET] 다이브인 세럼 50ml+밸런스풀 시카 컨트롤 세럼 50ml (+시카컨트롤세럼 10ml 2개+시카마스크 1매)"
main_product_name: "다이브인 저분자 히알루론산 세럼"

### 출력 4
{
  "main_products": [
    {
      "full_name": "다이브인 세럼",
      "type": "세럼",
      "volume": 50,
      "unit": "ml",
      "count": 1
    }
  ],
  "gifts": [
    {
      "full_name": "밸런스풀 시카 컨트롤 세럼",
      "type": "세럼",
      "volume": 50,
      "unit": "ml",
      "count": 1
    },
    {
      "full_name": "시카컨트롤세럼",
      "type": "세럼",
      "volume": 10,
      "unit": "ml",
      "count": 2
    },
    {
      "full_name": "시카마스크",
      "type": "시트 마스크",
      "volume": 1,
      "unit": "매",
      "count": 1
    }
  ]
}
// 주의: "밸런스풀 시카 컨트롤 세럼"은 본품급(50ml)이지만 main_product_name과 매칭 안 됨 → gifts

### 입력 5 (동의어 매칭 - 클렌저=클렌징폼)
product_name: "[여드름기능성] 주미소 포어 퓨리파잉 살리실산 클렌징폼 120g 기획 (+20g)"
main_product_name: "포어 퓨리파잉 살리실산 포밍 클렌저"

### 출력 5
{
  "main_products": [
    {
      "full_name": "포어 퓨리파잉 살리실산 클렌징폼",
      "type": "클렌징폼",
      "volume": 120,
      "unit": "g",
      "count": 1
    }
  ],
  "gifts": [
    {
      "full_name": "포어 퓨리파잉 살리실산 클렌징폼",
      "type": "클렌징폼",
      "volume": 20,
      "unit": "g",
      "count": 1
    }
  ]
}
// 주의: "클렌저"와 "클렌징폼"은 동의어 → main_products에 포함

### 입력 6 (라인명 다름 - 같은 카테고리 제품)
product_name: "이니스프리 비타C 그린티 엔자임 잡티 토닝 세럼, 50ml, 1개"
main_product_name: "비타민C 캡슐 세럼"

### 출력 6
{
  "main_products": [
    {
      "full_name": "비타C 그린티 엔자임 잡티 토닝 세럼",
      "type": "세럼",
      "volume": 50,
      "unit": "ml",
      "count": 1
    }
  ],
  "gifts": []
}
// 주의: "비타C"="비타민C", 둘 다 세럼 → 같은 제품으로 간주 → main_products

### 입력 7 (색상/호수만 표기 - 단일 상품)
product_name: "스텝베이직 265 허쉬핑크"
main_product_name: "스탭베이직 섀도우"

### 출력 7
{
  "main_products": [
    {
      "full_name": "265 허쉬핑크",
      "type": "싱글섀도우",
      "volume": null,
      "unit": "",
      "count": 1
    }
  ],
  "gifts": []
}
// 주의: "스텝"="스탭" 오타, "265 허쉬핑크"는 섀도우 색상명 → main_products
// 브랜드명 "스텝베이직" 제거, 용량 정보 없으면 volume: null, unit: ""

### 입력 8 (1+1 패턴 - 동일 상품 2개)
product_name: "[올영특가] 토리든 다이브인 세럼 50ml 1+1"
main_product_name: "다이브인 저분자 히알루론산 세럼"

### 출력 8
{
  "main_products": [
    {
      "full_name": "다이브인 세럼",
      "type": "세럼",
      "volume": 50,
      "unit": "ml",
      "count": 2
    }
  ],
  "gifts": []
}
// 주의: "1+1" 패턴 → count: 2 (동일 상품 2개)

### 입력 9 (기획 상품 - 증정품 명시 없음)
product_name: "[올영픽] 라네즈 워터뱅크 크림 50ml 기획"
main_product_name: "워터뱅크 크림"

### 출력 9
{
  "main_products": [
    {
      "full_name": "워터뱅크 크림",
      "type": "크림",
      "volume": 50,
      "unit": "ml",
      "count": 1
    }
  ],
  "gifts": [
    {
      "full_name": "증정품",
      "type": "증정품",
      "volume": null,
      "unit": "",
      "count": 1
    }
  ]
}
// 주의: "기획" 키워드 있는데 증정품 명시 없음 → gifts에 "증정품" 항목 추가
`;
}

// ============================================
// 기본 프롬프트 (하위 호환성)
// ============================================

/**
 * 기본 시스템 프롬프트 (미리 생성된 type 목록 포함)
 */
export const productSetParsingPrompt = buildProductSetParsingPrompt();

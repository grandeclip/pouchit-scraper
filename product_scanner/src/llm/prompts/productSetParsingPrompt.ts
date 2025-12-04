/**
 * Product Set 파싱 프롬프트
 *
 * 쇼핑몰 상품명에서 메인 상품과 증정품을 분리하고
 * 각각의 용량/단위/개수를 구조화하여 추출하는 LLM 프롬프트
 */

export const productSetParsingPrompt = `
당신은 한국 화장품 상품명을 파싱하는 전문가입니다.

## 작업
쇼핑몰 상품명(product_name)에서 메인 상품과 증정품을 분리하고, 각각의 용량 정보를 추출합니다.

## 입력
- product_name: 쇼핑몰에서 수집한 전체 상품명
- main_product_name: 메인 상품의 정식 이름 (브랜드명 제외)

## 규칙
1. main_product_name과 일치하는 부분 = 메인 상품
2. 나머지 = 증정품 (gift)
3. 제거 대상: 브랜드명, 쇼핑몰 태그([직잭픽], [올영픽] 등)
4. 용량 형식: "50ml", "2ml*3", "10g" 등에서 숫자와 단위 분리
5. 단위(unit) 규칙:
   - 부피/무게 단위: ml, g, L, kg 등 → 영어 그대로 사용
   - 개수 단위: "매", "개", "장", "팩" 등 → 한글 그대로 사용
   - ea, EA → "개"로 변환
6. 개수(count): "*3", "x2" 등에서 추출, 없으면 1

## 출력 JSON 스키마
{
  "main_products": [
    {
      "full_name": "라인명 + 제품 상세명 (브랜드 제외)",
      "type": "제품 타입 (세럼, 크림, 토너 등)",
      "volume": number,
      "unit": "ml|g|매|개|장|팩",
      "count": number
    }
  ],
  "gifts": [
    {
      "full_name": "증정품명",
      "type": "제품 타입",
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
`;

/**
 * 화장품 카테고리 분류 체계
 *
 * Supabase product_categories 테이블에서 자동 생성됨
 * 수동 수정 금지 - scripts/generate-categories.ts 사용
 *
 * @generated 2025-12-09
 */

/**
 * 카테고리 구조 타입
 */
export interface CategoryNode {
  /** 카테고리 ID (Supabase PK) */
  id: number;
  /** 카테고리명 */
  name: string;
  /** 하위 카테고리 */
  children?: CategoryNode[];
}

/**
 * 화장품 카테고리 트리
 *
 * 구조: 대분류 > 중분류 > 소분류 (가변 depth)
 */
export const COSMETIC_CATEGORIES: CategoryNode[] = [
  {
    id: 19,
    name: "네일",
    children: [
      {
        id: 80,
        name: "네일컬러",
      },
    ],
  },
  {
    id: 17,
    name: "립 메이크업",
    children: [
      {
        id: 52,
        name: "립글로스",
      },
      {
        id: 55,
        name: "립마스크",
      },
      {
        id: 69,
        name: "립밤",
      },
      {
        id: 51,
        name: "립스틱",
      },
      {
        id: 70,
        name: "립오일",
      },
      {
        id: 50,
        name: "립틴트",
      },
      {
        id: 54,
        name: "립펜슬/라이너",
      },
      {
        id: 53,
        name: "립플럼퍼",
      },
    ],
  },
  {
    id: 3,
    name: "메이크업",
  },
  {
    id: 18,
    name: "메이크업 툴",
    children: [
      {
        id: 56,
        name: "브러쉬",
      },
      {
        id: 57,
        name: "속눈썹",
      },
      {
        id: 90,
        name: "툴 클렌저",
      },
      {
        id: 84,
        name: "트러블패치",
      },
      {
        id: 77,
        name: "퍼프/스펀지",
      },
    ],
  },
  {
    id: 20,
    name: "바디케어",
    children: [
      {
        id: 59,
        name: "바디로션/크림",
      },
      {
        id: 78,
        name: "바디미스트",
      },
      {
        id: 88,
        name: "바디오일",
      },
      {
        id: 58,
        name: "바디워시/입욕",
      },
      {
        id: 61,
        name: "풋케어",
      },
      {
        id: 60,
        name: "핸드케어",
      },
    ],
  },
  {
    id: 2,
    name: "선케어",
    children: [
      {
        id: 11,
        name: "선 스틱",
      },
      {
        id: 13,
        name: "선 스프레이/패치",
      },
      {
        id: 12,
        name: "선 쿠션",
      },
      {
        id: 10,
        name: "선 크림",
      },
      {
        id: 14,
        name: "태닝/애프터 선",
      },
    ],
  },
  {
    id: 1,
    name: "스킨케어",
    children: [
      {
        id: 74,
        name: "로션",
      },
      {
        id: 9,
        name: "마스크",
        children: [
          {
            id: 76,
            name: "마스크팩",
          },
          {
            id: 85,
            name: "수면팩",
          },
          {
            id: 31,
            name: "시트 마스크",
          },
          {
            id: 81,
            name: "워시오프팩",
          },
          {
            id: 32,
            name: "패치",
          },
        ],
      },
      {
        id: 6,
        name: "미스트/오일",
      },
      {
        id: 4,
        name: "스킨/토너",
        children: [
          {
            id: 22,
            name: "토너 패드",
          },
        ],
      },
      {
        id: 5,
        name: "에센스/세럼/앰플",
      },
      {
        id: 7,
        name: "크림",
        children: [
          {
            id: 24,
            name: "나이트크림",
          },
          {
            id: 25,
            name: "아이크림",
          },
          {
            id: 23,
            name: "페이스크림",
          },
        ],
      },
      {
        id: 8,
        name: "클렌징",
        children: [
          {
            id: 28,
            name: "립/아이리무버",
          },
          {
            id: 30,
            name: "워터/밀크",
          },
          {
            id: 79,
            name: "클렌징밤",
          },
          {
            id: 71,
            name: "클렌징오일",
          },
          {
            id: 87,
            name: "클렌징파우더",
          },
          {
            id: 26,
            name: "클렌징폼/젤",
          },
          {
            id: 29,
            name: "티슈/패드",
          },
          {
            id: 27,
            name: "필링/스크럽",
          },
        ],
      },
    ],
  },
  {
    id: 16,
    name: "아이 메이크업",
    children: [
      {
        id: 44,
        name: "마스카라",
      },
      {
        id: 68,
        name: "섀도우팔레트",
      },
      {
        id: 75,
        name: "스틱섀도우",
      },
      {
        id: 67,
        name: "싱글섀도우",
      },
      {
        id: 43,
        name: "아이라이너",
      },
      {
        id: 47,
        name: "아이래쉬케어",
      },
      {
        id: 45,
        name: "아이브로우",
      },
      {
        id: 46,
        name: "아이섀도우",
      },
      {
        id: 49,
        name: "아이프라이머",
      },
      {
        id: 48,
        name: "아이픽서",
      },
    ],
  },
  {
    id: 15,
    name: "페이스 메이크업",
    children: [
      {
        id: 41,
        name: "블러셔",
      },
      {
        id: 39,
        name: "세팅 스프레이/파우더",
      },
      {
        id: 82,
        name: "커버크림",
      },
      {
        id: 37,
        name: "컨실러",
      },
      {
        id: 42,
        name: "컨투어",
      },
      {
        id: 33,
        name: "쿠션",
      },
      {
        id: 35,
        name: "파우더/팩트",
      },
      {
        id: 34,
        name: "파운데이션",
      },
      {
        id: 38,
        name: "프라이머/코렉터",
      },
      {
        id: 40,
        name: "하이라이터",
      },
      {
        id: 36,
        name: "BB/CC/커버크림",
      },
    ],
  },
  {
    id: 21,
    name: "헤어케어",
    children: [
      {
        id: 64,
        name: "두피앰플/토닉",
      },
      {
        id: 62,
        name: "샴푸/린스",
      },
      {
        id: 66,
        name: "헤어 스타일링",
      },
      {
        id: 83,
        name: "헤어 오일",
      },
      {
        id: 63,
        name: "헤어 트리트먼트",
      },
      {
        id: 89,
        name: "헤어미스트",
      },
      {
        id: 65,
        name: "헤어에센스",
      },
    ],
  },
];

/**
 * 카테고리 ID로 노드 찾기
 */
export function findCategoryById(id: number): CategoryNode | undefined {
  const search = (nodes: CategoryNode[]): CategoryNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  return search(COSMETIC_CATEGORIES);
}

/**
 * 카테고리 이름으로 노드 찾기
 */
export function findCategoryByName(name: string): CategoryNode | undefined {
  const search = (nodes: CategoryNode[]): CategoryNode | undefined => {
    for (const node of nodes) {
      if (node.name === name) return node;
      if (node.children) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  return search(COSMETIC_CATEGORIES);
}

/**
 * 카테고리 경로 조회 (ID → ["대분류", "중분류", "소분류"])
 */
export function getCategoryPath(id: number): string[] | undefined {
  const search = (
    nodes: CategoryNode[],
    path: string[],
  ): string[] | undefined => {
    for (const node of nodes) {
      const currentPath = [...path, node.name];
      if (node.id === id) return currentPath;
      if (node.children) {
        const found = search(node.children, currentPath);
        if (found) return found;
      }
    }
    return undefined;
  };
  return search(COSMETIC_CATEGORIES, []);
}

/**
 * 카테고리 트리를 평면화된 경로 목록으로 변환
 *
 * @example
 * ["스킨케어 > 클렌징 > 클렌징폼/젤", "스킨케어 > 클렌징 > 클렌징오일", ...]
 */
export function flattenCategories(
  nodes: CategoryNode[] = COSMETIC_CATEGORIES,
  parentPath: string[] = [],
): string[] {
  const result: string[] = [];

  for (const node of nodes) {
    const currentPath = [...parentPath, node.name];

    if (node.children && node.children.length > 0) {
      result.push(...flattenCategories(node.children, currentPath));
    } else {
      result.push(currentPath.join(" > "));
    }
  }

  return result;
}

/**
 * 프롬프트용 카테고리 문자열 생성
 */
export function getCategoryPromptText(): string {
  return flattenCategories().join("\n");
}

/**
 * 대분류 목록 반환
 */
export function getPrimaryCategories(): CategoryNode[] {
  return COSMETIC_CATEGORIES;
}

/**
 * 특정 대분류의 중분류 목록 반환
 */
export function getSecondaryCategories(primaryName: string): CategoryNode[] {
  const primary = COSMETIC_CATEGORIES.find((c) => c.name === primaryName);
  return primary?.children ?? [];
}

/**
 * 모든 카테고리를 flat 배열로 반환 (ID, name, depth 포함)
 */
export function getAllCategoriesFlat(): Array<{
  id: number;
  name: string;
  depth: number;
  path: string;
}> {
  const result: Array<{
    id: number;
    name: string;
    depth: number;
    path: string;
  }> = [];

  const traverse = (
    nodes: CategoryNode[],
    depth: number,
    pathParts: string[],
  ) => {
    for (const node of nodes) {
      const currentPath = [...pathParts, node.name];
      result.push({
        id: node.id,
        name: node.name,
        depth,
        path: currentPath.join(" > "),
      });
      if (node.children) {
        traverse(node.children, depth + 1, currentPath);
      }
    }
  };

  traverse(COSMETIC_CATEGORIES, 0, []);
  return result;
}

/**
 * 제품 type 목록 반환 (프롬프트용)
 *
 * leaf 노드의 카테고리명을 "/" 기준으로 분해하여
 * 개별 type 목록 생성
 *
 * @example
 * "에센스/세럼/앰플" → ["에센스", "세럼", "앰플"]
 * "클렌징폼/젤" → ["클렌징폼", "젤"]
 * "립틴트" → ["립틴트"]
 *
 * @returns 중복 제거된 type 목록 (정렬됨)
 */
export function getExpandedTypeList(): string[] {
  const types = new Set<string>();

  const traverse = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        // 자식이 있으면 재귀 탐색
        traverse(node.children);
      } else {
        // leaf 노드: "/" 기준으로 분해
        const parts = node.name.split("/");
        for (const part of parts) {
          types.add(part.trim());
        }
      }
    }
  };

  traverse(COSMETIC_CATEGORIES);

  // 정렬하여 반환
  return Array.from(types).sort((a, b) => a.localeCompare(b, "ko"));
}

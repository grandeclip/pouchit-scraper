/**
 * 카테고리 변환 스크립트
 *
 * Supabase product_categories 테이블 JSON → TypeScript 변환
 *
 * 사용법:
 *   npx tsx scripts/generate-categories.ts <input-json-path>
 *
 * 예시:
 *   npx tsx scripts/generate-categories.ts data/categories/product_categories_20251209.json
 *
 * @note JSON 형식: [{ id, name, parent_id }, ...]
 * @note 출력: src/llm/data/cosmeticCategories.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================
// 설정
// ============================================

const OUTPUT_FILE = path.join(
  process.cwd(),
  "src/llm/data/cosmeticCategories.ts",
);

// ============================================
// 타입 정의
// ============================================

interface RawCategory {
  id: number;
  name: string;
  parent_id: number | null;
}

interface CategoryNode {
  id: number;
  name: string;
  children: CategoryNode[];
}

// ============================================
// 변환 로직
// ============================================

/**
 * Flat JSON을 트리 구조로 변환
 */
function buildTree(rawCategories: RawCategory[]): CategoryNode[] {
  const byId = new Map<number, CategoryNode>();

  // 모든 노드 생성
  rawCategories.forEach((c) => {
    byId.set(c.id, { id: c.id, name: c.name, children: [] });
  });

  const roots: CategoryNode[] = [];

  // 부모-자식 관계 연결
  rawCategories.forEach((c) => {
    const node = byId.get(c.id)!;
    if (c.parent_id === null) {
      roots.push(node);
    } else {
      const parent = byId.get(c.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // 부모가 없으면 루트로 처리
        console.warn(
          `  ⚠️  부모 없음: [${c.id}] ${c.name} (parent_id: ${c.parent_id})`,
        );
        roots.push(node);
      }
    }
  });

  // 이름순 정렬 (재귀)
  const sortByName = (nodes: CategoryNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    nodes.forEach((n) => sortByName(n.children));
  };
  sortByName(roots);

  return roots;
}

/**
 * 트리 구조를 TypeScript 코드로 변환
 */
function generateTypeScript(tree: CategoryNode[]): string {
  const indent = (depth: number) => "  ".repeat(depth);

  const nodeToString = (node: CategoryNode, depth: number): string => {
    const hasChildren = node.children.length > 0;
    const lines: string[] = [];

    lines.push(`${indent(depth)}{`);
    lines.push(`${indent(depth + 1)}id: ${node.id},`);
    lines.push(`${indent(depth + 1)}name: "${node.name}",`);

    if (hasChildren) {
      lines.push(`${indent(depth + 1)}children: [`);
      node.children.forEach((child, i) => {
        const childStr = nodeToString(child, depth + 2);
        const suffix = i < node.children.length - 1 ? "," : "";
        lines.push(childStr + suffix);
      });
      lines.push(`${indent(depth + 1)}],`);
    }

    lines.push(`${indent(depth)}}`);
    return lines.join("\n");
  };

  const treeString = tree
    .map((root, i) => {
      const suffix = i < tree.length - 1 ? "," : "";
      return nodeToString(root, 1) + suffix;
    })
    .join("\n");

  return `/**
 * 화장품 카테고리 분류 체계
 *
 * Supabase product_categories 테이블에서 자동 생성됨
 * 수동 수정 금지 - scripts/generate-categories.ts 사용
 *
 * @generated ${new Date().toISOString().split("T")[0]}
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
${treeString}
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
  const search = (nodes: CategoryNode[], path: string[]): string[] | undefined => {
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
  return flattenCategories().join("\\n");
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
  const result: Array<{ id: number; name: string; depth: number; path: string }> = [];

  const traverse = (nodes: CategoryNode[], depth: number, pathParts: string[]) => {
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
`;
}

// ============================================
// CLI
// ============================================

function printUsage(): void {
  console.log(`
사용법:
  npx tsx scripts/generate-categories.ts <input-json-path>

예시:
  npx tsx scripts/generate-categories.ts data/categories/product_categories_20251209.json

설명:
  Supabase product_categories 테이블에서 추출한 JSON 파일을
  TypeScript 코드로 변환하여 src/llm/data/cosmeticCategories.ts에 저장합니다.

JSON 형식:
  [{ "id": 1, "name": "스킨케어", "parent_id": null }, ...]
`);
}

// ============================================
// 메인 실행
// ============================================

async function main(): Promise<void> {
  // CLI 인자 파싱
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const inputFile = path.resolve(process.cwd(), args[0]);

  console.log("🔄 카테고리 변환 시작\n");

  // 1. JSON 파일 읽기
  console.log(`📥 입력: ${inputFile}`);
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${inputFile}`);
    process.exit(1);
  }

  const rawData = JSON.parse(
    fs.readFileSync(inputFile, "utf-8"),
  ) as RawCategory[];
  console.log(`   ${rawData.length}개 카테고리 로드됨`);

  // 2. 트리 구조 변환
  console.log("\n🌳 트리 구조 변환 중...");
  const tree = buildTree(rawData);

  // 통계
  const countNodes = (
    nodes: CategoryNode[],
  ): { total: number; byDepth: number[] } => {
    const byDepth: number[] = [0, 0, 0];
    const count = (nodes: CategoryNode[], depth: number): number => {
      let total = nodes.length;
      byDepth[depth] = (byDepth[depth] || 0) + nodes.length;
      for (const node of nodes) {
        if (node.children) {
          total += count(node.children, depth + 1);
        }
      }
      return total;
    };
    return { total: count(nodes, 0), byDepth };
  };

  const stats = countNodes(tree);
  console.log(`   대분류: ${stats.byDepth[0]}개`);
  console.log(`   중분류: ${stats.byDepth[1]}개`);
  console.log(`   소분류: ${stats.byDepth[2]}개`);
  console.log(`   총계: ${stats.total}개`);

  // 3. TypeScript 코드 생성
  console.log("\n📝 TypeScript 코드 생성 중...");
  const tsCode = generateTypeScript(tree);

  // 4. 파일 저장
  fs.writeFileSync(OUTPUT_FILE, tsCode, "utf-8");
  console.log(`\n📤 출력: ${OUTPUT_FILE}`);

  console.log("\n✅ 변환 완료!");
}

main().catch((err) => {
  console.error("❌ 에러:", err);
  process.exit(1);
});

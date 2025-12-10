/**
 * URL Selector
 *
 * LLM 상품 설명 생성을 위한 URL 선택 유틸리티
 * - 플랫폼 우선순위 기반 선택
 * - 총 개수 및 플랫폼당 개수 제한
 */

import {
  PLATFORM_DOMAINS,
  PLATFORM_PRIORITY,
  URL_SELECTION_LIMITS,
} from "@/llm/config/urlSelectionConfig";
import { logger } from "@/config/logger";

/**
 * URL 선택 결과
 */
export interface UrlSelectionResult {
  /** 선택된 URL 목록 */
  selectedUrls: string[];
  /** 플랫폼별 선택된 URL 개수 */
  selectionByPlatform: Record<string, number>;
  /** 원본 URL 개수 */
  originalCount: number;
  /** 선택된 URL 개수 */
  selectedCount: number;
}

/**
 * URL에서 플랫폼 식별
 */
function identifyPlatform(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS)) {
      if (domains.some((domain) => hostname.includes(domain))) {
        return platform;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * URL을 플랫폼별로 그룹화
 */
function groupUrlsByPlatform(urls: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const url of urls) {
    const platform = identifyPlatform(url);
    if (platform) {
      const existing = grouped.get(platform) || [];
      existing.push(url);
      grouped.set(platform, existing);
    }
  }

  return grouped;
}

/**
 * 우선순위 기반 URL 선택
 *
 * 규칙:
 * 1. 총 1~3개 URL 선택
 * 2. 플랫폼당 최대 2개
 * 3. 우선순위: oliveyoung → musinsa → ably → zigzag → hwahae → kurly
 *
 * @param urls - 입력 URL 목록
 * @returns 선택 결과
 */
export function selectUrls(urls: string[]): UrlSelectionResult {
  const grouped = groupUrlsByPlatform(urls);
  const selectedUrls: string[] = [];
  const selectionByPlatform: Record<string, number> = {};

  let remaining = URL_SELECTION_LIMITS.maxTotal;

  for (const platform of PLATFORM_PRIORITY) {
    if (remaining <= 0) break;

    const platformUrls = grouped.get(platform);
    if (!platformUrls || platformUrls.length === 0) continue;

    const toSelect = Math.min(
      platformUrls.length,
      URL_SELECTION_LIMITS.maxPerPlatform,
      remaining,
    );

    selectedUrls.push(...platformUrls.slice(0, toSelect));
    selectionByPlatform[platform] = toSelect;
    remaining -= toSelect;
  }

  logger.debug(
    {
      original_count: urls.length,
      selected_count: selectedUrls.length,
      selection_by_platform: selectionByPlatform,
      selected_urls: selectedUrls,
    },
    "[UrlSelector] URL 선택 완료",
  );

  return {
    selectedUrls,
    selectionByPlatform,
    originalCount: urls.length,
    selectedCount: selectedUrls.length,
  };
}

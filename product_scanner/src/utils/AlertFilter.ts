/**
 * Alert Filter Utility
 *
 * Alert 발송 시 플랫폼 필터링 로직
 * - 기본: 6개 주요 플랫폼만 Alert 발송 (oliveyoung, hwahae, musinsa, ably, kurly, zigzag)
 * - 예외: 서울 시간 15:00-15:30 사이에는 필터링 없이 전체 Alert 발송
 */

import {
  PlatformDetector,
  SUPPORTED_PLATFORMS,
  SupportedPlatform,
} from "@/services/extract/url/PlatformDetector";

/**
 * Alert 필터링 대상 플랫폼 목록
 * (PlatformDetector의 SUPPORTED_PLATFORMS와 동일)
 */
export const ALERT_TARGET_PLATFORMS: readonly string[] = SUPPORTED_PLATFORMS;

/**
 * 필터링 없이 Alert을 보내는 시간대 (KST)
 */
const NO_FILTER_TIME_WINDOW = {
  START_HOUR: 15,
  START_MINUTE: 0,
  END_HOUR: 15,
  END_MINUTE: 30,
};

/**
 * 현재 시간이 필터링 없이 Alert을 보내는 시간대인지 확인
 * @returns true: 필터링 없이 전체 Alert 발송, false: 플랫폼 필터링 적용
 */
export function isNoFilterTimeWindow(): boolean {
  // 서울 시간 (KST = UTC+9)
  const now = new Date();
  const kstOffset = 9 * 60; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const kstMinutes = utcMinutes + kstOffset;

  // 자정 넘김 처리
  const adjustedKstMinutes =
    kstMinutes >= 24 * 60 ? kstMinutes - 24 * 60 : kstMinutes;

  const startMinutes =
    NO_FILTER_TIME_WINDOW.START_HOUR * 60 + NO_FILTER_TIME_WINDOW.START_MINUTE;
  const endMinutes =
    NO_FILTER_TIME_WINDOW.END_HOUR * 60 + NO_FILTER_TIME_WINDOW.END_MINUTE;

  return adjustedKstMinutes >= startMinutes && adjustedKstMinutes < endMinutes;
}

/**
 * link_url이 Alert 대상 플랫폼인지 확인
 * @param linkUrl 상품 링크 URL
 * @returns true: Alert 대상, false: Alert 제외
 */
export function isAlertTargetPlatform(linkUrl: string | undefined): boolean {
  if (!linkUrl) {
    return false;
  }

  const platform = PlatformDetector.detectPlatform(linkUrl);
  return platform !== null;
}

/**
 * 실패 항목 필터링 (플랫폼 기반)
 *
 * @param failedItems 실패 항목 배열
 * @param getLinkUrl 각 항목에서 link_url을 추출하는 함수
 * @returns 필터링된 실패 항목 배열
 *
 * @example
 * const filtered = filterFailedItemsByPlatform(
 *   failedItems,
 *   (item) => item.link_url
 * );
 */
export function filterFailedItemsByPlatform<T>(
  failedItems: T[],
  getLinkUrl: (item: T) => string | undefined,
): T[] {
  // 15:00-15:30 KST 시간대에는 필터링 없이 전체 반환
  if (isNoFilterTimeWindow()) {
    return failedItems;
  }

  // 플랫폼 필터링 적용
  return failedItems.filter((item) => {
    const linkUrl = getLinkUrl(item);
    return isAlertTargetPlatform(linkUrl);
  });
}

/**
 * Alert 발송 여부 결정
 *
 * @param originalFailedCount 원본 실패 항목 수
 * @param filteredFailedCount 필터링 후 실패 항목 수
 * @param debugMode 디버그 모드 (true: 성공 시에도 알림)
 * @returns true: Alert 발송, false: Alert 미발송
 */
export function shouldSendAlert(
  originalFailedCount: number,
  filteredFailedCount: number,
  debugMode: boolean,
): boolean {
  // 디버그 모드: 항상 발송
  if (debugMode) {
    return true;
  }

  // 필터링 후 실패 항목이 있으면 발송
  return filteredFailedCount > 0;
}

/**
 * Alert 필터링 결과
 */
export interface AlertFilterResult<T> {
  /** 필터링된 실패 항목 */
  filteredItems: T[];
  /** 필터링 여부 (true: 필터링 적용됨, false: 전체 발송) */
  wasFiltered: boolean;
  /** 제외된 항목 수 */
  excludedCount: number;
}

/**
 * Alert 필터링 실행 (결과 정보 포함)
 *
 * @param failedItems 실패 항목 배열
 * @param getLinkUrl 각 항목에서 link_url을 추출하는 함수
 * @returns 필터링 결과
 */
export function applyAlertFilter<T>(
  failedItems: T[],
  getLinkUrl: (item: T) => string | undefined,
): AlertFilterResult<T> {
  const isNoFilter = isNoFilterTimeWindow();

  if (isNoFilter) {
    return {
      filteredItems: failedItems,
      wasFiltered: false,
      excludedCount: 0,
    };
  }

  const filteredItems = failedItems.filter((item) => {
    const linkUrl = getLinkUrl(item);
    return isAlertTargetPlatform(linkUrl);
  });

  return {
    filteredItems,
    wasFiltered: true,
    excludedCount: failedItems.length - filteredItems.length,
  };
}

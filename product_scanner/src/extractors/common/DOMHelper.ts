/**
 * DOMHelper Utility
 *
 * 목적: Playwright Page DOM 안전 접근 유틸리티
 * 패턴: Utility Class (Static Methods)
 */

import type { Page } from "playwright";

/**
 * DOM 헬퍼 유틸리티
 *
 * Playwright Page에서 DOM 요소에 안전하게 접근하는 정적 메서드 제공
 * - 에러 발생 시 기본값 반환 (try-catch 자동 처리)
 * - Mobile/Desktop 우선순위 패턴 지원
 */
export class DOMHelper {
  /**
   * 안전한 텍스트 추출
   *
   * selector에 해당하는 요소의 textContent를 추출
   * 요소가 없거나 에러 발생 시 기본값 반환
   *
   * @param page Playwright Page 객체
   * @param selector CSS Selector
   * @param defaultValue 기본값 (기본: 빈 문자열)
   * @returns 추출된 텍스트 또는 기본값
   */
  static async safeText(
    page: Page,
    selector: string,
    defaultValue: string = "",
  ): Promise<string> {
    try {
      const text = await page.$eval(selector, (el) => el.textContent);
      const trimmed = text?.trim();
      return trimmed || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Mobile 우선 selector
   *
   * Mobile selector 먼저 시도 → 실패 시 Desktop selector로 fallback
   * oliveyoung 패턴: Mobile 우선, Desktop fallback
   *
   * @param page Playwright Page 객체
   * @param mobileSelector Mobile CSS Selector
   * @param desktopSelector Desktop CSS Selector
   * @returns 추출된 텍스트 또는 빈 문자열
   */
  static async querySelectorMobile(
    page: Page,
    mobileSelector: string,
    desktopSelector: string,
  ): Promise<string> {
    // Mobile 우선 시도
    const mobileText = await this.safeText(page, mobileSelector, "");
    if (mobileText) {
      return mobileText;
    }

    // Desktop fallback
    return await this.safeText(page, desktopSelector, "");
  }

  /**
   * 안전한 속성 추출
   *
   * selector에 해당하는 요소의 속성(attribute)을 추출
   * 요소가 없거나 속성이 없으면 기본값 반환
   *
   * @param page Playwright Page 객체
   * @param selector CSS Selector
   * @param attribute 속성명 (예: "src", "href")
   * @param defaultValue 기본값 (기본: 빈 문자열)
   * @returns 추출된 속성 값 또는 기본값
   */
  static async safeAttribute(
    page: Page,
    selector: string,
    attribute: string,
    defaultValue: string = "",
  ): Promise<string> {
    try {
      const value = await page.$eval(
        selector,
        (el, attr) => {
          return el.getAttribute(attr);
        },
        attribute,
      );

      return value || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * 요소 존재 여부 확인
   *
   * selector에 해당하는 요소가 DOM에 존재하는지 확인
   *
   * @param page Playwright Page 객체
   * @param selector CSS Selector
   * @returns 존재 여부
   */
  static async hasElement(page: Page, selector: string): Promise<boolean> {
    try {
      const count = await page.locator(selector).count();
      return count > 0;
    } catch {
      return false;
    }
  }
}

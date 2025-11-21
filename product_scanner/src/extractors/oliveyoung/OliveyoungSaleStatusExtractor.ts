/**
 * OliveyoungSaleStatusExtractor
 *
 * 목적: 올리브영 판매 상태 정보 추출
 * 패턴: Strategy Pattern
 * 표준: schema.org ItemAvailability 규약 준수
 * 참고: docs/analysis/oliveyoung-logic-analysis.md L232-282
 */

import type { Page } from "playwright";
import type {
  ISaleStatusExtractor,
  SaleStatusData,
  SaleStatus,
} from "@/extractors/base";
import { DOMHelper } from "@/extractors/common/DOMHelper";

/**
 * 올리브영 판매 상태 추출기
 *
 * 전략 (oliveyoung.yaml 원본 로직 - 8단계 체크):
 * 1. 상품 정보 없음 체크 → Discontinued
 * 2. 404 페이지 체크 → Discontinued
 * 3. Mobile 구매 버튼 체크 → InStock/OutOfStock/Discontinued
 * 4. Desktop 버튼 체크 → InStock
 * 5. Mobile 재입고 버튼 체크 → OutOfStock
 * 6. Desktop 품절 버튼 체크 → SoldOut
 * 7. 가격 존재 여부 체크 → InStock
 * 8. 기본값 → Discontinued
 */
import { OliveyoungSelectors } from "@/core/domain/OliveyoungConfig";

export class OliveyoungSaleStatusExtractor implements ISaleStatusExtractor {
  /**
   * Button Selector 목록
   */
  private readonly BUTTON_SELECTORS: {
    mobileBuy: string;
    mobileRestock: string;
    desktopBuy: string;
    desktopBasket: string;
    desktopSoldout: string;
  };

  /**
   * 기타 Selector (Mobile 우선)
   */
  private readonly SELECTORS: {
    productName: string[];
    errorPage: string;
    price: string[];
  };

  constructor(selectors?: OliveyoungSelectors) {
    if (selectors) {
      this.BUTTON_SELECTORS = {
        mobileBuy: selectors.saleStatus.mobileBuy,
        mobileRestock: selectors.saleStatus.mobileRestock,
        desktopBuy: selectors.saleStatus.desktopBuy,
        desktopBasket: selectors.saleStatus.desktopBasket,
        desktopSoldout: selectors.saleStatus.desktopSoldout,
      };
      this.SELECTORS = {
        productName: selectors.productName,
        errorPage: selectors.saleStatus.errorPage,
        price: selectors.price,
      };
    } else {
      this.BUTTON_SELECTORS = {
        // Mobile (ID selector 우선)
        mobileBuy:
          "#publBtnBuy, #publBtnBasket, .btnBuy, .btn-buy, .btnBasket, .btn_basket",
        mobileRestock: ".btnReStock, .restock-alert",

        // Desktop
        desktopBuy: ".btnBuy",
        desktopBasket: ".btnBasket",
        desktopSoldout: ".btnSoldout",
      };
      this.SELECTORS = {
        // CSS Modules로 클래스명이 동적이므로 태그 기반 selector 사용
        productName: ["h3", ".info-group__title", ".prd_name"], // Mobile (h3), Desktop
        errorPage: ".error_title",
        price: [".info-group__price", ".prd_price"], // Mobile, Desktop
      };
    }
  }

  /**
   * 판매 상태 정보 추출
   *
   * @param page Playwright Page 객체
   * @returns 추출된 판매 상태 데이터
   */
  async extract(page: Page): Promise<SaleStatusData> {
    // 1단계: 상품 정보 없음 체크
    const hasProduct = await this.hasProductInfo(page);
    if (!hasProduct) {
      return this.createStatus("Discontinued", "판매 중지");
    }

    // 2단계: 404 페이지 체크
    const is404 = await this.is404Page(page);
    if (is404) {
      return this.createStatus("Discontinued", "판매 중지");
    }

    // 3단계: Mobile 구매 버튼 체크
    const mobileButtonStatus = await this.checkMobileButton(page);
    if (mobileButtonStatus) {
      return mobileButtonStatus;
    }

    // 4단계: Desktop 버튼 체크
    const desktopButtonStatus = await this.checkDesktopButton(page);
    if (desktopButtonStatus) {
      return desktopButtonStatus;
    }

    // 5단계: Mobile 재입고 버튼 체크
    const hasRestock = await DOMHelper.hasElement(
      page,
      this.BUTTON_SELECTORS.mobileRestock,
    );
    if (hasRestock) {
      return this.createStatus("OutOfStock", "일시품절");
    }

    // 6단계: Desktop 품절 버튼 체크
    const hasSoldout = await DOMHelper.hasElement(
      page,
      this.BUTTON_SELECTORS.desktopSoldout,
    );
    if (hasSoldout) {
      return this.createStatus("SoldOut", "품절");
    }

    // 7단계: 가격 존재 여부 체크 (Mobile 우선)
    const hasPrice = await this.hasAnyElement(page, this.SELECTORS.price);
    if (hasPrice) {
      return this.createStatus("InStock", "판매중");
    }

    // 8단계: 기본값
    return this.createStatus("Discontinued", "판매 중지");
  }

  /**
   * 상품 정보 존재 여부 확인 (Mobile 우선)
   *
   * @param page Playwright Page 객체
   * @returns 상품 정보 존재 여부
   */
  private async hasProductInfo(page: Page): Promise<boolean> {
    return await this.hasAnyElement(page, this.SELECTORS.productName);
  }

  /**
   * 여러 selector 중 하나라도 존재하는지 확인
   *
   * @param page Playwright Page 객체
   * @param selectors Selector 배열 또는 단일 selector
   * @returns 존재 여부
   */
  private async hasAnyElement(
    page: Page,
    selectors: string[] | string,
  ): Promise<boolean> {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of selectorArray) {
      const has = await DOMHelper.hasElement(page, selector);
      if (has) {
        return true;
      }
    }

    return false;
  }

  /**
   * 404 페이지 여부 확인
   *
   * @param page Playwright Page 객체
   * @returns 404 페이지 여부
   */
  private async is404Page(page: Page): Promise<boolean> {
    // 1. URL 체크
    if (page.url().includes("invalid.do") || page.url().includes("nogoods")) {
      return true;
    }

    // 2. 에러 메시지 체크
    const bodyText = await page.textContent("body");
    if (
      bodyText?.includes("상품을 찾을 수 없습니다") ||
      bodyText?.includes("상품을 찾을 수 없어요") ||
      bodyText?.includes("판매종료") ||
      bodyText?.includes("판매 중지")
    ) {
      return true;
    }

    return await DOMHelper.hasElement(page, this.SELECTORS.errorPage);
  }

  /**
   * Mobile 구매 버튼 체크 (CSS Modules 대응)
   *
   * CSS Modules로 인한 동적 클래스명 문제 해결:
   * - 기존: `.btnBuy` 같은 클래스 selector 사용
   * - 현재: 모든 button 요소 순회 + textContent 기반 판단
   *
   * 전략:
   * 1. 모든 button 요소 가져오기 (page.$$("button"))
   * 2. 각 button의 textContent와 visibility 확인
   * 3. 텍스트 패턴 매칭으로 상태 판단:
   *    - "일시품절" → OutOfStock
   *    - "품절" → SoldOut
   *    - "바로구매", "구매하기", "장바구니" → InStock
   *    - "전시기간", "판매중지" → Discontinued
   * 4. Visible 버튼 우선, 없으면 hidden 버튼 사용
   *
   * @param page Playwright Page 객체
   * @returns 판매 상태 (버튼 없으면 null)
   */
  private async checkMobileButton(page: Page): Promise<SaleStatusData | null> {
    // CSS Modules로 인해 클래스명이 동적이므로 모든 button 검사
    const allButtons = await page.$$("button");

    let hiddenCandidate: SaleStatusData | null = null;

    for (const button of allButtons) {
      const text = (await button.textContent())?.trim() || "";
      const isVisible = await button.isVisible();

      // 버튼 텍스트 기반 상태 판단
      let status: SaleStatusData | null = null;

      if (text.includes("일시품절")) {
        status = this.createStatus("OutOfStock", "일시품절");
      } else if (text.includes("품절")) {
        // "일시품절"이 아닌 일반 "품절"
        status = this.createStatus("SoldOut", "품절");
      } else if (
        text.includes("바로구매") ||
        text.includes("구매하기") ||
        text.includes("장바구니")
      ) {
        status = this.createStatus("InStock", "판매중");
      } else if (text.includes("전시기간") || text.includes("판매중지")) {
        status = this.createStatus("Discontinued", "판매 중지");
      }

      if (status) {
        if (isVisible) {
          return status; // Visible match found, return immediately
        }
        if (!hiddenCandidate) {
          hiddenCandidate = status; // Store first hidden match as candidate
        }
      }
    }

    // If no visible match, return hidden candidate if exists
    if (hiddenCandidate) {
      return hiddenCandidate;
    }

    return null;
  }

  /**
   * Desktop 버튼 체크
   *
   * @param page Playwright Page 객체
   * @returns 판매 상태 (버튼 없으면 null)
   */
  private async checkDesktopButton(page: Page): Promise<SaleStatusData | null> {
    // .btnBuy 체크
    const hasBuyButton = await DOMHelper.hasElement(
      page,
      this.BUTTON_SELECTORS.desktopBuy,
    );
    if (hasBuyButton) {
      return this.createStatus("InStock", "판매중");
    }

    // .btnBasket 체크
    const hasBasketButton = await DOMHelper.hasElement(
      page,
      this.BUTTON_SELECTORS.desktopBasket,
    );
    if (hasBasketButton) {
      return this.createStatus("InStock", "판매중");
    }

    return null;
  }

  /**
   * 판매 상태 데이터 생성
   *
   * @param saleStatus 판매 상태 코드
   * @param statusText 상태 텍스트
   * @returns 판매 상태 데이터
   */
  private createStatus(
    saleStatus: SaleStatus,
    statusText: string,
  ): SaleStatusData {
    return {
      saleStatus,
      statusText,
      isAvailable: saleStatus === "InStock",
    };
  }
}

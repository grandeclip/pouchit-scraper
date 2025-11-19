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
export class OliveyoungSaleStatusExtractor implements ISaleStatusExtractor {
  /**
   * Button Selector 목록
   */
  private readonly BUTTON_SELECTORS = {
    // Mobile
    mobileBuy: "#publBtnBuy",
    mobileRestock: ".btnReStock",

    // Desktop
    desktopBuy: ".btnBuy",
    desktopBasket: ".btnBasket",
    desktopSoldout: ".btnSoldout",
  };

  /**
   * 기타 Selector
   */
  private readonly SELECTORS = {
    productName: ".prd_name",
    errorPage: ".error_title",
    price: ".prd_price",
  };

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

    // 7단계: 가격 존재 여부 체크
    const hasPrice = await DOMHelper.hasElement(page, this.SELECTORS.price);
    if (hasPrice) {
      return this.createStatus("InStock", "판매중");
    }

    // 8단계: 기본값
    return this.createStatus("Discontinued", "판매 중지");
  }

  /**
   * 상품 정보 존재 여부 확인
   *
   * @param page Playwright Page 객체
   * @returns 상품 정보 존재 여부
   */
  private async hasProductInfo(page: Page): Promise<boolean> {
    return await DOMHelper.hasElement(page, this.SELECTORS.productName);
  }

  /**
   * 404 페이지 여부 확인
   *
   * @param page Playwright Page 객체
   * @returns 404 페이지 여부
   */
  private async is404Page(page: Page): Promise<boolean> {
    return await DOMHelper.hasElement(page, this.SELECTORS.errorPage);
  }

  /**
   * Mobile 구매 버튼 체크
   *
   * @param page Playwright Page 객체
   * @returns 판매 상태 (버튼 없으면 null)
   */
  private async checkMobileButton(page: Page): Promise<SaleStatusData | null> {
    const hasMobileButton = await DOMHelper.hasElement(
      page,
      this.BUTTON_SELECTORS.mobileBuy,
    );

    if (!hasMobileButton) {
      return null;
    }

    // 버튼 텍스트 확인
    const buttonText = await DOMHelper.safeText(
      page,
      this.BUTTON_SELECTORS.mobileBuy,
    );

    // 버튼 텍스트 기반 상태 판단
    if (buttonText.includes("일시품절")) {
      return this.createStatus("OutOfStock", "일시품절");
    }

    if (buttonText.includes("바로구매") || buttonText.includes("구매하기")) {
      return this.createStatus("InStock", "판매중");
    }

    if (buttonText.includes("전시기간")) {
      return this.createStatus("Discontinued", "판매 중지");
    }

    // 버튼은 있지만 매칭되는 텍스트 없음 → 다음 단계로
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

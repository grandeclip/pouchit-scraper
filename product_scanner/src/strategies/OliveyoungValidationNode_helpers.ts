/**
 * Oliveyoung 스크래핑 헬퍼 함수들
 */

import type { Page } from "playwright";
import { SCRAPER_CONFIG } from "@/config/constants";
import {
  OliveyoungProduct,
  OliveyoungDOMResponse,
} from "@/core/domain/OliveyoungProduct";

/**
 * DOM 데이터 추출 결과 타입
 */
interface ScrapedDOMData {
  name: string;
  brand: string;
  title_images: string[];
  consumer_price: number;
  price: number;
  sale_status: string;
  _source: string;
  _redirected: boolean;
}

/**
 * Page를 사용하여 올리브영 상품 스크래핑
 */
export async function scrapeOliveyoungProduct(
  page: Page,
  goodsNo: string,
): Promise<OliveyoungProduct> {
  // 상품 페이지로 이동
  const url = `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`;

  await page.goto(url, {
    waitUntil: "networkidle",
    timeout: SCRAPER_CONFIG.NAVIGATION_TIMEOUT_MS,
  });

  // 페이지 렌더링 대기
  await page.waitForTimeout(SCRAPER_CONFIG.PAGE_RENDER_DELAY_MS);

  // DOM에서 데이터 추출 (함수로 전달 - 타입 안전성 보장)
  // Browser context에서 실행되므로 DOM API 사용 (TypeScript는 Node.js 환경으로 인식)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const domData: ScrapedDOMData = await page.evaluate((): any => {
    // @ts-ignore - Browser context에서 실행 (DOM API 사용)
    const productNameEl = document.querySelector(".prd_name");
    const productName = productNameEl ? productNameEl.textContent?.trim() : "";

    // 상품 정보 없음 체크
    if (!productName) {
      return {
        name: "삭제된 상품",
        brand: "",
        title_images: ["https://via.placeholder.com/1x1"],
        consumer_price: 0,
        price: 0,
        sale_status: "STSEL",
        _source: "not_found",
        _redirected: true,
      };
    }

    // 브랜드 추출
    // @ts-ignore - Browser context
    const brandEl = document.querySelector(".prd_brand");
    const brand = brandEl ? brandEl.textContent?.trim() : "";

    // 이미지 추출
    // @ts-ignore - Browser context
    const imageEl = document.querySelector(".prd_img img");
    const thumbnail = imageEl ? imageEl.getAttribute("src") : "";

    // 정가 추출
    // @ts-ignore - Browser context
    const originalPriceEl = document.querySelector(".price-1");
    const originalPriceText = originalPriceEl
      ? originalPriceEl.textContent?.trim()
      : "";
    const originalPriceMatch = originalPriceText?.match(/(\d{1,3}(?:,\d{3})*)/);
    const consumerPrice = originalPriceMatch
      ? parseInt(originalPriceMatch[1].replace(/,/g, ""))
      : 0;

    // 판매가 추출
    // @ts-ignore - Browser context
    const priceEl = document.querySelector(".price-2");
    const priceText = priceEl ? priceEl.textContent?.trim() : "";
    const priceMatch = priceText?.match(/(\d{1,3}(?:,\d{3})*)/);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : 0;

    // 판매 상태 판단
    const isVisible = (el: any): boolean => {
      if (!el) return false;
      // @ts-ignore - Browser context
      const style = window.getComputedStyle(el);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    };

    let saleStatus = "STSEL";
    // @ts-ignore - Browser context
    const soldOutBtn = document.querySelector(".btnSoldout");
    if (soldOutBtn && isVisible(soldOutBtn)) {
      saleStatus = "SLDOT";
    } else {
      // @ts-ignore - Browser context
      const restockBtn = document.querySelector(".btnReStock");
      if (restockBtn && isVisible(restockBtn)) {
        saleStatus = "SLDOT";
      } else {
        // @ts-ignore - Browser context
        const buyBtn = document.querySelector(".btnBuy, .btnBasket");
        if (buyBtn && isVisible(buyBtn)) {
          saleStatus = "SELNG";
        }
      }
    }

    return {
      name: productName,
      brand: brand || "",
      title_images: [thumbnail || ""],
      consumer_price: consumerPrice,
      price: price,
      sale_status: saleStatus,
      _source: "oliveyoung",
      _redirected: false,
    };
  });

  // OliveyoungProduct로 변환
  return OliveyoungProduct.fromDOMData({
    ...domData,
    id: goodsNo,
    goodsNo,
  } as OliveyoungDOMResponse);
}

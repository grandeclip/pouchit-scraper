/**
 * Next.js __NEXT_DATA__ 데이터 추출기
 *
 * SOLID 원칙:
 * - SRP: __NEXT_DATA__ SSR 데이터 추출만 담당
 * - OCP: 새로운 Next.js 패턴 추가 시 확장 가능
 * - DIP: 추상 인터페이스에 의존
 *
 * Design Pattern:
 * - Strategy Pattern: 추출 전략 캡슐화
 *
 * 목적:
 * - ZigZag Next.js SSR 데이터 추출
 * - YAML에서 비즈니스 로직 분리
 * - 단위 테스트 가능한 추출 로직
 */

import type { Page } from "playwright";
import { logger } from "@/config/logger";
import type { NextDataProductData } from "@/core/domain/NextDataProductData";

/**
 * __NEXT_DATA__ 추출 설정
 */
export interface NextDataConfig {
  /** __NEXT_DATA__ script selector */
  selector: string;
  /** 데이터 경로 (props.pageProps) */
  dataPath: string;
  /** 삭제된 상품 fallback 데이터 */
  fallback: {
    name: string;
    thumbnail: string;
    price: number;
    sale_status: string;
  };
}

/**
 * Browser Context 전달 설정
 */
interface BrowserExtractionConfig {
  selector: string;
  dataPath: string;
  fallback: NextDataConfig["fallback"];
}

/**
 * Browser Context 추출 함수 타입
 */
type BrowserExtractionFunction = (
  config: BrowserExtractionConfig,
) => NextDataProductData;

/**
 * Next.js __NEXT_DATA__ Extractor
 */
export class NextDataSchemaExtractor {
  private config: NextDataConfig;

  constructor(config: NextDataConfig) {
    this.config = config;
  }

  /**
   * Page에서 __NEXT_DATA__ 데이터 추출
   */
  async extract(page: Page): Promise<NextDataProductData> {
    const url = page.url();

    try {
      const browserConfig: BrowserExtractionConfig = {
        selector: this.config.selector,
        dataPath: this.config.dataPath,
        fallback: this.config.fallback,
      };

      // page.evaluate()는 직렬화된 함수를 브라우저로 전송
      const result = await page.evaluate(
        this.createExtractionScript(),
        browserConfig,
      );

      logger.debug({ result, url }, "__NEXT_DATA__ 추출 완료");

      return result as NextDataProductData;
    } catch (error) {
      const errorType =
        error instanceof Error ? error.constructor.name : "UnknownError";
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          error: message,
          errorType,
          url,
          selector: this.config.selector,
          dataPath: this.config.dataPath,
        },
        "__NEXT_DATA__ 추출 실패",
      );

      // Fallback 반환
      return this.createFallbackData("extraction_error");
    }
  }

  /**
   * 추출 스크립트 생성 (Browser Context에서 실행)
   *
   * NOTE: 이 함수는 Page.evaluate()에서 실행되므로 브라우저 컨텍스트
   */
  private createExtractionScript(): BrowserExtractionFunction {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (config: BrowserExtractionConfig): any => {
      const { selector, fallback } = config;

      // 1. __NEXT_DATA__ 스크립트 찾기
      const nextDataScript = document.querySelector(selector);

      if (!nextDataScript || !nextDataScript.textContent) {
        // __NEXT_DATA__ 없음 = 오류
        return {
          id: "",
          name: fallback.name,
          brand: "",
          thumbnail: fallback.thumbnail,
          originalPrice: fallback.price,
          discountedPrice: fallback.price,
          salesStatus: fallback.sale_status,
          isPurchasable: false,
          displayStatus: "HIDDEN",
          _source: "no_next_data",
        };
      }

      // 2. JSON 파싱
      let data: any;
      try {
        data = JSON.parse(nextDataScript.textContent);
      } catch (error) {
        return {
          id: "",
          name: fallback.name,
          brand: "",
          thumbnail: fallback.thumbnail,
          originalPrice: fallback.price,
          discountedPrice: fallback.price,
          salesStatus: fallback.sale_status,
          isPurchasable: false,
          displayStatus: "HIDDEN",
          _source: "next_data_parse_error",
        };
      }

      // 3. props.pageProps 경로 접근
      const pageProps = data?.props?.pageProps;
      if (!pageProps) {
        return {
          id: "",
          name: fallback.name,
          brand: "",
          thumbnail: fallback.thumbnail,
          originalPrice: fallback.price,
          discountedPrice: fallback.price,
          salesStatus: fallback.sale_status,
          isPurchasable: false,
          displayStatus: "HIDDEN",
          _source: "no_page_props",
        };
      }

      const product = pageProps.product;
      const shop = pageProps.shop;

      if (!product) {
        return {
          id: "",
          name: fallback.name,
          brand: "",
          thumbnail: fallback.thumbnail,
          originalPrice: fallback.price,
          discountedPrice: fallback.price,
          salesStatus: fallback.sale_status,
          isPurchasable: false,
          displayStatus: "HIDDEN",
          _source: "no_product_data",
        };
      }

      // 4. 데이터 추출
      const id = String(product.id || "");
      const name = product.name || "";
      const brand = shop?.name || product.shop_name || "";

      // 썸네일 (MAIN 이미지 찾기)
      let thumbnail = fallback.thumbnail;
      if (
        product.product_image_list &&
        Array.isArray(product.product_image_list)
      ) {
        const mainImage = product.product_image_list.find(
          (img: any) => img.image_type === "MAIN",
        );
        if (mainImage?.pdp_thumbnail_url) {
          thumbnail = mainImage.pdp_thumbnail_url;
        }
      }

      // 가격 정보
      const originalPrice = product.product_price?.max_price_info?.price || 0;
      const discountedPrice =
        product.product_price?.final_discount_info?.discount_price ||
        originalPrice;

      // 판매 상태
      const salesStatus = product.sales_status || "SUSPENDED";
      const isPurchasable =
        product.is_purchasable !== undefined ? product.is_purchasable : false;
      const displayStatus = product.display_status || "HIDDEN";

      return {
        id,
        name,
        brand,
        thumbnail,
        originalPrice,
        discountedPrice,
        salesStatus,
        isPurchasable,
        displayStatus,
        _source: "next_data",
      };
    };
  }

  /**
   * Fallback 데이터 생성
   */
  private createFallbackData(source: string): NextDataProductData {
    const { fallback } = this.config;

    return {
      id: "",
      name: fallback.name,
      brand: "",
      thumbnail: fallback.thumbnail,
      originalPrice: fallback.price,
      discountedPrice: fallback.price,
      salesStatus: fallback.sale_status,
      isPurchasable: false,
      displayStatus: "HIDDEN",
      _source: source,
    };
  }
}

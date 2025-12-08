/**
 * JSON-LD Schema.org 데이터 추출기
 *
 * SOLID 원칙:
 * - SRP: JSON-LD Schema.org 추출만 담당
 * - OCP: 새로운 Schema.org 패턴 추가 시 확장 가능
 * - DIP: 추상 인터페이스에 의존
 *
 * Design Pattern:
 * - Strategy Pattern: 추출 전략 캡슐화
 *
 * 목적:
 * - YAML에서 비즈니스 로직 분리 (Configuration-Driven 철학)
 * - 단위 테스트 가능한 추출 로직
 * - 재사용 가능한 Schema.org 파싱 유틸리티
 */

import type { Page } from "playwright";
import { logger } from "@/config/logger";
import { AvailabilityMapper } from "@/utils/AvailabilityMapper";

/**
 * JSON-LD 추출 설정
 */
export interface JsonLdConfig {
  /** JSON-LD script selector */
  selector: string;
  /** 삭제된 상품 fallback 데이터 */
  fallback: {
    name: string;
    thumbnail: string;
    price: number;
    sale_status: string;
  };
}

/**
 * Schema.org Product 타입 (JSON-LD)
 */
interface SchemaOrgProduct {
  name?: string;
  image?: string;
  offers?: {
    price?: number;
    availability?: string;
  };
}

/**
 * Browser Context 전달 설정
 */
interface BrowserExtractionConfig {
  selector: string;
  fallback: JsonLdConfig["fallback"];
  mappings: Record<string, string>;
  defaultStatus: string;
}

/**
 * Browser Context 추출 함수 타입
 */
type BrowserExtractionFunction = (
  config: BrowserExtractionConfig,
) => JsonLdProductData;

/**
 * JSON-LD 추출 결과
 */
export interface JsonLdProductData {
  name: string;
  title_images: string[];
  consumer_price: number;
  price: number;
  sale_status: string;
  _source: string;
}

/**
 * JSON-LD Schema.org Extractor
 */
export class JsonLdSchemaExtractor {
  private config: JsonLdConfig;

  constructor(config: JsonLdConfig) {
    this.config = config;
  }

  /**
   * Page에서 JSON-LD 데이터 추출
   * @param page Playwright Page 인스턴스
   * @param interceptedApiData Network intercept된 API 응답 (optional)
   */
  async extract(
    page: Page,
    interceptedApiData?: any,
  ): Promise<JsonLdProductData> {
    try {
      // API 데이터가 있으면 우선 사용
      if (interceptedApiData?.data) {
        logger.info("Network intercepted API 데이터 사용");
        return this.extractFromApiData(interceptedApiData.data);
      }

      // AvailabilityMapper에서 매핑 데이터 가져오기
      const mapper = AvailabilityMapper.getInstance();
      const browserConfig: BrowserExtractionConfig = {
        selector: this.config.selector,
        fallback: this.config.fallback,
        mappings: mapper.getMappings(),
        defaultStatus: mapper.getDefaultStatus(),
      };

      // page.evaluate()는 직렬화된 함수를 브라우저로 전송하므로
      // 클로저 변수 접근 불가 → 매개변수로 전달
      const result = await page.evaluate(
        this.createExtractionScript(),
        browserConfig,
      );

      logger.debug({ result }, "JSON-LD 추출 완료");

      return result as JsonLdProductData;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "JSON-LD 추출 실패");

      // Fallback 반환
      return this.createFallbackData("extraction_error");
    }
  }

  /**
   * 추출 스크립트 생성 (Browser Context에서 실행)
   *
   * NOTE: 이 함수는 Page.evaluate()에서 실행되므로 브라우저 컨텍스트
   * page.evaluate()는 함수를 직렬화하므로 클로저 변수 접근 불가 → 매개변수 사용
   * TypeScript는 Node.js 타입만 인식하므로 browser API는 타입 체크 제외
   */
  private createExtractionScript(): BrowserExtractionFunction {
    // Browser context에서 실행되는 함수 (document API 사용)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (config: BrowserExtractionConfig): any => {
      const { selector, fallback, mappings, defaultStatus } = config;

      // 1. JSON-LD 추출 (Browser context)
      const jsonLdScript = document.querySelector(selector);

      if (!jsonLdScript || !jsonLdScript.textContent) {
        // JSON-LD 없음 = 삭제된 상품
        return {
          name: fallback.name,
          title_images: [fallback.thumbnail],
          consumer_price: fallback.price,
          price: fallback.price,
          sale_status: fallback.sale_status,
          _source: "no_jsonld",
        };
      }

      let productData: SchemaOrgProduct;
      try {
        productData = JSON.parse(jsonLdScript.textContent);
      } catch (error) {
        return {
          name: fallback.name,
          title_images: [fallback.thumbnail],
          consumer_price: fallback.price,
          price: fallback.price,
          sale_status: fallback.sale_status,
          _source: "jsonld_parse_error",
        };
      }

      // 2. 상품명
      const name = productData.name || "";

      // 3. 썸네일
      const image = productData.image || "";

      // 4. 가격 정보
      const price = productData.offers?.price || 0;

      // 4-1. DOM에서 정가(consumer_price) 추출 (무신사 전용)
      // JSON-LD에는 판매가만 있고 정가는 DOM에 존재
      let consumerPrice = price; // 기본값: 판매가와 동일

      const discountWrapEl = document.querySelector(
        '[class*="Price__DiscountWrap"]',
      );
      if (discountWrapEl) {
        const originalPriceText = discountWrapEl.textContent?.trim() || "";
        const extractedPrice =
          parseInt(originalPriceText.replace(/[^0-9]/g, "")) || 0;
        if (extractedPrice > 0) {
          consumerPrice = extractedPrice;
        }
      }

      // 5. 판매 상태 판별 (YAML 기반 매핑)
      const availability = productData.offers?.availability;

      // JSON-LD offers 없음 = 삭제된 상품
      const DELETED_STATUS = mappings["null"] || defaultStatus;
      let saleStatus = defaultStatus;

      if (!productData.offers) {
        saleStatus = DELETED_STATUS;
      } else {
        // YAML 매핑 테이블에서 찾기
        const mapped = mappings[availability || ""];
        saleStatus = mapped || defaultStatus;
      }

      return {
        name: name,
        title_images: image ? [image] : [],
        consumer_price: consumerPrice,
        price: price,
        sale_status: saleStatus,
        _source: "jsonld_hybrid",
      };
    };
  }

  /**
   * Network Intercepted API 데이터에서 추출
   */
  private extractFromApiData(apiData: any): JsonLdProductData {
    const mapper = AvailabilityMapper.getInstance();

    // 무신사 API 응답 구조:
    // { goodsNm, goodsPrice: { normalPrice, salePrice }, thumbnailImageUrl }
    const name = apiData.goodsNm || "";
    const consumerPrice = apiData.goodsPrice?.normalPrice || 0; // 정가
    const price = apiData.goodsPrice?.salePrice || 0; // 판매가
    const thumbnail = apiData.thumbnailImageUrl || "";

    // 판매 상태 판별 (무신사는 정가/판매가가 있으면 판매중)
    let saleStatus = "on_sale";
    if (price === 0) {
      saleStatus = "off_sale";
    }

    return {
      name,
      title_images: thumbnail ? [thumbnail] : [],
      consumer_price: consumerPrice,
      price,
      sale_status: saleStatus,
      _source: "api_intercept",
    };
  }

  /**
   * Fallback 데이터 생성
   */
  private createFallbackData(source: string): JsonLdProductData {
    const { fallback } = this.config;

    return {
      name: fallback.name,
      title_images: [fallback.thumbnail],
      consumer_price: fallback.price,
      price: fallback.price,
      sale_status: fallback.sale_status,
      _source: source,
    };
  }
}

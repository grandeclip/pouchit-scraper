/**
 * HwahaeSearcher - 화해 상품 검색
 * DOM Parsing 기반 (API 없음 - SSR Next.js)
 *
 * 특이사항:
 * - API 없음 (SSR 기반 Next.js)
 * - Playwright + Stealth + DOM 파싱 필수
 * - 검색 결과가 HTML에 포함
 *
 * SOLID 원칙:
 * - SRP: Hwahae 검색만 담당
 * - LSP: BaseSearcher 대체 가능
 */

import type { Browser, BrowserContext, Page } from "playwright";
import { BaseSearcher } from "@/searchers/base/BaseSearcher";
import { BrowserPool } from "@/scanners/base/BrowserPool";
import type {
  SearchRequest,
  SearchProduct,
} from "@/core/domain/search/SearchProduct";
import type {
  SearchConfig,
  SearchStrategyConfig,
  DomParsingStrategy,
} from "@/core/domain/search/SearchConfig";
import { logger } from "@/config/logger";

/**
 * Hwahae DOM 파싱 결과
 */
interface HwahaeDomResult {
  products: HwahaeProduct[];
  totalCount: number;
}

/**
 * Hwahae 상품 타입
 */
interface HwahaeProduct {
  productId: string;
  productName: string;
  thumbnail?: string;
  productUrl: string;
}

/**
 * Hwahae Searcher (DOM Parsing)
 */
export class HwahaeSearcher extends BaseSearcher<
  HwahaeDomResult,
  SearchConfig
> {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;

  constructor(config: SearchConfig, strategy: SearchStrategyConfig) {
    super(config, strategy);
  }

  /**
   * DOM 전략 설정 반환
   */
  private get domStrategy(): DomParsingStrategy {
    if (!this.strategy.dom) {
      throw new Error("DOM parsing strategy configuration is required");
    }
    return this.strategy.dom;
  }

  /**
   * 초기화 (BrowserPool에서 Browser 획득)
   */
  protected async doInitialize(): Promise<void> {
    const poolOptions = {
      poolSize: 1,
      browserOptions: {
        headless: this.domStrategy.headless,
      },
    };

    const pool = BrowserPool.getInstance(poolOptions);
    await pool.initialize();

    this.browser = await pool.acquireBrowser();

    this.context = await this.browser.newContext({
      viewport: this.domStrategy.viewport,
      isMobile: this.domStrategy.isMobile,
      userAgent: this.domStrategy.userAgent,
    });

    this.page = await this.context.newPage();

    logger.debug(
      { platform: this.config.platform },
      "HwahaeSearcher initialized",
    );
  }

  /**
   * 검색 실행 (DOM 파싱)
   */
  protected async doSearch(request: SearchRequest): Promise<HwahaeDomResult> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const keyword = encodeURIComponent(request.keyword);
    const searchUrl = `https://www.hwahae.co.kr/search?q=${keyword}`;

    // 페이지 이동
    await this.page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: this.domStrategy.timeout,
    });

    // 로딩 대기
    await this.sleep(3000);

    // DOM에서 상품 추출
    const result = await this.extractFromDom();

    return result;
  }

  /**
   * DOM에서 상품 추출
   */
  private async extractFromDom(): Promise<HwahaeDomResult> {
    if (!this.page) {
      throw new Error("Page not initialized");
    }

    const result = await this.page.evaluate(() => {
      const products: HwahaeProduct[] = [];
      let totalCount = 0;

      // "쇼핑상품 66" 형태의 섹션 제목에서 총 개수 추출
      const sectionHeaders = document.querySelectorAll("h2");
      sectionHeaders.forEach((header) => {
        if (totalCount > 0) return; // 이미 찾았으면 스킵
        const text = header.textContent || "";
        const match = text.match(/쇼핑상품\s*(\d+)/);
        if (match) {
          totalCount = parseInt(match[1], 10);
        }
      });

      // 상품 링크 추출
      const productLinks = document.querySelectorAll('a[href^="/goods/"]');

      productLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";
        const productIdMatch = href.match(/\/goods\/(\d+)/);
        if (!productIdMatch) return;

        const productId = productIdMatch[1];

        // 이미 추가된 상품인지 확인
        if (products.some((p) => p.productId === productId)) return;

        // 상품명 추출
        const nameEl = link.querySelector("span");
        const productName = nameEl?.textContent?.trim() || "";

        if (!productName) return;

        // 썸네일 추출
        const imgEl = link.querySelector("img");
        const thumbnail = imgEl?.getAttribute("src") || undefined;

        products.push({
          productId,
          productName,
          thumbnail,
          productUrl: `https://www.hwahae.co.kr${href}`,
        });
      });

      return { products, totalCount };
    });

    return result;
  }

  /**
   * 결과 파싱
   */
  protected async parseResults(
    rawData: HwahaeDomResult,
    limit: number,
  ): Promise<SearchProduct[]> {
    const products = rawData.products.slice(0, limit);

    return products.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      thumbnail: item.thumbnail,
      productUrl: item.productUrl,
      platform: this.config.platform,
    }));
  }

  /**
   * 총 결과 수 추출
   */
  protected extractTotalCount(rawData: HwahaeDomResult): number {
    return rawData.totalCount;
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        const pool = BrowserPool.getInstance({ poolSize: 1 });
        await pool.releaseBrowser(this.browser);
        this.browser = null;
      }

      logger.debug(
        { platform: this.config.platform },
        "HwahaeSearcher cleanup completed",
      );
    } catch (error) {
      logger.warn({ error }, "HwahaeSearcher cleanup failed");
    }
  }
}

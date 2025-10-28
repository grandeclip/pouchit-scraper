import { chromium as playwrightChromium } from 'playwright';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';
import { IProductSearcher } from '../../core/interfaces/IProductSearcher';
import { Product, ShoppingMall } from '../../core/domain/Product';
import { ProductSearchRequest } from '../../core/domain/ProductSearchConfig';
import { UserAgentManager, SelectedUserAgent } from '../../config/UserAgentManager';
import { NoResultsException } from '../../navigators/ActionExecutor';

// Stealth 플러그인 적용
chromium.use(StealthPlugin());

/**
 * 기본 상품 검색 추상 클래스
 * Template Method Pattern
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색
 * 
 * 역할:
 * - 공통 상품 검색 흐름 정의
 * - 하위 클래스에서 특정 단계 오버라이드 가능
 * 
 * SOLID 원칙:
 * - SRP: 상품 검색 흐름 관리만 담당
 * - OCP: 확장에 열려있고 수정에 닫혀있음
 * - LSP: 모든 하위 클래스는 이 클래스로 대체 가능
 */
export abstract class BaseProductSearcher implements IProductSearcher {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected initialized: boolean = false;
  protected userAgentManager: UserAgentManager;
  public selectedUserAgent: SelectedUserAgent | null = null;

  constructor(protected readonly mall: ShoppingMall) {
    this.userAgentManager = UserAgentManager.getInstance();
  }

  /**
   * 쇼핑몰 이름 반환
   */
  getMallName(): ShoppingMall {
    return this.mall;
  }

  /**
   * 상품 검색 실행 (Template Method)
   * 
   * 동시성 안전성:
   * - finally 블록에서 반드시 리소스 정리
   * - 에러 발생 시에도 cleanup() 호출 보장
   */
  async search(request: ProductSearchRequest): Promise<Product[]> {
    const startTime = Date.now();

    try {
      console.log(`[${this.mall}] 상품 검색 시작:`, request);

      // 1. 초기화
      await this.ensureInitialized(request);

      // 2. 전처리
      await this.beforeSearch(request);

      // 3. 페이지 네비게이션
      await this.navigate(request);

      // 4. 데이터 추출
      const rawData = await this.extract(request);

      // 5. 데이터 파싱
      const products = await this.parse(rawData, request);

      // 6. 후처리
      const processedProducts = await this.afterSearch(products, request);

      const duration = Date.now() - startTime;
      console.log(
        `[${this.mall}] 상품 검색 완료: ${processedProducts.length}개 상품 (${duration}ms)`
      );

      return processedProducts;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // NoResultsException은 정상 처리 (빈 배열 반환)
      if (error instanceof NoResultsException) {
        console.log(`[${this.mall}] 검색 결과 없음 (${duration}ms): ${error.message}`);
        return [];
      }
      
      console.error(`[${this.mall}] 상품 검색 실패 (${duration}ms):`, error);
      throw error;
    } finally {
      // 반드시 리소스 정리 (에러 발생 여부와 무관)
      try {
        await this.cleanup();
      } catch (cleanupError) {
        console.warn(`[${this.mall}] cleanup 실패:`, cleanupError);
      }
    }
  }

  /**
   * 초기화 (Template Method)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log(`[${this.mall}] 초기화 중...`);

    // User-Agent 선택 (랜덤)
    this.selectedUserAgent = this.userAgentManager.getRandomUserAgent(this.mall);
    console.log(`[${this.mall}] User-Agent 선택: ${this.selectedUserAgent.id}`);
    console.log(`[${this.mall}] - 설명: ${this.selectedUserAgent.description}`);
    console.log(`[${this.mall}] - 값: ${this.selectedUserAgent.value}`);

    // 브라우저 설정 가져오기
    const browserConfig = await this.getBrowserConfig();

    // 브라우저 실행
    this.browser = await chromium.launch({
      headless: browserConfig.headless,
      args: browserConfig.args,
    });

    // 컨텍스트 생성 (User-Agent 적용)
    this.context = await this.browser.newContext({
      viewport: browserConfig.viewport,
      userAgent: this.selectedUserAgent.value,
    });

    // 페이지 생성
    this.page = await this.context.newPage();

    this.initialized = true;
    console.log(`[${this.mall}] 초기화 완료`);
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    console.log(`[${this.mall}] 리소스 정리 중...`);

    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.initialized = false;
    console.log(`[${this.mall}] 리소스 정리 완료`);
  }

  /**
   * 초기화 보장
   */
  protected async ensureInitialized(request: ProductSearchRequest): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 전처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async beforeSearch(request: ProductSearchRequest): Promise<void> {
    // 기본 구현: 아무 것도 하지 않음
  }

  /**
   * 후처리 훅 (하위 클래스에서 오버라이드 가능)
   */
  protected async afterSearch(
    products: Product[],
    request: ProductSearchRequest
  ): Promise<Product[]> {
    // 기본 구현: 그대로 반환
    return products;
  }

  /**
   * 브라우저 설정 가져오기 (하위 클래스에서 구현)
   */
  protected abstract getBrowserConfig(): Promise<any>;

  /**
   * 페이지 네비게이션 (하위 클래스에서 구현)
   */
  protected abstract navigate(request: ProductSearchRequest): Promise<void>;

  /**
   * 데이터 추출 (하위 클래스에서 구현)
   */
  protected abstract extract(request: ProductSearchRequest): Promise<any[]>;

  /**
   * 데이터 파싱 (하위 클래스에서 구현)
   */
  protected abstract parse(rawData: any[], request: ProductSearchRequest): Promise<Product[]>;
}


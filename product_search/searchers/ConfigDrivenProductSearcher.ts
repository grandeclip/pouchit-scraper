/**
 * 설정 기반 상품 검색
 * YAML 설정을 읽어서 동적으로 상품 검색 실행
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색
 * 
 * 역할:
 * - 모든 쇼핑몰에 범용적으로 사용
 * - YAML 설정에 따라 동적 실행
 * 
 * SOLID 원칙:
 * - SRP: 설정 기반 상품 검색만 담당
 * - OCP: 새 쇼핑몰 추가 시 코드 수정 불필요
 */

import { BaseProductSearcher } from './base/BaseProductSearcher';
import { Product, ShoppingMall } from '../core/domain/Product';
import { ProductSearchRequest, ProductSearchConfig } from '../core/domain/ProductSearchConfig';
import { ConfigLoader } from '../config/ConfigLoader';
import { PageNavigator } from '../navigators/PageNavigator';
import { NoResultsException } from '../navigators/ActionExecutor';
import { EvaluateExtractor } from '../extractors/EvaluateExtractor';
import { SelectorExtractor } from '../extractors/SelectorExtractor';
import { IDataExtractor } from '../core/interfaces/IDataExtractor';

/**
 * 설정 기반 상품 검색
 */
export class ConfigDrivenProductSearcher extends BaseProductSearcher {
  private config: ProductSearchConfig;
  private configLoader: ConfigLoader;
  private navigator: PageNavigator;
  private extractor: IDataExtractor;
  private sharedContext: Record<string, any> = {};  // navigate()와 extract() 간 context 공유

  constructor(mall: ShoppingMall) {
    super(mall);
    this.configLoader = ConfigLoader.getInstance();
    this.navigator = new PageNavigator();

    // 설정 로드
    this.config = this.configLoader.loadConfig(mall);

    // 추출기 선택
    if (this.config.extraction.type === 'evaluate') {
      this.extractor = new EvaluateExtractor();
    } else {
      this.extractor = new SelectorExtractor();
    }
  }

  /**
   * 브라우저 설정 가져오기
   */
  protected async getBrowserConfig(): Promise<any> {
    return this.config.browser;
  }

  /**
   * 페이지 네비게이션
   */
  protected async navigate(request: ProductSearchRequest): Promise<void> {
    if (!this.page) {
      throw new Error('페이지가 초기화되지 않았습니다');
    }

    // 검색 쿼리 생성
    const searchQuery = `${request.brand} ${request.productName}`.trim();
    const encodedQuery = encodeURIComponent(searchQuery);

    // 공유 컨텍스트 초기화 및 설정 (템플릿 변수 치환용)
    this.sharedContext = {
      brand: request.brand,
      productName: request.productName,
      searchQuery,
      encodedQuery,
      baseUrl: this.config.baseUrl,
      searchUrl: this.configLoader.substituteVariables(this.config.searchUrl, {
        baseUrl: this.config.baseUrl,
        encodedQuery,
      }),
    };

    try {
      // 네비게이션 실행 (sharedContext가 액션에서 수정될 수 있음)
      await this.navigator.navigate(this.page, this.config.navigation, this.sharedContext);
    } catch (error) {
      // NoResultsException을 받으면 그대로 재전파
      if (error instanceof NoResultsException) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * 데이터 추출
   */
  protected async extract(request: ProductSearchRequest): Promise<any[]> {
    if (!this.page) {
      throw new Error('페이지가 초기화되지 않았습니다');
    }

    // sharedContext 사용 (navigate()에서 설정되고, 액션에서 수정된 값 포함)
    // 데이터 추출
    const rawData = await this.extractor.extract(
      this.page,
      this.config.extraction,
      this.sharedContext
    );

    console.log(`[${this.mall}] ${rawData.length}개 원본 데이터 추출 완료`);

    return rawData;
  }

  /**
   * 데이터 파싱
   */
  protected async parse(rawData: any[], request: ProductSearchRequest): Promise<Product[]> {
    const products: Product[] = [];

    for (const item of rawData) {
      try {
        // Product 도메인 객체 생성
        const product = new Product(
          item.productId || item.id || `${this.mall}_${Date.now()}_${Math.random()}`,
          item.productName || item.name,
          item.brand || request.brand,
          this.mall,
          item.productUrl || item.url || this.generateProductUrl(item),
          item.thumbnail,
          {
            original: item.originalPrice || null,
            sale: item.salePrice || 0,
          },
          item
        );

        products.push(product);
      } catch (error) {
        console.warn(`[${this.mall}] 상품 파싱 실패:`, item, error);
      }
    }

    console.log(`[${this.mall}] ${products.length}개 상품 파싱 완료`);

    return products;
  }

  /**
   * 상품 URL 생성 (fallback)
   */
  private generateProductUrl(item: any): string {
    // productId가 있으면 baseUrl과 조합
    if (item.productId) {
      return `${this.config.baseUrl}/products/${item.productId}`;
    }

    // goodsNo가 있으면 (올리브영)
    if (item.goodsNo) {
      return `${this.config.baseUrl}/store/goods/getGoodsDetail.do?goodsNo=${item.goodsNo}`;
    }

    // 기본: baseUrl 반환
    return this.config.baseUrl;
  }
}


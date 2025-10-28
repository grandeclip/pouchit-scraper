/**
 * 상품 검색 컨트롤러
 * MVC Pattern의 Controller
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 쇼핑몰별 키워드 검색
 * 
 * 역할:
 * - HTTP 요청 처리
 * - 파라미터 추출
 * - 서비스 호출
 * - 응답 반환
 * 
 * SOLID 원칙:
 * - SRP: HTTP 요청 처리만 담당
 */

import { Request, Response } from 'express';
import { ShoppingMall } from '../core/domain/Product';
import { ProductSearchService } from '../services/ProductSearchService';

/**
 * 상품 검색 컨트롤러
 */
export class ProductSearchController {
  private searchService: ProductSearchService;

  constructor() {
    this.searchService = new ProductSearchService();
  }

  /**
   * 쇼핑몰별 상품 검색
   * POST /search-products/:mall
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const mall = req.params.mall as ShoppingMall;
      const { brand, productName } = req.body;

      console.log(`[ProductSearchController] 상품 검색 요청: ${mall}, 브랜드: ${brand}, 상품명: ${productName}`);

      // 쇼핑몰 사용 가능 여부 확인
      if (!this.searchService.isAvailable(mall)) {
        res.status(404).json({
          success: false,
          products: [],
          message: `${mall}은(는) 지원하지 않는 쇼핑몰입니다`,
          error: `지원하지 않는 쇼핑몰: ${mall}`,
        });
        return;
      }

      // 상품 검색 실행
      const result = await this.searchService.search(mall, { brand, productName });

      // 응답 반환
      res.json(result);
    } catch (error) {
      console.error('[ProductSearchController] 상품 검색 오류:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        products: [],
        message: '상품 검색 중 서버 오류가 발생했습니다',
        error: errorMessage,
      });
    }
  }

  /**
   * 사용 가능한 쇼핑몰 목록
   * GET /search-products/malls
   */
  async getMalls(req: Request, res: Response): Promise<void> {
    try {
      const malls = this.searchService.getAvailableMalls();
      res.json({
        success: true,
        message: `${malls.length}개의 쇼핑몰을 지원합니다`,
        malls,
      });
    } catch (error) {
      console.error('[ProductSearchController] 쇼핑몰 목록 조회 오류:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        message: '쇼핑몰 목록 조회 중 오류가 발생했습니다',
        error: errorMessage,
        malls: [],
      });
    }
  }

  /**
   * 헬스체크
   * GET /health
   */
  async health(req: Request, res: Response): Promise<void> {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }
}


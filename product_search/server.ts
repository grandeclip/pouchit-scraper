/**
 * 쇼핑몰별 상품 검색 HTTP API 서버
 * Docker 컨테이너 내부에서 실행되며 HTTP 요청을 받아 상품 검색 수행
 * 
 * 용도:
 * - "기획 세트 등록" 페이지에서 각 쇼핑몰별 키워드 검색
 * 
 * 아키텍처:
 * - YAML 설정 기반
 * - SOLID 원칙 준수
 * - Strategy Pattern, Factory Pattern, Singleton Pattern 적용
 * 
 * 새 쇼핑몰 추가 방법:
 * 1. config/malls/{mall}.yaml 파일 생성
 * 2. 서버 재시작
 * 3. 완료!
 */

import express from 'express';
import { ProductSearchController } from './controllers/ProductSearchController';
import { validateScrapeRequest } from './middleware/validation';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { ProductSearchService } from './services/ProductSearchService';
import { ProductSearchRegistry } from './services/ProductSearchRegistry';

const app = express();
const PORT = process.env.PORT || 3000;
let server: any = null;

// 미들웨어
app.use(express.json());

// 컨트롤러 초기화
const productSearchController = new ProductSearchController();

// 라우트
app.get('/health', (req, res) => productSearchController.health(req, res));
app.get('/search-products/malls', (req, res) => productSearchController.getMalls(req, res));
app.post('/search-products/:mall', validateScrapeRequest, (req, res) =>
  productSearchController.search(req, res)
);

// 하위 호환성을 위한 기존 엔드포인트 (deprecated)
app.post('/scrape/oliveyoung', validateScrapeRequest, (req, res) => {
  console.warn('[DEPRECATED] /scrape/oliveyoung 엔드포인트는 deprecated 되었습니다. /search-products/oliveyoung 를 사용하세요.');
  req.params.mall = 'oliveyoung';
  productSearchController.search(req, res);
});

app.post('/scrape/zigzag', validateScrapeRequest, (req, res) => {
  console.warn('[DEPRECATED] /scrape/zigzag 엔드포인트는 deprecated 되었습니다. /search-products/zigzag 를 사용하세요.');
  req.params.mall = 'zigzag';
  productSearchController.search(req, res);
});

app.post('/scrape/musinsa', validateScrapeRequest, (req, res) => {
  console.warn('[DEPRECATED] /scrape/musinsa 엔드포인트는 deprecated 되었습니다. /search-products/musinsa 를 사용하세요.');
  req.params.mall = 'musinsa';
  productSearchController.search(req, res);
});

app.post('/scrape/ably', validateScrapeRequest, (req, res) => {
  console.warn('[DEPRECATED] /scrape/ably 엔드포인트는 deprecated 되었습니다. /search-products/ably 를 사용하세요.');
  req.params.mall = 'ably';
  productSearchController.search(req, res);
});

app.post('/scrape/kurly', validateScrapeRequest, (req, res) => {
  console.warn('[DEPRECATED] /scrape/kurly 엔드포인트는 deprecated 되었습니다. /search-products/kurly 를 사용하세요.');
  req.params.mall = 'kurly';
  productSearchController.search(req, res);
});

// 에러 핸들러
app.use(notFoundHandler);
app.use(errorHandler);

// 서버 시작
server = app.listen(PORT, () => {
  console.log('🚀 상품 검색 스크래퍼 서버 시작');
  console.log(`📍 포트: ${PORT}`);
  console.log(`🔗 헬스체크: http://localhost:${PORT}/health`);
  console.log('\n사용 가능한 엔드포인트:');
  console.log(`  GET  /health                        - 헬스체크`);
  console.log(`  GET  /search-products/malls         - 사용 가능한 쇼핑몰 목록`);
  console.log(`  POST /search-products/:mall         - 쇼핑몰별 상품 검색`);
  console.log('\n지원하는 쇼핑몰:');
  
  // 동적으로 등록된 쇼핑몰 목록 가져오기
  const productSearchService = new ProductSearchService();
  const malls = productSearchService.getAvailableMalls();
  const mallNames: Record<string, string> = {
    oliveyoung: '올리브영',
    zigzag: '지그재그',
    musinsa: '무신사',
    ably: '에이블리',
    kurly: '컬리',
    hwahae: '화해',
  };
  
  malls.forEach(mall => {
    const displayName = mallNames[mall] || mall;
    console.log(`  - ${mall} (${displayName})`);
  });
  
  console.log('\n새 쇼핑몰 추가 방법:');
  console.log(`  1. config/malls/{mall}.yaml 파일 생성`);
  console.log(`  2. 서버 재시작`);
  console.log(`  3. 완료!`);
  console.log('\n동시성 안전성:');
  console.log(`  ✅ 요청마다 독립적인 Browser 인스턴스 생성`);
  console.log(`  ✅ 병렬 요청 간 간섭 없음`);
  console.log(`  ✅ 자동 리소스 정리 (메모리 누수 방지)`);
});

/**
 * Graceful Shutdown
 * 
 * 서버 종료 시 모든 리소스를 안전하게 정리:
 * - 열려있는 브라우저 인스턴스 종료
 * - 활성 연결 종료
 * - 캐시된 스크래퍼 정리
 */
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} 시그널 수신, 안전하게 서버 종료 중...`);
  
  // 1. 새로운 요청 거부
  if (server) {
    server.close(() => {
      console.log('✅ HTTP 서버 종료 완료');
    });
  }
  
  // 2. 모든 상품 검색기 리소스 정리
  try {
    const registry = ProductSearchRegistry.getInstance();
    await registry.cleanupAll();
    console.log('✅ 모든 상품 검색기 리소스 정리 완료');
  } catch (error) {
    console.error('❌ 리소스 정리 중 오류:', error);
  }
  
  // 3. 프로세스 종료
  console.log('👋 서버 종료 완료');
  process.exit(0);
}

// Graceful shutdown 핸들러
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 예상치 못한 에러 처리
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

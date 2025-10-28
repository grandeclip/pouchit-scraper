#!/usr/bin/env tsx
/**
 * 쇼핑몰별 상품 검색 CLI 클라이언트
 * "기획 세트 등록" 페이지에서 사용하는 상품 검색 서버 테스트 도구
 * 
 * 사용법:
 *   npx tsx product-search-cli.ts <mall> <brand> <productName>
 * 
 * 예시:
 *   npx tsx product-search-cli.ts oliveyoung "라운드랩" "선크림"
 *   npx tsx product-search-cli.ts "oliveyoung,musinsa" "토리든" "세럼"
 *   npx tsx product-search-cli.ts all "AHC" "선스틱"
 */

interface ProductSearchRequest {
  brand: string;
  productName: string;
}

interface Product {
  productId?: string;
  productName?: string;
  name?: string;
  brand?: string;
  salePrice?: number;
  [key: string]: unknown;
}

interface ProductSearchResponse {
  success: boolean;
  products: Product[];
  message: string;        // 결과 메시지 (항상 포함)
  error?: string;         // 에러 상세 (실패 시)
  mall?: string;
  count?: number;
  duration?: number;
  userAgent?: {
    id: string;
    value: string;
    description: string;
    platform: string;
    browser: string;
  };
}

const API_BASE_URL = process.env.PRODUCT_SEARCH_API_URL || process.env.SCRAPER_API_URL || 'http://localhost:3987';
const TIMEOUT = parseInt(process.env.PRODUCT_SEARCH_TIMEOUT || process.env.SCRAPER_TIMEOUT || '60000', 10);

// 지원하는 모든 쇼핑몰 목록
const ALL_MALLS = ['oliveyoung', 'zigzag', 'musinsa', 'kurly', 'hwahae', 'ably'];

// 쇼핑몰 한글 이름 매핑
const MALL_NAMES: Record<string, string> = {
  oliveyoung: '올리브영',
  zigzag: '지그재그',
  musinsa: '무신사',
  ably: '에이블리',
  kurly: '컬리',
  hwahae: '화해',
};

/**
 * 서버 헬스체크
 */
async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 단일 쇼핑몰 상품 검색
 */
async function searchProducts(
  mall: string,
  request: ProductSearchRequest
): Promise<ProductSearchResponse> {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE_URL}/search-products/${mall}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: 'Unknown error',
      }));
      return {
        success: false,
        products: [],
        message: `HTTP ${response.status} 오류가 발생했습니다`,
        error: `HTTP ${response.status}: ${(errorData as any).error || response.statusText}`,
        mall,
        duration,
      };
    }

    const data: ProductSearchResponse = await response.json();
    return {
      ...data,
      mall,
      duration,
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        success: false,
        products: [],
        message: `요청 시간이 초과되었습니다 (${TIMEOUT}ms)`,
        error: `타임아웃 (${TIMEOUT}ms)`,
        mall,
        duration,
      };
    }

    return {
      success: false,
      products: [],
      message: '상품 검색 중 오류가 발생했습니다',
      error: error instanceof Error ? error.message : String(error),
      mall,
      duration,
    };
  }
}

/**
 * 결과 출력
 */
function printResult(result: ProductSearchResponse) {
  const mallName = MALL_NAMES[result.mall || ''] || result.mall || 'Unknown';
  const status = result.success ? '✅' : '❌';
  const duration = result.duration ? `${result.duration}ms` : 'N/A';
  const count = result.products?.length || 0;

  console.log(`\n${status} ${mallName}`);
  console.log(`   소요시간: ${duration}`);
  console.log(`   상품 수: ${count}개`);
  
  // message 출력 (항상 포함)
  if (result.message) {
    console.log(`   💬 메시지: ${result.message}`);
  }

  if (!result.success && result.error) {
    console.log(`   ⚠️  오류: ${result.error}`);
  } else if (count > 0) {
    console.log(`\n   📦 상품 목록:`);
    result.products.slice(0, 3).forEach((product, idx) => {
      console.log(`      ${idx + 1}. ${product.productName || product.name || 'N/A'}`);
      if (product.brand) {
        console.log(`         브랜드: ${product.brand}`);
      }
      if (product.salePrice) {
        console.log(`         가격: ${product.salePrice.toLocaleString()}원`);
      }
    });
    
    if (count > 3) {
      console.log(`      ... 외 ${count - 3}개`);
    }
  }
}

/**
 * JSON 결과 출력
 */
function printJsonResult(results: ProductSearchResponse[]) {
  const output = results.map((result) => ({
    mall: result.mall,
    mallName: MALL_NAMES[result.mall || ''] || result.mall,
    success: result.success,
    message: result.message,      // message 포함
    count: result.products?.length || 0,
    duration: result.duration,
    userAgent: result.userAgent,
    products: result.products,
    error: result.error,
  }));

  console.log(JSON.stringify(output, null, 2));
}

/**
 * 메인 함수
 */
async function main() {
  const args = process.argv.slice(2);

  // 인자 검증
  if (args.length < 3) {
    console.error('❌ 인자가 부족합니다.\n');
    console.log('사용법:');
    console.log('  npx tsx product-search-cli.ts <mall> <brand> <productName>\n');
    console.log('예시:');
    console.log('  npx tsx product-search-cli.ts oliveyoung "라운드랩" "선크림"');
    console.log('  npx tsx product-search-cli.ts "oliveyoung,musinsa" "토리든" "세럼"');
    console.log('  npx tsx product-search-cli.ts all "AHC" "선스틱"\n');
    console.log('지원 쇼핑몰:');
    ALL_MALLS.forEach((mall) => {
      console.log(`  - ${mall} (${MALL_NAMES[mall]})`);
    });
    process.exit(1);
  }

  const [mallArg, brand, productName] = args;
  const isJsonOutput = process.env.OUTPUT_JSON === 'true';

  // 쇼핑몰 목록 파싱
  let malls: string[];
  if (mallArg.toLowerCase() === 'all') {
    malls = [...ALL_MALLS];
  } else {
    malls = mallArg.split(',').map((m) => m.trim().toLowerCase());
    
    // 유효하지 않은 쇼핑몰 검증
    const invalidMalls = malls.filter((m) => !ALL_MALLS.includes(m));
    if (invalidMalls.length > 0) {
      console.error(`❌ 지원하지 않는 쇼핑몰: ${invalidMalls.join(', ')}\n`);
      console.log('지원 쇼핑몰:');
      ALL_MALLS.forEach((mall) => {
        console.log(`  - ${mall} (${MALL_NAMES[mall]})`);
      });
      process.exit(1);
    }
  }

  const request: ProductSearchRequest = { brand, productName };

  // 헬스체크
  if (!isJsonOutput) {
    console.log('================================================================================');
    console.log('🔍 쇼핑몰별 상품 검색 CLI');
    console.log('================================================================================\n');
    console.log(`📝 브랜드: "${brand}"`);
    console.log(`📝 상품명: "${productName}"`);
    console.log(`🏪 쇼핑몰: ${malls.map((m) => MALL_NAMES[m] || m).join(', ')}`);
    console.log('');

    console.log('⏳ 서버 헬스체크...');
    const isHealthy = await healthCheck();

    if (!isHealthy) {
      console.error('❌ 상품 검색 서버가 응답하지 않습니다');
      console.error(`💡 힌트: ${API_BASE_URL}`);
      console.error('   1. 서버가 실행 중인지 확인: docker-compose ps');
      console.error('   2. 서버 시작: docker-compose up -d');
      process.exit(1);
    }

    console.log('✅ 서버 정상\n');
    console.log(`🔍 상품 검색 시작... (${malls.length}개 쇼핑몰)`);
  }

  // 상품 검색 실행
  const startTime = Date.now();
  
  let results: ProductSearchResponse[];
  
  if (malls.length === 1) {
    // 단일 쇼핑몰은 순차 실행
    const result = await searchProducts(malls[0], request);
    results = [result];
  } else {
    // 여러 쇼핑몰은 병렬 실행
    results = await Promise.all(
      malls.map((mall) => searchProducts(mall, request))
    );
  }

  const totalDuration = Date.now() - startTime;

  // 결과 출력
  if (isJsonOutput) {
    printJsonResult(results);
  } else {
    console.log('\n================================================================================');
    console.log('📊 상품 검색 결과');
    console.log('================================================================================');

    results.forEach((result) => printResult(result));

    console.log('\n================================================================================');
    console.log('📈 요약');
    console.log('================================================================================');
    console.log(`총 소요시간: ${totalDuration}ms`);
    console.log(`성공: ${results.filter((r) => r.success).length}개`);
    console.log(`실패: ${results.filter((r) => !r.success).length}개`);
    
    const totalProducts = results.reduce((sum, r) => sum + (r.products?.length || 0), 0);
    console.log(`총 상품 수: ${totalProducts}개`);
    console.log('');
  }

  // 실패한 경우 exit code 1
  const hasFailure = results.some((r) => !r.success);
  process.exit(hasFailure ? 1 : 0);
}

// 실행
main().catch((error) => {
  console.error('❌ 예기치 않은 오류:', error);
  process.exit(1);
});


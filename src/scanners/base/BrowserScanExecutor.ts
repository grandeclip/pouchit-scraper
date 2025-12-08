/**
 * BrowserScanExecutor - Platform Scanner 실행 헬퍼 (Phase 4)
 *
 * SOLID 원칙:
 * - SRP: 플랫폼별 스캔 실행 로직만 담당
 * - OCP: 새로운 플랫폼 추가 시 확장 가능
 * - DIP: IPlatformScanner 인터페이스에 의존
 *
 * 목적:
 * - Browser/API 기반 플랫폼 구분 로직 중앙화
 * - BrowserPool 관리 및 Page 생성 로직 재사용
 * - Extract 노드들의 중복 코드 제거
 */

import type { Browser, BrowserContext, Page } from "playwright";
import { BrowserPool } from "@/scanners/base/BrowserPool";
import { ConfigLoader } from "@/config/ConfigLoader";
import { BROWSER_ARGS } from "@/config/BrowserArgs";
import { PLATFORM_TYPES, MOBILE_VIEWPORT } from "@/config/constants";
import type {
  IPlatformScanner,
  PlatformScanResult,
} from "@/scanners/platform/IPlatformScanner";

/**
 * BrowserScanExecutor 설정
 */
export interface BrowserScanExecutorConfig {
  /** BrowserPool 사이즈 */
  poolSize?: number;
  /** Headless 모드 */
  headless?: boolean;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: Required<BrowserScanExecutorConfig> = {
  poolSize: 1,
  headless: true,
};

/**
 * BrowserScanExecutor
 *
 * Platform Scanner 실행을 위한 공통 헬퍼 클래스
 * - Browser 기반 플랫폼: Page 인스턴스 생성 후 스캔
 * - API 기반 플랫폼: URL만으로 스캔
 */
export class BrowserScanExecutor {
  private browserPool: BrowserPool | null = null;
  private readonly configLoader: ConfigLoader;
  private readonly config: Required<BrowserScanExecutorConfig>;

  constructor(config?: BrowserScanExecutorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * 플랫폼별 스캔 실행
   *
   * @param scanner 플랫폼 스캐너
   * @param platform 플랫폼 이름
   * @param url 상품 URL
   * @returns 스캔 결과
   */
  async execute(
    scanner: IPlatformScanner,
    platform: string,
    url: string,
  ): Promise<PlatformScanResult> {
    // API 기반 플랫폼은 Page 없이 스캔
    if (!PLATFORM_TYPES.isBrowserPlatform(platform)) {
      return scanner.scan(url);
    }

    // Browser 기반 플랫폼은 Page 생성 후 스캔
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // BrowserPool 초기화 (Lazy)
      if (!this.browserPool) {
        this.browserPool = BrowserPool.getInstance({
          poolSize: this.config.poolSize,
          browserOptions: {
            headless: this.config.headless,
            args: BROWSER_ARGS.DEFAULT,
          },
        });
        await this.browserPool.initialize();
      }

      // Platform Config 로드
      const platformConfig = this.configLoader.loadConfig(platform);

      // Browser 획득 및 Page 생성
      browser = await this.browserPool.acquireBrowser();
      context = await browser.newContext({
        userAgent: platformConfig.userAgent,
        viewport: MOBILE_VIEWPORT.DEFAULT,
      });
      page = await context.newPage();

      // Page와 함께 스캔 실행
      return await scanner.scan(url, page);
    } finally {
      // 리소스 정리
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser && this.browserPool) {
        await this.browserPool.releaseBrowser(browser);
      }
    }
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    if (this.browserPool) {
      await this.browserPool.cleanup();
      this.browserPool = null;
    }
  }

  /**
   * BrowserPool 초기화 여부
   */
  get isInitialized(): boolean {
    return this.browserPool !== null;
  }
}

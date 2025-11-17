/**
 * Browser Pool 구현
 *
 * Singleton Pattern + Object Pool Pattern
 *
 * SOLID 원칙:
 * - SRP: Browser 인스턴스 풀 관리만 담당
 * - OCP: 확장 가능한 설계 (Browser 타입 변경 가능)
 * - DIP: IBrowserPool 인터페이스에 의존
 *
 * 핵심 기능:
 * - 워커 시작 시 N개 Browser 미리 생성 (launch 병목 제거)
 * - acquire/release 패턴으로 재사용
 * - Browser 크래시 시 자동 재생성
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext } from "playwright";
import { Mutex } from "async-mutex";
import { IBrowserPool } from "./IBrowserPool";
import { logger } from "@/config/logger";
import { BROWSER_ARGS } from "@/config/BrowserArgs";

// Stealth 플러그인 적용
// Note: page.setUserAgent() 호출로 모바일 User-Agent 설정 (BaseValidationNode)
const stealth = StealthPlugin();
chromium.use(stealth);

/**
 * Browser Pool Options
 */
export interface BrowserPoolOptions {
  /** Pool 크기 (동시 실행 가능한 Browser 수) */
  poolSize: number;
  /** Browser 실행 옵션 */
  browserOptions?: {
    headless?: boolean;
    args?: string[];
  };
}

/**
 * Browser Pool 상태
 */
interface PooledBrowser {
  browser: Browser;
  inUse: boolean;
  createdAt: number;
}

/**
 * Browser Pool 구현 (Singleton)
 */
export class BrowserPool implements IBrowserPool {
  private static instance: BrowserPool | null = null;
  private pool: PooledBrowser[] = [];
  private options: BrowserPoolOptions;
  private initialized = false;
  private mutex = new Mutex(); // Race condition 방지용 Mutex (FIFO 보장)

  private constructor(options: BrowserPoolOptions) {
    this.options = options;
  }

  /**
   * Singleton 인스턴스 생성 (또는 가져오기)
   *
   * Note: poolSize가 변경되면 기존 인스턴스를 정리하고 새로 생성
   */
  public static getInstance(options: BrowserPoolOptions): BrowserPool {
    // 인스턴스가 없으면 새로 생성
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool(options);
      return BrowserPool.instance;
    }

    // poolSize가 변경되면 기존 인스턴스 정리 후 재생성
    if (BrowserPool.instance.options.poolSize !== options.poolSize) {
      logger.info(
        {
          oldPoolSize: BrowserPool.instance.options.poolSize,
          newPoolSize: options.poolSize,
        },
        "BrowserPool poolSize 변경 감지 - 재초기화 필요",
      );
      // 기존 인스턴스는 cleanup에서 정리될 것이므로 여기서는 새 인스턴스만 생성
      BrowserPool.instance = new BrowserPool(options);
    }

    return BrowserPool.instance;
  }

  /**
   * Singleton 인스턴스 초기화 해제 (테스트용)
   */
  public static resetInstance(): void {
    BrowserPool.instance = null;
  }

  /**
   * Pool 초기화 (Browser 인스턴스 미리 생성)
   */
  public async initialize(): Promise<void> {
    // 이미 초기화되었고 poolSize가 동일하면 스킵
    if (this.initialized && this.pool.length === this.options.poolSize) {
      logger.debug(
        { poolSize: this.options.poolSize },
        "BrowserPool이 이미 초기화되어 있습니다 (스킵)",
      );
      return;
    }

    // poolSize가 변경된 경우 기존 pool 정리
    if (this.initialized && this.pool.length !== this.options.poolSize) {
      logger.info(
        {
          oldPoolSize: this.pool.length,
          newPoolSize: this.options.poolSize,
        },
        "BrowserPool poolSize 변경 - 기존 pool 정리 중...",
      );
      await this.cleanup();
      this.initialized = false;
    }

    logger.info(
      { poolSize: this.options.poolSize },
      "BrowserPool 초기화 시작...",
    );

    const startTime = Date.now();

    // 병렬로 Browser 생성 (순차 대기 방지)
    const browserPromises = Array.from(
      { length: this.options.poolSize },
      async () => {
        try {
          const browser = await chromium.launch({
            headless: this.options.browserOptions?.headless ?? true,
            args: this.options.browserOptions?.args ?? BROWSER_ARGS.DEFAULT,
          });

          return {
            browser,
            inUse: false,
            createdAt: Date.now(),
          };
        } catch (error) {
          logger.error({ error }, "Browser 생성 실패");
          throw error;
        }
      },
    );

    this.pool = await Promise.all(browserPromises);

    const elapsed = Date.now() - startTime;
    this.initialized = true;

    logger.info(
      { poolSize: this.pool.length, elapsedMs: elapsed },
      "BrowserPool 초기화 완료",
    );
  }

  /**
   * Browser 인스턴스 획득 (Race condition safe with Mutex)
   */
  public async acquireBrowser(): Promise<Browser> {
    if (!this.initialized) {
      throw new Error(
        "BrowserPool이 초기화되지 않았습니다. initialize() 호출 필요",
      );
    }

    // Mutex 획득 (FIFO 보장, CPU 효율적)
    const release = await this.mutex.acquire();

    try {
      // 사용 가능한 Browser 찾기
      const available = this.pool.find((p) => !p.inUse);

      if (!available) {
        throw new Error(
          `사용 가능한 Browser 없음 (pool size: ${this.pool.length})`,
        );
      }

      // Browser 연결 확인 (크래시 감지)
      if (!available.browser.isConnected()) {
        logger.warn(
          { createdAt: available.createdAt },
          "Browser 연결 끊김 감지 - 재생성",
        );
        available.browser = await this.recreateBrowser();
        available.createdAt = Date.now();
      }

      available.inUse = true;

      logger.debug(
        { available: this.getStatus().available },
        "Browser 획득 완료",
      );

      return available.browser;
    } finally {
      // Mutex 해제
      release();
    }
  }

  /**
   * Browser 인스턴스 반환
   */
  public async releaseBrowser(browser: Browser): Promise<void> {
    const pooled = this.pool.find((p) => p.browser === browser);

    if (!pooled) {
      logger.warn("Pool에 없는 Browser 반환 시도 - 무시");
      return;
    }

    pooled.inUse = false;

    logger.debug(
      { available: this.getStatus().available },
      "Browser 반환 완료",
    );
  }

  /**
   * Browser Context 생성
   */
  public async createContext(
    browser: Browser,
    options?: Record<string, unknown>,
  ): Promise<BrowserContext> {
    return await browser.newContext(options);
  }

  /**
   * 모든 Browser 정리
   */
  public async cleanup(): Promise<void> {
    logger.info({ poolSize: this.pool.length }, "BrowserPool 정리 시작...");

    await Promise.all(
      this.pool.map(async (p) => {
        try {
          if (p.browser.isConnected()) {
            await p.browser.close();
          }
        } catch (error) {
          logger.warn({ error }, "Browser 종료 실패");
        }
      }),
    );

    this.pool = [];
    this.initialized = false;

    logger.info("BrowserPool 정리 완료");
  }

  /**
   * Pool 상태
   */
  public getStatus() {
    const inUse = this.pool.filter((p) => p.inUse).length;
    const available = this.pool.length - inUse;

    return {
      poolSize: this.pool.length,
      available,
      inUse,
    };
  }

  /**
   * Browser 재생성 (크래시 복구용)
   */
  private async recreateBrowser(): Promise<Browser> {
    logger.info("Browser 재생성 중...");

    const browser = await chromium.launch({
      headless: this.options.browserOptions?.headless ?? true,
      args: this.options.browserOptions?.args ?? BROWSER_ARGS.DEFAULT,
    });

    logger.info("Browser 재생성 완료");

    return browser;
  }
}

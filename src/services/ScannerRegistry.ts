/**
 * 스캐너 레지스트리
 * Singleton + Registry Pattern
 *
 * 역할:
 * - 스캐너 인스턴스 생성 및 캐싱
 * - 재사용 가능한 스캐너 관리
 *
 * SOLID 원칙:
 * - SRP: 스캐너 인스턴스 관리만 담당
 * - DIP: IScanner 인터페이스에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner";
import { ScannerFactory } from "@/scanners/base/ScannerFactory";
import { logger } from "@/config/logger";

/**
 * TTL 설정 (ms)
 */
const SCANNER_TTL_MS = 60 * 60 * 1000; // 1시간
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 체크

/**
 * 스캐너 레지스트리 (Singleton)
 */
export class ScannerRegistry {
  private static instance: ScannerRegistry;
  private scanners: Map<string, IScanner> = new Map();
  /** 스캐너별 마지막 접근 시간 (TTL 기반 정리용) */
  private lastAccessTime: Map<string, number> = new Map();
  /** 자동 정리 타이머 */
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // TTL 기반 자동 정리 시작
    this.startAutoCleanup();
  }

  /**
   * Singleton 인스턴스 반환
   */
  static getInstance(): ScannerRegistry {
    if (!ScannerRegistry.instance) {
      ScannerRegistry.instance = new ScannerRegistry();
    }
    return ScannerRegistry.instance;
  }

  /**
   * 스캐너 가져오기 (없으면 생성)
   * @param platform 플랫폼 이름
   * @param strategyId 전략 ID (옵션)
   * @returns 스캐너 인스턴스
   */
  getScanner(platform: string, strategyId?: string): IScanner {
    const key = this.makeKey(platform, strategyId);

    // 캐시 확인
    if (!this.scanners.has(key)) {
      logger.info({ key, platform, strategyId }, "새 스캐너 생성");
      const scanner = ScannerFactory.createScanner(platform, strategyId);
      this.scanners.set(key, scanner);
    }

    // TTL 갱신: 마지막 접근 시간 업데이트
    this.lastAccessTime.set(key, Date.now());

    return this.scanners.get(key)!;
  }

  /**
   * 스캐너 등록 (테스트용)
   * @param platform 플랫폼 이름
   * @param scanner 스캐너 인스턴스
   * @param strategyId 전략 ID (옵션)
   */
  registerScanner(
    platform: string,
    scanner: IScanner,
    strategyId?: string,
  ): void {
    const key = this.makeKey(platform, strategyId);
    logger.info({ key, platform, strategyId }, "스캐너 등록");
    this.scanners.set(key, scanner);
  }

  /**
   * 특정 스캐너 제거
   * @param platform 플랫폼 이름
   * @param strategyId 전략 ID (옵션)
   */
  async removeScanner(platform: string, strategyId?: string): Promise<void> {
    const key = this.makeKey(platform, strategyId);

    if (this.scanners.has(key)) {
      const scanner = this.scanners.get(key)!;
      await scanner.cleanup();
      this.scanners.delete(key);
      this.lastAccessTime.delete(key);
      logger.info({ key, platform, strategyId }, "스캐너 제거");
    }
  }

  /**
   * 모든 스캐너 정리 및 제거
   */
  async clearAll(): Promise<void> {
    logger.info({ count: this.scanners.size }, "모든 스캐너 정리 중");

    // 자동 정리 타이머 중지
    this.stopAutoCleanup();

    const cleanupPromises = Array.from(this.scanners.values()).map((scanner) =>
      scanner.cleanup(),
    );

    await Promise.allSettled(cleanupPromises);
    this.scanners.clear();
    this.lastAccessTime.clear();

    logger.info("모든 스캐너 정리 완료");
  }

  /**
   * 등록된 스캐너 개수
   */
  size(): number {
    return this.scanners.size;
  }

  /**
   * 특정 스캐너 존재 여부
   */
  has(platform: string, strategyId?: string): boolean {
    const key = this.makeKey(platform, strategyId);
    return this.scanners.has(key);
  }

  /**
   * 캐시 키 생성
   */
  private makeKey(platform: string, strategyId?: string): string {
    return strategyId ? `${platform}:${strategyId}` : `${platform}:default`;
  }

  /**
   * TTL 기반 자동 정리 시작
   * 주기적으로 미사용 스캐너 정리
   */
  private startAutoCleanup(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredScanners().catch((error) => {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "스캐너 자동 정리 중 오류",
        );
      });
    }, CLEANUP_INTERVAL_MS);

    // unref: 이 타이머가 프로세스 종료를 막지 않도록
    this.cleanupTimer.unref();
  }

  /**
   * 자동 정리 타이머 중지
   */
  private stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 만료된 스캐너 정리
   * TTL(1시간) 동안 미사용된 스캐너 제거
   */
  private async cleanupExpiredScanners(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // 만료된 스캐너 키 수집
    for (const [key, lastAccess] of this.lastAccessTime) {
      if (now - lastAccess > SCANNER_TTL_MS) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length === 0) return;

    logger.info(
      { count: expiredKeys.length, keys: expiredKeys },
      "만료된 스캐너 정리 시작",
    );

    // 만료된 스캐너 정리
    for (const key of expiredKeys) {
      const scanner = this.scanners.get(key);
      if (scanner) {
        try {
          await scanner.cleanup();
        } catch (error) {
          logger.warn(
            { key, error: error instanceof Error ? error.message : String(error) },
            "스캐너 cleanup 실패",
          );
        }
        this.scanners.delete(key);
        this.lastAccessTime.delete(key);
      }
    }

    logger.info({ count: expiredKeys.length }, "만료된 스캐너 정리 완료");
  }
}

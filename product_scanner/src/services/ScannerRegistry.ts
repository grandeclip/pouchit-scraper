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

/**
 * 스캐너 레지스트리 (Singleton)
 */
export class ScannerRegistry {
  private static instance: ScannerRegistry;
  private scanners: Map<string, IScanner> = new Map();

  private constructor() {}

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
      console.log(`[Registry] 새 스캐너 생성: ${key}`);
      const scanner = ScannerFactory.createScanner(platform, strategyId);
      this.scanners.set(key, scanner);
    }

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
    console.log(`[Registry] 스캐너 등록: ${key}`);
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
      console.log(`[Registry] 스캐너 제거: ${key}`);
    }
  }

  /**
   * 모든 스캐너 정리 및 제거
   */
  async clearAll(): Promise<void> {
    console.log(`[Registry] 모든 스캐너 정리 중...`);

    const cleanupPromises = Array.from(this.scanners.values()).map((scanner) =>
      scanner.cleanup(),
    );

    await Promise.allSettled(cleanupPromises);
    this.scanners.clear();

    console.log(`[Registry] 모든 스캐너 정리 완료`);
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
}

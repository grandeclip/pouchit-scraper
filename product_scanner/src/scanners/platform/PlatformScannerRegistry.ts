/**
 * PlatformScannerRegistry
 *
 * 플랫폼 스캐너 중앙 관리 Registry
 *
 * SOLID 원칙:
 * - SRP: 스캐너 인스턴스 관리만 담당
 * - OCP: 새 플랫폼 스캐너 등록으로 확장
 * - DIP: IPlatformScanner 인터페이스에 의존
 *
 * 패턴:
 * - Singleton Pattern: 전역 단일 인스턴스
 * - Registry Pattern: 플랫폼별 스캐너 관리
 * - Factory Method: 기본 스캐너 자동 등록
 */

import type { IPlatformScanner } from "./IPlatformScanner";
import { AblyPlatformScanner } from "./impl/AblyPlatformScanner";
import { OliveyoungPlatformScanner } from "./impl/OliveyoungPlatformScanner";
import { KurlyPlatformScanner } from "./impl/KurlyPlatformScanner";
import { ApiPlatformScanner } from "./impl/ApiPlatformScanner";
import { logger } from "@/config/logger";

/**
 * PlatformScannerRegistry
 *
 * ScanProductNode에서 플랫폼별 스캐너를 조회하는 중앙 Registry
 */
export class PlatformScannerRegistry {
  /** Singleton 인스턴스 */
  private static instance: PlatformScannerRegistry;

  /** 등록된 스캐너 Map */
  private readonly scanners: Map<string, IPlatformScanner> = new Map();

  /**
   * Private constructor (Singleton)
   */
  private constructor() {
    this.registerDefaults();
  }

  /**
   * Singleton 인스턴스 반환
   */
  static getInstance(): PlatformScannerRegistry {
    if (!PlatformScannerRegistry.instance) {
      PlatformScannerRegistry.instance = new PlatformScannerRegistry();
    }
    return PlatformScannerRegistry.instance;
  }

  /**
   * 기본 스캐너 등록
   *
   * Browser 기반:
   * - ably: AblyPlatformScanner (API Capture + DOM Extractor)
   * - oliveyoung: OliveyoungPlatformScanner (DOM Extractor)
   * - kurly: KurlyPlatformScanner (DOM Extractor)
   *
   * API 기반:
   * - hwahae: ApiPlatformScanner (HTTP API)
   * - musinsa: ApiPlatformScanner (HTTP API)
   * - zigzag: ApiPlatformScanner (GraphQL)
   */
  private registerDefaults(): void {
    // Browser 기반 스캐너
    this.register(new AblyPlatformScanner());
    this.register(new OliveyoungPlatformScanner());
    this.register(new KurlyPlatformScanner());

    // API 기반 스캐너
    this.register(new ApiPlatformScanner("hwahae", "api"));
    this.register(new ApiPlatformScanner("musinsa", "api"));
    this.register(new ApiPlatformScanner("zigzag", "graphql"));

    logger.info(
      {
        count: this.scanners.size,
        platforms: Array.from(this.scanners.keys()),
      },
      "PlatformScannerRegistry 기본 스캐너 등록 완료",
    );
  }

  /**
   * 스캐너 등록
   *
   * @param scanner 플랫폼 스캐너 인스턴스
   */
  register(scanner: IPlatformScanner): void {
    this.scanners.set(scanner.platform, scanner);
    logger.debug(
      { platform: scanner.platform, scanMethod: scanner.scanMethod },
      "PlatformScanner 등록",
    );
  }

  /**
   * 스캐너 조회
   *
   * @param platform 플랫폼 식별자
   * @returns 플랫폼 스캐너 또는 undefined
   */
  get(platform: string): IPlatformScanner | undefined {
    return this.scanners.get(platform);
  }

  /**
   * 스캐너 존재 여부 확인
   *
   * @param platform 플랫폼 식별자
   * @returns 존재 여부
   */
  has(platform: string): boolean {
    return this.scanners.has(platform);
  }

  /**
   * 스캐너 제거
   *
   * @param platform 플랫폼 식별자
   * @returns 제거 성공 여부
   */
  remove(platform: string): boolean {
    const removed = this.scanners.delete(platform);
    if (removed) {
      logger.debug({ platform }, "PlatformScanner 제거");
    }
    return removed;
  }

  /**
   * 등록된 플랫폼 목록 조회
   *
   * @returns 플랫폼 식별자 배열
   */
  getPlatforms(): string[] {
    return Array.from(this.scanners.keys());
  }

  /**
   * 스캔 방식별 플랫폼 조회
   *
   * @param scanMethod 스캔 방식 (browser | api)
   * @returns 플랫폼 스캐너 배열
   */
  getByScanMethod(scanMethod: "browser" | "api"): IPlatformScanner[] {
    return Array.from(this.scanners.values()).filter(
      (scanner) => scanner.scanMethod === scanMethod,
    );
  }

  /**
   * 등록된 스캐너 개수
   */
  size(): number {
    return this.scanners.size;
  }

  /**
   * 모든 스캐너 제거 (테스트용)
   */
  clear(): void {
    this.scanners.clear();
    logger.debug("PlatformScannerRegistry 모든 스캐너 제거");
  }

  /**
   * 기본 스캐너 재등록 (테스트용)
   */
  reset(): void {
    this.clear();
    this.registerDefaults();
  }
}

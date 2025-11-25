/**
 * ExtractorRegistry
 *
 * 목적: Extractor 중앙 관리 Registry
 * 패턴: Singleton Pattern, Registry Pattern
 * 참고: REFACTORING_PLAN.md Phase 1 Step 1.5
 */

import type { IProductExtractor } from "@/extractors/base";
import { OliveyoungExtractor } from "@/extractors/oliveyoung/OliveyoungExtractor";
import { HwahaeExtractor } from "@/extractors/hwahae/HwahaeExtractor";
import { MusinsaExtractor } from "@/extractors/musinsa/MusinsaExtractor";
import { AblyExtractor } from "@/extractors/ably/AblyExtractor";
import { KurlyExtractor } from "@/extractors/kurly/KurlyExtractor";

/**
 * Extractor 중앙 관리 Registry (Singleton)
 *
 * 전략:
 * - Singleton Pattern으로 전역 단일 인스턴스
 * - Map<string, IProductExtractor<any>>로 다양한 타입 Extractor 저장
 * - 기본 Extractor 자동 등록 (oliveyoung, hwahae 등)
 */
export class ExtractorRegistry {
  private static instance: ExtractorRegistry;
  private readonly extractors: Map<string, IProductExtractor<any>>;

  /**
   * Private constructor (Singleton)
   */
  private constructor() {
    this.extractors = new Map<string, IProductExtractor<any>>();
    this.registerDefaults();
  }

  /**
   * Singleton 인스턴스 반환
   *
   * @returns ExtractorRegistry 인스턴스
   */
  static getInstance(): ExtractorRegistry {
    if (!ExtractorRegistry.instance) {
      ExtractorRegistry.instance = new ExtractorRegistry();
    }
    return ExtractorRegistry.instance;
  }

  /**
   * 기본 Extractor 등록
   *
   * 플랫폼별 Extractor를 기본 등록:
   * - oliveyoung: OliveyoungExtractor (Playwright 기반)
   * - hwahae: HwahaeExtractor (HTTP API 기반)
   * - musinsa: MusinsaExtractor (HTTP API 기반)
   * - ably: AblyExtractor (Playwright 기반, SSR 데이터 파싱)
   * - kurly: KurlyExtractor (Playwright 기반, SSR 데이터 파싱)
   * - 향후 추가: zigzag 등
   */
  private registerDefaults(): void {
    this.register("oliveyoung", new OliveyoungExtractor());
    this.register("hwahae", new HwahaeExtractor());
    this.register("musinsa", new MusinsaExtractor());
    this.register("ably", new AblyExtractor());
    this.register("kurly", new KurlyExtractor());
  }

  /**
   * Extractor 등록
   *
   * @param id Extractor ID (플랫폼명)
   * @param extractor IProductExtractor 구현체 (모든 입력 타입 지원)
   */
  register(id: string, extractor: IProductExtractor<any>): void {
    this.extractors.set(id, extractor);
  }

  /**
   * Extractor 조회
   *
   * @param id Extractor ID (예: "oliveyoung", "hwahae")
   * @returns IProductExtractor 구현체 (모든 입력 타입 지원)
   * @throws {Error} Extractor가 없는 경우 (등록된 ID 목록 포함)
   *
   * @example
   * const extractor = registry.get("oliveyoung"); // IProductExtractor<Page>
   * const hwahaeExtractor = registry.get("hwahae"); // IProductExtractor<HwahaeApiResponse>
   */
  get(id: string): IProductExtractor<any> {
    const extractor = this.extractors.get(id);

    if (!extractor) {
      const availableIds = Array.from(this.extractors.keys()).join(", ");
      throw new Error(
        `Extractor not found: ${id}. Available: [${availableIds}]`,
      );
    }

    return extractor;
  }

  /**
   * Extractor 존재 확인
   *
   * @param id Extractor ID
   * @returns 존재 여부
   */
  has(id: string): boolean {
    return this.extractors.has(id);
  }

  /**
   * 모든 Extractor 제거
   *
   * 테스트 격리를 위한 메서드
   */
  clear(): void {
    this.extractors.clear();
  }
}

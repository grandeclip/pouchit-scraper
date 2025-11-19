/**
 * ExtractorRegistry
 *
 * 목적: Extractor 중앙 관리 Registry
 * 패턴: Singleton Pattern, Registry Pattern
 * 참고: REFACTORING_PLAN.md Phase 1 Step 1.5
 */

import type { IProductExtractor } from "@/extractors/base";
import { OliveyoungExtractor } from "@/extractors/oliveyoung/OliveyoungExtractor";

/**
 * Extractor 중앙 관리 Registry (Singleton)
 *
 * 전략:
 * - Singleton Pattern으로 전역 단일 인스턴스
 * - Map<string, IProductExtractor>로 Extractor 저장
 * - 기본 Extractor 자동 등록 (oliveyoung 등)
 */
export class ExtractorRegistry {
  private static instance: ExtractorRegistry;
  private readonly extractors: Map<string, IProductExtractor>;

  /**
   * Private constructor (Singleton)
   */
  private constructor() {
    this.extractors = new Map<string, IProductExtractor>();
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
   * - oliveyoung: OliveyoungExtractor
   * - 향후 추가: hwahae, musinsa, kurly 등
   */
  private registerDefaults(): void {
    this.register("oliveyoung", new OliveyoungExtractor());
  }

  /**
   * Extractor 등록
   *
   * @param id Extractor ID (플랫폼명)
   * @param extractor IProductExtractor 구현체
   */
  register(id: string, extractor: IProductExtractor): void {
    this.extractors.set(id, extractor);
  }

  /**
   * Extractor 조회
   *
   * @param id Extractor ID (예: "oliveyoung")
   * @returns IProductExtractor 구현체
   * @throws {Error} Extractor가 없는 경우 (등록된 ID 목록 포함)
   *
   * @example
   * const extractor = registry.get("oliveyoung");
   */
  get(id: string): IProductExtractor {
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

/**
 * Schema.org Availability Mapper
 *
 * SOLID 원칙:
 * - SRP: Schema.org availability 매핑만 담당
 * - OCP: YAML 기반 확장 가능
 * - DIP: 설정 파일에 의존
 *
 * Design Pattern:
 * - Singleton Pattern: 설정 파일 1회 로드
 * - Strategy Pattern: 매핑 전략 캡슐화
 *
 * 목적:
 * - Schema.org availability 표준 매핑 공통화
 * - 중복 로직 제거 (DRY)
 * - 재사용 가능한 유틸리티
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { logger } from "@/config/logger";

/**
 * Availability Mapping 설정
 */
interface AvailabilityMappingConfig {
  availability_mappings: Record<string, string>;
  default: string;
}

/**
 * Schema.org Availability Mapper (Singleton)
 */
export class AvailabilityMapper {
  private static instance: AvailabilityMapper | null = null;
  private mappings: Record<string, string>;
  private defaultStatus: string;

  private constructor() {
    const configPath = path.resolve(
      __dirname,
      "../config/mappings/schema-org-availability.yaml",
    );

    try {
      const fileContent = fs.readFileSync(configPath, "utf8");
      const config = yaml.load(fileContent) as AvailabilityMappingConfig;

      this.mappings = config.availability_mappings;
      this.defaultStatus = config.default;

      logger.debug(
        { mappingCount: Object.keys(this.mappings).length },
        "AvailabilityMapper 초기화 완료",
      );
    } catch (error) {
      logger.error(
        { error, configPath },
        "AvailabilityMapper 초기화 실패 - 기본값 사용",
      );

      // Fallback 매핑
      this.mappings = {
        "https://schema.org/InStock": "SELNG",
        "https://schema.org/OutOfStock": "SLDOT",
        "https://schema.org/SoldOut": "SLDOT",
        "https://schema.org/Discontinued": "STSEL",
        "": "SLDOT",
      };
      this.defaultStatus = "SLDOT";
    }
  }

  /**
   * Singleton 인스턴스 가져오기
   */
  public static getInstance(): AvailabilityMapper {
    if (!AvailabilityMapper.instance) {
      AvailabilityMapper.instance = new AvailabilityMapper();
    }
    return AvailabilityMapper.instance;
  }

  /**
   * 매핑 테이블 가져오기 (Browser context 전달용)
   *
   * @returns 매핑 테이블 (Schema.org URL → 내부 상태)
   */
  public getMappings(): Record<string, string> {
    return { ...this.mappings };
  }

  /**
   * 기본 상태 가져오기
   *
   * @returns 기본 판매 상태
   */
  public getDefaultStatus(): string {
    return this.defaultStatus;
  }

  /**
   * Schema.org availability 값을 내부 판매 상태로 매핑
   *
   * @param availability Schema.org availability URL 또는 null
   * @returns 내부 판매 상태 (SELNG, SLDOT, STSEL)
   */
  public map(availability: string | null | undefined): string {
    // null/undefined 처리
    if (availability === null || availability === undefined) {
      return this.mappings["null"] || this.defaultStatus;
    }

    // 빈 문자열 처리
    if (availability === "") {
      return this.mappings[""] || this.defaultStatus;
    }

    // 매핑 테이블에서 찾기
    const mapped = this.mappings[availability];

    if (mapped) {
      return mapped;
    }

    // 알 수 없는 경우 기본값
    logger.warn(
      { availability },
      "알 수 없는 Schema.org availability - 기본값 사용",
    );

    return this.defaultStatus;
  }

  /**
   * Singleton 인스턴스 초기화 해제 (테스트용)
   */
  public static resetInstance(): void {
    AvailabilityMapper.instance = null;
  }
}

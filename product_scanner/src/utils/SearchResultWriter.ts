/**
 * SearchResultWriter - 통합 검색 결과 JSONL 스트리밍 저장 유틸리티
 *
 * SOLID 원칙:
 * - SRP: 검색 결과 JSONL 스트리밍 저장만 담당
 * - OCP: 다양한 검색 타입 확장 가능
 *
 * 목적:
 * - 통합 검색 결과를 실시간으로 JSONL 파일에 append
 * - 중단 시에도 이미 검색된 결과 보존
 * - MonitorResultWriter와 동일한 패턴 유지
 */

import * as fs from "fs/promises";
import * as path from "path";
import { OUTPUT_CONFIG } from "@/config/constants";
import { getTimestampWithTimezone } from "@/utils/timestamp";

/**
 * 개별 플랫폼 검색 결과 요약
 */
export interface PlatformSearchSummary {
  /** 플랫폼명 */
  platform: string;
  /** 검색 성공 여부 */
  success: boolean;
  /** 검색된 상품 수 */
  count: number;
  /** 총 검색 결과 수 (서버에서 반환한 값) */
  totalCount: number;
  /** 소요 시간 (ms) */
  durationMs: number;
  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * 전체 검색 Summary
 */
export interface UnifiedSearchSummary {
  /** 총 플랫폼 수 */
  totalPlatforms: number;
  /** 성공 플랫폼 수 */
  successPlatforms: number;
  /** 실패 플랫폼 수 */
  failedPlatforms: number;
  /** 총 검색된 상품 수 */
  totalProducts: number;
}

/**
 * SearchResultWriter 옵션
 */
export interface SearchResultWriterOptions {
  /** 출력 디렉토리 (기본: OUTPUT_CONFIG.RESULT_DIR) */
  outputDir?: string;
  /** Job ID (uuid7) */
  jobId: string;
  /** 브랜드명 */
  brand: string;
  /** 상품명 */
  productName: string;
  /** 플랫폼별 최대 결과 수 */
  maxPerPlatform: number;
}

/**
 * SearchResultWriter
 *
 * 통합 검색 결과를 JSONL 형식으로 스트리밍 저장
 * - 파일명: job_search_{job_id}.jsonl
 * - 경로: {outputDir}/{YYYY-MM-DD}/
 *
 * 사용법:
 * 1. initialize() - 헤더 작성, 파일 열기
 * 2. appendPlatformResult() - 각 플랫폼 결과 추가 (반복)
 * 3. finalize() - 푸터 작성, 파일 닫기
 */
export class SearchResultWriter {
  private readonly outputDir: string;
  private readonly jobId: string;
  private readonly brand: string;
  private readonly productName: string;
  private readonly maxPerPlatform: number;

  private filePath: string;
  private fileHandle: fs.FileHandle | null = null;
  private summary: UnifiedSearchSummary;
  private startedAt: string;

  constructor(options: SearchResultWriterOptions) {
    this.outputDir = options.outputDir || OUTPUT_CONFIG.RESULT_DIR;
    this.jobId = options.jobId;
    this.brand = options.brand;
    this.productName = options.productName;
    this.maxPerPlatform = options.maxPerPlatform;
    this.filePath = this.generateFilePath();
    this.startedAt = getTimestampWithTimezone();
    this.summary = {
      totalPlatforms: 0,
      successPlatforms: 0,
      failedPlatforms: 0,
      totalProducts: 0,
    };
  }

  /**
   * 로컬 타임존 기준 날짜 문자열 반환 (YYYY-MM-DD)
   */
  private getLocalDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * 파일 경로 생성
   * - 경로: {outputDir}/{YYYY-MM-DD}/job_search_{job_id}.jsonl
   */
  private generateFilePath(): string {
    const date = this.getLocalDateString();
    const baseDir = path.join(path.resolve(this.outputDir), date);
    const filename = `job_search_${this.jobId}.jsonl`;
    return path.join(baseDir, filename);
  }

  /**
   * Writer 초기화 (디렉토리 생성 + 파일 열기 + 헤더 작성)
   */
  async initialize(): Promise<void> {
    try {
      // 디렉토리 생성
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true, mode: 0o777 });

      // 파일 열기 (append mode)
      this.fileHandle = await fs.open(this.filePath, "a");

      // 파일 권한 설정 (666)
      await fs.chmod(this.filePath, 0o666);

      // 메타데이터 헤더 작성
      const header = {
        _meta: true,
        type: "header",
        job_id: this.jobId,
        brand: this.brand,
        product_name: this.productName,
        keyword: `${this.brand} ${this.productName}`.trim(),
        max_per_platform: this.maxPerPlatform,
        started_at: this.startedAt,
      };

      await this.fileHandle.write(JSON.stringify(header) + "\n", null, "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SearchResultWriter 초기화 실패: ${message}`);
    }
  }

  /**
   * 플랫폼 검색 결과 추가 (JSONL append + Summary 증분 업데이트)
   */
  async appendPlatformResult(result: PlatformSearchSummary): Promise<void> {
    if (!this.fileHandle) {
      throw new Error("Writer not initialized. Call initialize() first.");
    }

    try {
      // JSONL 라인 작성
      const line = JSON.stringify(result) + "\n";
      await this.fileHandle.write(line, null, "utf-8");

      // Summary 증분 업데이트
      this.summary.totalPlatforms++;
      if (result.success) {
        this.summary.successPlatforms++;
        this.summary.totalProducts += result.count;
      } else {
        this.summary.failedPlatforms++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SearchResultWriter append 실패: ${message}`);
    }
  }

  /**
   * Writer 종료 (푸터 작성 + 파일 닫기)
   */
  async finalize(): Promise<{
    filePath: string;
    summary: UnifiedSearchSummary;
  }> {
    try {
      const completedAt = getTimestampWithTimezone();

      // 메타데이터 푸터 작성
      if (this.fileHandle) {
        const footer = {
          _meta: true,
          type: "footer",
          completed_at: completedAt,
          summary: this.summary,
        };

        await this.fileHandle.write(
          JSON.stringify(footer) + "\n",
          null,
          "utf-8",
        );

        // 파일 닫기
        await this.fileHandle.close();
        this.fileHandle = null;
      }

      return {
        filePath: this.filePath,
        summary: this.summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`SearchResultWriter 종료 실패: ${message}`);
    }
  }

  /**
   * 현재 Summary 조회
   */
  getSummary(): UnifiedSearchSummary {
    return { ...this.summary };
  }

  /**
   * 파일 경로 조회
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Writer 정리 (에러 시 안전한 종료)
   */
  async cleanup(): Promise<void> {
    if (this.fileHandle) {
      try {
        await this.fileHandle.close();
        this.fileHandle = null;
      } catch {
        // 무시
      }
    }
  }
}

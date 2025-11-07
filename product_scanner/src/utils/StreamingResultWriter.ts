/**
 * Streaming Result Writer
 *
 * SOLID 원칙:
 * - SRP: JSONL 스트리밍 저장만 담당
 * - OCP: 다양한 포맷 확장 가능
 *
 * 목적:
 * - 검증 결과를 메모리에 쌓지 않고 실시간 파일 append
 * - 중단 시에도 이미 검증된 결과 보존
 * - 대용량 처리 시 메모리 효율성
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "@/config/logger";
import { getTimestampWithTimezone } from "@/utils/timestamp";

/**
 * Summary 통계 (증분 계산용)
 */
export interface ValidationSummary {
  total: number;
  success: number;
  failed: number;
  not_found: number;
  match_rate: number;
}

/**
 * Streaming Result Writer 옵션
 */
export interface StreamingResultWriterOptions {
  /** 출력 디렉토리 */
  outputDir: string;
  /** Platform ID (파일명에 사용) */
  platform: string;
  /** Job ID (파일명에 사용) */
  jobId: string;
  /** Workflow ID (메타데이터에 사용) */
  workflowId?: string;
  /** 날짜별 서브디렉토리 사용 여부 (기본: true) */
  useDateSubdir?: boolean;
}

/**
 * Streaming Result Writer
 *
 * 검증 결과를 JSONL 형식으로 실시간 append
 */
export class StreamingResultWriter {
  private filePath: string;
  private fileHandle: fs.FileHandle | null = null;
  private summary: ValidationSummary;
  private writeCount: number = 0;
  private startedAt: string;

  constructor(private options: StreamingResultWriterOptions) {
    this.filePath = this.generateFilePath();
    this.startedAt = getTimestampWithTimezone();
    this.summary = {
      total: 0,
      success: 0,
      failed: 0,
      not_found: 0,
      match_rate: 0,
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
   */
  private generateFilePath(): string {
    const { outputDir, platform, jobId, useDateSubdir = true } = this.options;

    let baseDir = path.resolve(outputDir);

    // 날짜별 서브디렉토리 사용
    if (useDateSubdir) {
      const date = this.getLocalDateString(); // YYYY-MM-DD (Asia/Seoul 기준)
      baseDir = path.join(baseDir, date);
    }

    // 파일명: job_{platform}_{job_id}.jsonl
    const filename = `job_${platform}_${jobId}.jsonl`;
    return path.join(baseDir, filename);
  }

  /**
   * Writer 초기화 (디렉토리 생성 + 파일 열기 + 메타데이터 헤더 작성)
   */
  async initialize(): Promise<void> {
    try {
      // 디렉토리 생성
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true, mode: 0o775 });

      // 파일 열기 (append mode)
      this.fileHandle = await fs.open(this.filePath, "a");

      // 파일 권한 설정 (664)
      await fs.chmod(this.filePath, 0o664);

      // 메타데이터 헤더 작성 (첫 줄)
      const metaHeader = {
        _meta: true,
        type: "header",
        job_id: this.options.jobId,
        platform: this.options.platform,
        workflow_id: this.options.workflowId || "unknown",
        started_at: this.startedAt,
      };

      await this.fileHandle.write(
        JSON.stringify(metaHeader) + "\n",
        null,
        "utf-8",
      );

      logger.info(
        { filePath: this.filePath },
        "StreamingResultWriter 초기화 완료 (메타데이터 헤더 포함)",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, filePath: this.filePath },
        "StreamingResultWriter 초기화 실패",
      );
      throw error;
    }
  }

  /**
   * 검증 결과 추가 (JSONL append + Summary 증분 업데이트)
   */
  async append(validation: {
    status: "success" | "failed" | "not_found";
    match?: boolean;
    [key: string]: unknown;
  }): Promise<void> {
    if (!this.fileHandle) {
      throw new Error("Writer not initialized. Call initialize() first.");
    }

    try {
      // JSONL 라인 작성
      const line = JSON.stringify(validation) + "\n";
      await this.fileHandle.write(line, null, "utf-8");

      // Summary 증분 업데이트
      this.summary.total++;
      if (validation.status === "success") {
        this.summary.success++;
      } else if (validation.status === "failed") {
        this.summary.failed++;
      } else if (validation.status === "not_found") {
        this.summary.not_found++;
      }

      this.writeCount++;

      // 100건마다 진행 로그 (선택적)
      if (this.writeCount % 100 === 0) {
        logger.debug(
          { writeCount: this.writeCount, summary: this.summary },
          "Streaming write 진행 중",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, writeCount: this.writeCount },
        "Streaming write 실패",
      );
      throw error;
    }
  }

  /**
   * Writer 종료 (Summary 계산 + 메타데이터 푸터 작성 + 파일 닫기)
   */
  async finalize(): Promise<{
    filePath: string;
    summary: ValidationSummary;
    recordCount: number;
  }> {
    try {
      // match_rate 계산
      if (this.summary.total > 0) {
        this.summary.match_rate =
          Math.round((this.summary.success / this.summary.total) * 10000) / 100;
      }

      const completedAt = getTimestampWithTimezone();

      // Summary 메타데이터 푸터 작성 (마지막 줄)
      if (this.fileHandle) {
        const metaFooter = {
          _meta: true,
          type: "footer",
          completed_at: completedAt,
          summary: this.summary,
        };

        await this.fileHandle.write(
          JSON.stringify(metaFooter) + "\n",
          null,
          "utf-8",
        );

        // 파일 닫기
        await this.fileHandle.close();
        this.fileHandle = null;
      }

      // 파일 크기 조회
      const stats = await fs.stat(this.filePath);
      const fileSize = stats.size;

      logger.info(
        {
          filePath: this.filePath,
          fileSize,
          recordCount: this.writeCount,
          summary: this.summary,
        },
        "StreamingResultWriter 완료 (메타데이터 푸터 포함)",
      );

      return {
        filePath: this.filePath,
        summary: this.summary,
        recordCount: this.writeCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "StreamingResultWriter 종료 실패");
      throw error;
    }
  }

  /**
   * 현재 Summary 조회
   */
  getSummary(): ValidationSummary {
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
      } catch (error) {
        logger.error({ error }, "StreamingResultWriter cleanup 실패");
      }
    }
  }
}

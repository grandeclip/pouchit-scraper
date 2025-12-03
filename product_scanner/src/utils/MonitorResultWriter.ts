/**
 * MonitorResultWriter - 모니터링 결과 JSONL 스트리밍 저장 유틸리티
 *
 * SOLID 원칙:
 * - SRP: 모니터링 결과 JSONL 스트리밍 저장만 담당
 * - OCP: 다양한 모니터 타입 확장 가능
 *
 * 목적:
 * - 모니터링 결과를 실시간으로 JSONL 파일에 append
 * - 중단 시에도 이미 검사된 결과 보존
 * - StreamingResultWriter와 동일한 패턴 유지
 */

import * as fs from "fs/promises";
import * as path from "path";
import { OUTPUT_CONFIG } from "@/config/constants";
import { getTimestampWithTimezone } from "@/utils/timestamp";

/**
 * 개별 검사 결과 타입
 */
export interface MonitorCheckResult {
  /** product_set_id */
  product_set_id: string;
  /** 검사 통과 여부 */
  valid: boolean;
  /** 에러 메시지 (실패 시) */
  error?: string;
  /** 상품 링크 URL */
  link_url?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * Summary 통계 (증분 계산용)
 */
export interface MonitorSummary {
  total: number;
  valid: number;
  invalid: number;
}

/**
 * MonitorResultWriter 옵션
 */
export interface MonitorResultWriterOptions {
  /** 출력 디렉토리 (기본: OUTPUT_CONFIG.RESULT_DIR) */
  outputDir?: string;
  /** 모니터 타입 */
  monitorType: string;
  /** Job ID (uuid7) */
  jobId: string;
  /** Workflow ID */
  workflowId?: string;
}

/**
 * MonitorResultWriter
 *
 * 모니터링 결과를 JSONL 형식으로 스트리밍 저장
 * - 파일명: job_monitor_{monitor_type}_{job_id}.jsonl
 * - 경로: {outputDir}/{YYYY-MM-DD}/
 *
 * 사용법:
 * 1. initialize() - 헤더 작성, 파일 열기
 * 2. append() - 각 검사 결과 추가 (반복)
 * 3. finalize() - 푸터 작성, 파일 닫기
 */
export class MonitorResultWriter {
  private readonly outputDir: string;
  private readonly monitorType: string;
  private readonly jobId: string;
  private readonly workflowId: string;

  private filePath: string;
  private fileHandle: fs.FileHandle | null = null;
  private summary: MonitorSummary;
  private startedAt: string;

  constructor(options: MonitorResultWriterOptions) {
    this.outputDir = options.outputDir || OUTPUT_CONFIG.RESULT_DIR;
    this.monitorType = options.monitorType;
    this.jobId = options.jobId;
    this.workflowId = options.workflowId || "unknown";
    this.filePath = this.generateFilePath();
    this.startedAt = getTimestampWithTimezone();
    this.summary = {
      total: 0,
      valid: 0,
      invalid: 0,
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
   * - 경로: {outputDir}/{YYYY-MM-DD}/job_monitor_{type}_{job_id}.jsonl
   */
  private generateFilePath(): string {
    const date = this.getLocalDateString();
    const baseDir = path.join(path.resolve(this.outputDir), date);
    const filename = `job_monitor_${this.monitorType}_${this.jobId}.jsonl`;
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
        workflow_id: this.workflowId,
        monitor_type: this.monitorType,
        started_at: this.startedAt,
      };

      await this.fileHandle.write(JSON.stringify(header) + "\n", null, "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`MonitorResultWriter 초기화 실패: ${message}`);
    }
  }

  /**
   * 검사 결과 추가 (JSONL append + Summary 증분 업데이트)
   */
  async append(result: MonitorCheckResult): Promise<void> {
    if (!this.fileHandle) {
      throw new Error("Writer not initialized. Call initialize() first.");
    }

    try {
      // JSONL 라인 작성
      const line = JSON.stringify(result) + "\n";
      await this.fileHandle.write(line, null, "utf-8");

      // Summary 증분 업데이트
      this.summary.total++;
      if (result.valid) {
        this.summary.valid++;
      } else {
        this.summary.invalid++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`MonitorResultWriter append 실패: ${message}`);
    }
  }

  /**
   * Writer 종료 (푸터 작성 + 파일 닫기)
   */
  async finalize(notified: boolean): Promise<{
    filePath: string;
    summary: MonitorSummary;
  }> {
    try {
      const completedAt = getTimestampWithTimezone();

      // 메타데이터 푸터 작성
      if (this.fileHandle) {
        const footer = {
          _meta: true,
          type: "footer",
          completed_at: completedAt,
          notified,
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
      throw new Error(`MonitorResultWriter 종료 실패: ${message}`);
    }
  }

  /**
   * 현재 Summary 조회
   */
  getSummary(): MonitorSummary {
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

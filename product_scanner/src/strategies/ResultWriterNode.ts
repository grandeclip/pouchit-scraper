/**
 * Result Writer Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 결과 파일 작성만 담당
 * - Strategy Pattern: INodeStrategy 구현
 */

import fs from "fs/promises";
import path from "path";
import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { getTimestampWithTimezone } from "@/utils/timestamp";

/**
 * Result Writer Node Config
 */
interface ResultWriterConfig {
  output_dir: string;
  format: "json" | "jsonl" | "csv";
  filename?: string;
  pretty?: boolean;
}

/**
 * Result Writer Node Strategy
 */
export class ResultWriterNode implements INodeStrategy {
  public readonly type = "result_writer";

  /**
   * 노드 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { config, params, input, job_id } = context;

    // 현재 시각 기록 (Job 완료 시각)
    const completedAt = getTimestampWithTimezone();

    // Config와 params 병합
    const writerConfig = this.mergeConfig(config, params);

    // 이전 노드의 검증 결과 가져오기
    const validationResult = input.hwahae_validation as
      | {
          validations: unknown[];
          summary: {
            total: number;
            success: number;
            failed: number;
            not_found: number;
            match_rate: number;
          };
        }
      | undefined;

    if (!validationResult) {
      return {
        success: false,
        data: {},
        error: {
          message: "No validation results found from previous node",
          code: "MISSING_INPUT_DATA",
        },
      };
    }

    console.log(
      `[${this.type}] Writing ${validationResult.validations.length} validation results`,
    );

    try {
      // 출력 디렉토리 생성
      const outputDir = path.resolve(writerConfig.output_dir);
      await fs.mkdir(outputDir, { recursive: true });

      // 파일명 생성
      const filename = writerConfig.filename || `${job_id}.json`;
      const filePath = path.join(outputDir, filename);

      // 출력 데이터 준비
      // Job 메타데이터에서 시작 시간 가져오기 (없으면 현재 시각 사용)
      const jobMetadata = input.job_metadata as
        | { started_at?: string }
        | undefined;
      const startedAt = jobMetadata?.started_at || completedAt;

      const outputData = {
        job_id,
        started_at: startedAt,
        completed_at: completedAt,
        summary: validationResult.summary,
        validations: validationResult.validations,
      };

      // 포맷별 저장
      switch (writerConfig.format) {
        case "json":
          await this.writeJson(
            filePath,
            outputData,
            writerConfig.pretty ?? true,
          );
          break;
        case "jsonl":
          await this.writeJsonLines(filePath, validationResult.validations);
          break;
        case "csv":
          await this.writeCsv(filePath, validationResult.validations);
          break;
        default:
          throw new Error(`Unsupported format: ${writerConfig.format}`);
      }

      // 파일 크기 조회
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      console.log(
        `[${this.type}] Results written to ${filePath} (${fileSize} bytes)`,
      );

      return {
        success: true,
        data: {
          result_writer: {
            file_path: filePath,
            file_size: fileSize,
            record_count: validationResult.validations.length,
            written_at: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.type}] Write failed:`, message);

      return {
        success: false,
        data: {},
        error: {
          message,
          code: "RESULT_WRITE_ERROR",
        },
      };
    }
  }

  /**
   * JSON 저장
   */
  private async writeJson(
    filePath: string,
    data: unknown,
    pretty: boolean,
  ): Promise<void> {
    const content = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * JSON Lines 저장
   */
  private async writeJsonLines(
    filePath: string,
    validations: unknown[],
  ): Promise<void> {
    const lines = validations.map((v) => JSON.stringify(v)).join("\n");
    await fs.writeFile(filePath, lines, "utf-8");
  }

  /**
   * CSV 저장
   */
  private async writeCsv(
    filePath: string,
    validations: unknown[],
  ): Promise<void> {
    const headers = [
      "product_set_id",
      "product_id",
      "status",
      "validated_at",
      "db_product_name",
      "fetch_product_name",
      "product_name_match",
      "overall_match",
      "error",
    ];

    const rows = validations.map((v: any) => {
      return [
        v.product_set_id || "",
        v.product_id || "",
        v.status || "",
        v.validated_at || "",
        this.escapeCsv(v.db?.product_name || ""),
        this.escapeCsv(v.fetch?.product_name || ""),
        v.comparison?.product_name || false,
        v.match || false,
        this.escapeCsv(v.error || ""),
      ].join(",");
    });

    const content = [headers.join(","), ...rows].join("\n");
    await fs.writeFile(filePath, content, "utf-8");
  }

  /**
   * CSV 값 이스케이프
   */
  private escapeCsv(value: string | number | boolean): string {
    const str = String(value);

    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * Config 검증
   */
  validateConfig(config: Record<string, unknown>): void {
    if (!config.output_dir) {
      throw new Error("output_dir is required");
    }

    if (typeof config.output_dir !== "string") {
      throw new Error("output_dir must be a string");
    }

    if (!config.format) {
      throw new Error("format is required");
    }

    const format = config.format as string;
    if (!["json", "jsonl", "csv"].includes(format)) {
      throw new Error("format must be one of: json, jsonl, csv");
    }

    if (config.filename !== undefined && typeof config.filename !== "string") {
      throw new Error("filename must be a string");
    }

    if (config.pretty !== undefined && typeof config.pretty !== "boolean") {
      throw new Error("pretty must be a boolean");
    }
  }

  /**
   * Config와 params 병합
   */
  private mergeConfig(
    config: Record<string, unknown>,
    params: Record<string, unknown>,
  ): ResultWriterConfig {
    const merged: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      merged[key] = this.substituteVariables(value, params);
    }

    return merged as unknown as ResultWriterConfig;
  }

  /**
   * 변수 치환
   */
  private substituteVariables(
    value: unknown,
    params: Record<string, unknown>,
  ): unknown {
    if (typeof value === "string") {
      return value.replace(/\$\{(\w+)\}/g, (_, key) => {
        const replacement = params[key];
        return replacement !== undefined ? String(replacement) : `\${${key}}`;
      });
    }

    return value;
  }
}

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
import { mergeConfig } from "@/utils/ConfigMerger";
import { logger } from "@/config/logger";

/**
 * 검증 결과 타입 (Platform-agnostic)
 */
interface ValidationResultItem {
  product_set_id: string;
  product_id: string;
  status: string;
  validated_at: string;
  db?: {
    product_name?: string | null;
  };
  fetch?: {
    product_name?: string;
  } | null;
  comparison?: {
    product_name?: boolean;
  };
  match?: boolean;
  error?: string;
}

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
    const { config, params, input, job_id, workflow_id } = context;

    // 현재 시각 기록 (Job 완료 시각)
    const completedAt = getTimestampWithTimezone();

    // Config와 params 병합
    const writerConfig = mergeConfig<ResultWriterConfig>(config, params);

    // Platform 정보 추출 (Multi-Queue Architecture)
    // 하위 호환성: platform이 없으면 "default" 사용
    const platform = (params.platform as string) || "default";

    // 이전 노드의 검증 결과 가져오기 (platform-agnostic)
    // 가능한 키: hwahae_validation, oliveyoung_validation, ...
    const validationKey = `${platform}_validation`;
    const validationResult = input[validationKey] as
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
          message: `No validation results found from previous node (expected key: ${validationKey})`,
          code: "MISSING_INPUT_DATA",
        },
      };
    }

    logger.info(
      { type: this.type, count: validationResult.validations.length },
      "결과 파일 작성 중",
    );

    try {
      // 날짜 기반 출력 디렉토리 생성 (YYYY-MM-DD)
      const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const baseOutputDir = path.resolve(writerConfig.output_dir);
      const outputDir = path.join(baseOutputDir, date);
      await fs.mkdir(outputDir, { recursive: true });

      // 파일명 생성: job_{platform}_{job_id}.json
      const filename =
        writerConfig.filename || `job_${platform}_${job_id}.json`;
      const filePath = path.join(outputDir, filename);

      // 출력 데이터 준비
      // Job 메타데이터에서 시작 시간 가져오기 (없으면 현재 시각 사용)
      const jobMetadata = input.job_metadata as
        | { started_at?: string }
        | undefined;
      const startedAt = jobMetadata?.started_at || completedAt;

      const outputData = {
        job_id,
        platform,
        workflow_id, // context에서 직접 가져옴
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

      logger.info(
        {
          type: this.type,
          filePath,
          fileSize,
          recordCount: validationResult.validations.length,
        },
        "결과 파일 작성 완료",
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
      logger.error({ type: this.type, error: message }, "결과 파일 작성 실패");

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

    const typedValidations = validations as ValidationResultItem[];

    const rows = typedValidations.map((v) => {
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
}

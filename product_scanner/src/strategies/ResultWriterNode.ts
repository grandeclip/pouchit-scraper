/**
 * Result Writer Node Strategy
 *
 * SOLID 원칙:
 * - SRP: JSONL 결과 파일 확인만 담당 (실제 작성은 ValidationNode에서 수행)
 * - Strategy Pattern: INodeStrategy 구현
 *
 * 변경 사항:
 * - JSONL 파일은 ValidationNode의 StreamingResultWriter가 생성
 * - ResultWriterNode는 파일 존재 확인 및 메타데이터 전달만 수행
 */

import fs from "fs/promises";
import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import { logger } from "@/config/logger";

/**
 * Result Writer Node Strategy
 */
export class ResultWriterNode implements INodeStrategy {
  public readonly type = "result_writer";

  /**
   * 노드 실행
   * Streaming Write 모드: JSONL 파일 메타데이터 확인 (이미 완료됨)
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { params, input } = context;

    // Platform 정보 추출
    const platform = (params.platform as string) || "default";

    // 이전 노드의 검증 결과 가져오기 (Streaming Write 모드)
    const validationKey = `${platform}_validation`;
    const validationResult = input[validationKey] as
      | {
          jsonl_path: string;
          summary: {
            total: number;
            success: number;
            failed: number;
            not_found: number;
            match_rate: number;
          };
          record_count: number;
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

    const jsonlPath = validationResult.jsonl_path;

    try {
      // 파일 존재 확인
      const stats = await fs.stat(jsonlPath);
      const fileSize = stats.size;

      logger.info(
        {
          type: this.type,
          jsonl_path: jsonlPath,
          file_size: fileSize,
          record_count: validationResult.record_count,
          summary: validationResult.summary,
        },
        "JSONL 결과 파일 확인 완료 (메타데이터 포함)",
      );

      return {
        success: true,
        data: {
          result_writer: {
            jsonl_path: jsonlPath,
            file_size: fileSize,
            record_count: validationResult.record_count,
            summary: validationResult.summary,
            written_at: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ type: this.type, error: message }, "결과 파일 확인 실패");

      return {
        success: false,
        data: {},
        error: {
          message,
          code: "RESULT_FILE_NOT_FOUND",
        },
      };
    }
  }

  /**
   * Config 검증 (현재는 검증 로직 없음 - JSONL만 사용)
   */
  validateConfig(config: Record<string, unknown>): void {
    // JSONL 파일은 ValidationNode에서 생성되므로 검증 불필요
    logger.debug({ type: this.type }, "ResultWriterNode config 검증 생략");
  }
}

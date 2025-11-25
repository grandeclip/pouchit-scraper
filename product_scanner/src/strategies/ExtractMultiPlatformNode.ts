/**
 * Extract Multi-Platform Node Strategy
 *
 * product_id 기반 멀티 플랫폼 상품 추출 노드
 *
 * 워크플로우 흐름:
 * 1. product_id로 Supabase 조회 (여러 product_set 반환)
 * 2. link_url에서 플랫폼 감지 → 그룹화
 * 3. Browser/API 번갈아가며 순차 처리
 * 4. 각 그룹 종료 시 browser 리소스 정리
 * 5. 단일 JSONL 파일에 모든 결과 저장
 *
 * SOLID 원칙:
 * - SRP: 멀티 플랫폼 추출 워크플로우 노드만 담당
 * - DIP: INodeStrategy 인터페이스 구현
 * - OCP: ExtractByProductIdService를 통한 플랫폼 확장
 */

import {
  INodeStrategy,
  NodeContext,
  NodeResult,
} from "@/core/interfaces/INodeStrategy";
import {
  ExtractByProductIdService,
  MultiPlatformValidationResult,
} from "@/services/extract/ExtractByProductIdService";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { logger } from "@/config/logger";
import { logImportant } from "@/utils/LoggerContext";
import { getTimestampWithTimezone } from "@/utils/timestamp";

/**
 * 플랫폼별 Summary (JSONL 푸터용)
 */
interface PlatformSummaryRecord {
  total: number;
  success: number;
  failed: number;
  not_found: number;
}

/**
 * Extract Multi-Platform Node Strategy
 */
export class ExtractMultiPlatformNode implements INodeStrategy {
  public readonly type = "extract_multi_platform";

  private extractService: ExtractByProductIdService;

  constructor() {
    this.extractService = new ExtractByProductIdService();
  }

  /**
   * 노드 실행
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { config, params, workflow_id, job_id } = context;
    const startTime = Date.now();

    // product_id 추출
    const productId = this.resolveVariable(config.product_id as string, params);

    if (!productId) {
      return {
        success: false,
        data: {},
        error: {
          code: "INVALID_CONFIG",
          message: "product_id is required",
        },
      };
    }

    // sale_status 추출 (optional: "on_sale" | "off_sale" | undefined=전체)
    const saleStatus = this.resolveVariable(
      config.sale_status as string | undefined,
      params,
    );

    logger.info(
      { type: this.type, productId, saleStatus, workflow_id },
      "[ExtractMultiPlatformNode] 추출 시작",
    );

    let resultWriter: StreamingResultWriter | null = null;

    try {
      // 1. StreamingResultWriter 초기화 (확장 헤더 포함)
      resultWriter = new StreamingResultWriter({
        outputDir: "/app/results",
        platform: "multi_platform",
        jobId: job_id || `mp_${Date.now()}`,
        workflowId: workflow_id,
      });
      await resultWriter.initialize();

      // 2. ExtractByProductIdService로 추출 실행 (saleStatus 전달)
      const platformSummaries = await this.extractService.extract(
        productId,
        resultWriter,
        saleStatus,
      );

      // 3. 전체 Summary 계산
      const totalSummary = this.calculateTotalSummary(platformSummaries);

      // 4. Writer 종료
      const writeResult = await resultWriter.finalize();
      const durationMs = Date.now() - startTime;

      // 5. platform_summary 객체로 변환
      const platformSummaryObj: Record<string, PlatformSummaryRecord> = {};
      platformSummaries.forEach((summary, platform) => {
        platformSummaryObj[platform] = summary;
      });

      logImportant(logger, "[ExtractMultiPlatformNode] 추출 완료", {
        productId,
        totalProducts: totalSummary.total,
        platforms: Object.keys(platformSummaryObj),
        matchRate: totalSummary.match_rate,
        durationMs,
        jsonlPath: writeResult.filePath,
      });

      // ResultWriterNode 호환 형식
      return {
        success: true,
        data: {
          multi_platform_validation: {
            jsonl_path: writeResult.filePath,
            summary: totalSummary,
            platform_summary: platformSummaryObj,
            record_count: writeResult.recordCount,
            product_id: productId,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { productId, error: message },
        "[ExtractMultiPlatformNode] 추출 실패",
      );

      // 에러 시 파일 정리
      if (resultWriter) {
        await resultWriter.cleanup();
      }

      // 서비스 리소스 정리
      await this.extractService.cleanup();

      return {
        success: false,
        data: {},
        error: {
          code: "MULTI_PLATFORM_EXTRACTION_FAILED",
          message,
        },
      };
    }
  }

  /**
   * 설정 검증
   */
  validateConfig(config: Record<string, unknown>): void {
    if (config.product_id === undefined) {
      throw new Error("product_id is required in config");
    }
  }

  /**
   * 템플릿 변수 치환
   */
  private resolveVariable(
    value: string | undefined,
    params: Record<string, unknown>,
  ): string | undefined {
    if (!value) return undefined;

    if (typeof value === "string" && value.startsWith("${")) {
      const key = value.slice(2, -1);
      return params[key] as string | undefined;
    }

    return value;
  }

  /**
   * 전체 Summary 계산
   */
  private calculateTotalSummary(
    platformSummaries: Map<string, PlatformSummaryRecord>,
  ): {
    total: number;
    success: number;
    failed: number;
    not_found: number;
    match_rate: number;
  } {
    let total = 0;
    let success = 0;
    let failed = 0;
    let notFound = 0;

    platformSummaries.forEach((summary) => {
      total += summary.total;
      success += summary.success;
      failed += summary.failed;
      notFound += summary.not_found;
    });

    const matchRate =
      total > 0 ? Math.round((success / total) * 10000) / 100 : 0;

    return {
      total,
      success,
      failed,
      not_found: notFound,
      match_rate: matchRate,
    };
  }
}

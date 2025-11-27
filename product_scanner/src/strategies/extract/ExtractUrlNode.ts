/**
 * ExtractUrlNode - Phase 4 Typed Node Strategy
 *
 * URL 기반 상품 추출 노드 (Phase 2 → Phase 4 마이그레이션)
 *
 * SOLID 원칙:
 * - SRP: URL에서 직접 상품 정보 추출만 담당 (DB 조회 없음)
 * - OCP: PlatformScannerRegistry를 통한 플랫폼 확장
 * - DIP: IPlatformScanner 인터페이스에 의존
 *
 * 플랫폼별 스캔 방식:
 * - Playwright: oliveyoung, ably, kurly
 * - HTTP API: hwahae, musinsa
 * - GraphQL: zigzag
 *
 * ResultWriterNode 호환:
 * - `url_extraction_validation` 키로 결과 반환
 * - db: null, comparison: null (Supabase 조회 없음)
 */

import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  IValidationResult,
  createSuccessResult,
  createErrorResult,
  validationSuccess,
  validationFailure,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { PlatformScannerRegistry } from "@/scanners/platform/PlatformScannerRegistry";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { BrowserScanExecutor } from "@/scanners/base/BrowserScanExecutor";
import {
  ExtractUrlInput,
  ExtractUrlOutput,
  UrlExtractionResultItem,
  ScannedProductData,
} from "@/strategies/validation/types";

/**
 * ExtractUrlNode 설정
 */
export interface ExtractUrlNodeConfig {
  /** 결과 출력 디렉토리 */
  default_output_dir: string;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: ExtractUrlNodeConfig = {
  default_output_dir: process.env.RESULT_OUTPUT_DIR || "/app/results",
};

/**
 * ExtractUrlNode - URL 기반 상품 추출 노드
 */
export class ExtractUrlNode
  implements ITypedNodeStrategy<ExtractUrlInput, ExtractUrlOutput>
{
  public readonly type = "extract_url";
  public readonly name = "ExtractUrlNode";

  private readonly nodeConfig: ExtractUrlNodeConfig;
  private readonly scanExecutor: BrowserScanExecutor;

  constructor(config?: Partial<ExtractUrlNodeConfig>) {
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
    this.scanExecutor = new BrowserScanExecutor();
  }

  /**
   * 노드 실행
   */
  async execute(
    input: ExtractUrlInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<ExtractUrlOutput>> {
    const { logger, job_id, workflow_id, config } = context;

    // Config 병합 (context.config > input)
    const mergedInput = this.mergeInputWithConfig(input, config);
    const outputDir =
      mergedInput.output_dir ?? this.nodeConfig.default_output_dir;

    logger.info(
      {
        type: this.type,
        url: mergedInput.url,
        job_id,
        workflow_id,
      },
      "[ExtractUrlNode] 추출 시작",
    );

    let resultWriter: StreamingResultWriter | null = null;

    try {
      // 1. 입력 검증
      const validation = this.validate(mergedInput);
      if (!validation.valid) {
        return createErrorResult<ExtractUrlOutput>(
          validation.errors.map((e) => e.message).join(", "),
          "VALIDATION_ERROR",
          validation.errors,
        );
      }

      // 2. 플랫폼 감지
      const detection = PlatformDetector.detect(mergedInput.url);

      if (!detection.platform || !detection.productId) {
        const errorResult = await this.createErrorResultWithFile(
          mergedInput.url,
          job_id,
          workflow_id,
          outputDir,
          {
            code: "PLATFORM_NOT_DETECTED",
            message: `Platform or productId not detected from URL: ${mergedInput.url}`,
          },
        );
        return errorResult;
      }

      const { platform, productId } = detection;

      logger.info(
        { url: mergedInput.url, platform, productId },
        "플랫폼 및 상품 ID 감지 완료",
      );

      // 3. StreamingResultWriter 초기화
      resultWriter = new StreamingResultWriter({
        outputDir,
        platform: "url_extraction",
        jobId: job_id || `url_${Date.now()}`,
        workflowId: workflow_id,
      });
      await resultWriter.initialize();

      // 4. PlatformScannerRegistry를 통한 스캔
      const registry = PlatformScannerRegistry.getInstance();
      const scanner = registry.get(platform);

      if (!scanner) {
        return this.createErrorResultWithFile(
          mergedInput.url,
          job_id,
          workflow_id,
          outputDir,
          {
            code: "SCANNER_NOT_FOUND",
            message: `Scanner not found for platform: ${platform}`,
          },
        );
      }

      // BrowserScanExecutor를 통한 스캔 실행
      const scanResult = await this.scanExecutor.execute(
        scanner,
        platform,
        mergedInput.url,
      );

      // 5. fetch 데이터 생성
      const fetchData: ScannedProductData | null =
        scanResult.isNotFound || !scanResult.data
          ? null
          : {
              product_name: scanResult.data.product_name,
              thumbnail: scanResult.data.thumbnail,
              original_price: scanResult.data.original_price,
              discounted_price: scanResult.data.discounted_price,
              sale_status: scanResult.data.sale_status,
            };

      // 6. 최종 결과 생성 (db: null, comparison: null)
      const resultItem: UrlExtractionResultItem = {
        product_set_id: "", // empty string (Supabase 조회 없음)
        product_id: "", // empty string (Supabase UUID - 조회 없음)
        url: mergedInput.url,
        platform,
        db: null, // Supabase 조회 없음
        fetch: fetchData,
        comparison: null, // 비교 대상 없음
        match: false, // 비교 불가
        status: scanResult.isNotFound ? "not_found" : "success",
        extracted_at: getTimestampWithTimezone(),
      };

      // 7. JSONL 파일에 결과 저장
      await resultWriter.append({
        ...resultItem,
        status: resultItem.status,
      });

      // 8. Writer 종료 및 결과 반환
      const writeResult = await resultWriter.finalize();

      logger.info(
        {
          type: this.type,
          url: mergedInput.url,
          platform,
          productName: fetchData?.product_name || "N/A",
          status: resultItem.status,
          jsonlPath: writeResult.filePath,
        },
        "[ExtractUrlNode] 추출 완료",
      );

      const output: ExtractUrlOutput = {
        jsonl_path: writeResult.filePath,
        record_count: writeResult.recordCount,
        result: resultItem,
        summary: {
          total: 1,
          success: resultItem.status === "success" ? 1 : 0,
          failed: resultItem.status === "failed" ? 1 : 0,
          not_found: resultItem.status === "not_found" ? 1 : 0,
        },
      };

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { url: mergedInput.url, error: message },
        "[ExtractUrlNode] 추출 실패",
      );

      // 에러 시에도 파일 정리
      if (resultWriter) {
        await resultWriter.cleanup();
      }

      // not found 에러 처리
      if (
        message.includes("not found") ||
        message.includes("404") ||
        message.includes("삭제된 상품")
      ) {
        return this.createErrorResultWithFile(
          mergedInput.url,
          job_id,
          workflow_id,
          outputDir,
          {
            code: "PRODUCT_NOT_FOUND",
            message: `Product not found: ${message}`,
          },
        );
      }

      return this.createErrorResultWithFile(
        mergedInput.url,
        job_id,
        workflow_id,
        outputDir,
        {
          code: "EXTRACTION_FAILED",
          message,
        },
      );
    }
  }

  /**
   * 입력 검증
   */
  validate(input: ExtractUrlInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    // URL 필수
    if (!input.url) {
      errors.push({
        field: "url",
        message: "url is required",
        code: "MISSING_URL",
      });
    } else if (typeof input.url !== "string") {
      errors.push({
        field: "url",
        message: "url must be a string",
        code: "INVALID_URL_TYPE",
      });
    } else if (!input.url.startsWith("http")) {
      errors.push({
        field: "url",
        message: "url must start with http or https",
        code: "INVALID_URL_FORMAT",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * 롤백 (필요 시 구현)
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info({ type: this.type }, "Rollback - no action needed");
    // ExtractUrlNode는 읽기 전용이므로 롤백 불필요
    await this.scanExecutor.cleanup();
  }

  /**
   * Input과 Config 병합
   */
  private mergeInputWithConfig(
    input: ExtractUrlInput,
    config: Record<string, unknown>,
  ): ExtractUrlInput {
    return {
      url: input.url ?? (config.url as string),
      output_dir: input.output_dir ?? (config.output_dir as string),
    };
  }

  /**
   * 에러 결과 생성 (JSONL 파일 포함)
   */
  private async createErrorResultWithFile(
    url: string,
    jobId: string | undefined,
    workflowId: string | undefined,
    outputDir: string,
    error: { code: string; message: string },
  ): Promise<ITypedNodeResult<ExtractUrlOutput>> {
    const detection = PlatformDetector.detect(url);

    const resultItem: UrlExtractionResultItem = {
      product_set_id: "",
      product_id: "",
      url,
      platform: detection.platform || "unknown",
      db: null,
      fetch: null,
      comparison: null,
      match: false,
      status: "failed",
      extracted_at: getTimestampWithTimezone(),
      error: error.message,
    };

    const errorWriter = new StreamingResultWriter({
      outputDir,
      platform: "url_extraction",
      jobId: jobId || `url_err_${Date.now()}`,
      workflowId,
    });

    try {
      await errorWriter.initialize();
      await errorWriter.append({
        ...resultItem,
        status: "failed",
      });
      const writeResult = await errorWriter.finalize();

      const output: ExtractUrlOutput = {
        jsonl_path: writeResult.filePath,
        record_count: writeResult.recordCount,
        result: resultItem,
        summary: {
          total: 1,
          success: 0,
          failed: 1,
          not_found: 0,
        },
      };

      // 에러 결과에 output 포함하여 반환
      return {
        success: false,
        data: output,
        error: {
          message: error.message,
          code: error.code,
        },
      };
    } catch (writeError) {
      await errorWriter.cleanup();
      return createErrorResult<ExtractUrlOutput>(error.message, error.code);
    }
  }
}

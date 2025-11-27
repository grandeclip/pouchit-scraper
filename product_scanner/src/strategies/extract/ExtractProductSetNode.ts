/**
 * ExtractProductSetNode - Phase 4 Typed Node Strategy
 *
 * ProductSet ID 기반 상품 추출 노드 (Phase 2 → Phase 4 마이그레이션)
 *
 * SOLID 원칙:
 * - SRP: product_set_id 기반 단일 상품 추출 및 DB 비교만 담당
 * - OCP: PlatformScannerRegistry를 통한 플랫폼 확장
 * - DIP: IProductSearchService, IPlatformScanner 인터페이스에 의존
 *
 * 특징:
 * - Supabase에서 product_set 조회
 * - 스캔 결과와 DB 데이터 비교
 * - JSONL 파일로 결과 저장
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
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import { ProductSearchService } from "@/services/ProductSearchService";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { PlatformScannerRegistry } from "@/scanners/platform/PlatformScannerRegistry";
import { StreamingResultWriter } from "@/utils/StreamingResultWriter";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { BrowserScanExecutor } from "@/scanners/base/BrowserScanExecutor";
import type { ProductSetSearchResult } from "@/core/domain/ProductSet";
import {
  ExtractProductSetInput,
  ExtractProductSetOutput,
  ProductSetExtractionResultItem,
  ScannedProductData,
  DbProductData,
  FieldComparisonResult,
} from "@/strategies/validation/types";

/**
 * ExtractProductSetNode 설정
 */
export interface ExtractProductSetNodeConfig {
  /** 결과 출력 디렉토리 */
  default_output_dir: string;
}

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: ExtractProductSetNodeConfig = {
  default_output_dir: process.env.RESULT_OUTPUT_DIR || "/app/results",
};

/**
 * ExtractProductSetNode - ProductSet ID 기반 상품 추출 노드
 */
export class ExtractProductSetNode
  implements ITypedNodeStrategy<ExtractProductSetInput, ExtractProductSetOutput>
{
  public readonly type = "extract_product_set";
  public readonly name = "ExtractProductSetNode";

  private readonly service: IProductSearchService;
  private readonly nodeConfig: ExtractProductSetNodeConfig;
  private readonly scanExecutor: BrowserScanExecutor;

  constructor(
    service?: IProductSearchService,
    config?: Partial<ExtractProductSetNodeConfig>,
  ) {
    this.service = service ?? new ProductSearchService();
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
    this.scanExecutor = new BrowserScanExecutor();
  }

  /**
   * 노드 실행
   */
  async execute(
    input: ExtractProductSetInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<ExtractProductSetOutput>> {
    const { logger, job_id, workflow_id, config } = context;

    // Config 병합 (context.config > input)
    const mergedInput = this.mergeInputWithConfig(input, config);
    const outputDir =
      mergedInput.output_dir ?? this.nodeConfig.default_output_dir;

    logger.info(
      {
        type: this.type,
        product_set_id: mergedInput.product_set_id,
        job_id,
        workflow_id,
      },
      "[ExtractProductSetNode] 추출 시작",
    );

    let resultWriter: StreamingResultWriter | null = null;

    try {
      // 1. 입력 검증
      const validation = this.validate(mergedInput);
      if (!validation.valid) {
        return createErrorResult<ExtractProductSetOutput>(
          validation.errors.map((e) => e.message).join(", "),
          "VALIDATION_ERROR",
          validation.errors,
        );
      }

      // 2. Supabase에서 상품 조회
      const productSet = await this.service.getProductById(
        mergedInput.product_set_id,
      );

      if (!productSet) {
        return this.createErrorResultWithFile(
          mergedInput.product_set_id,
          job_id,
          workflow_id,
          outputDir,
          {
            code: "PRODUCT_SET_NOT_FOUND",
            message: `Product set not found: ${mergedInput.product_set_id}`,
          },
        );
      }

      // 3. link_url 확인
      const linkUrl = productSet.link_url;
      if (!linkUrl) {
        return this.createErrorResultWithFile(
          mergedInput.product_set_id,
          job_id,
          workflow_id,
          outputDir,
          {
            code: "LINK_URL_MISSING",
            message: "link_url is missing",
          },
        );
      }

      // 4. 플랫폼 감지
      const detection = PlatformDetector.detect(linkUrl);

      if (!detection.platform || !detection.productId) {
        return this.createErrorResultWithFile(
          mergedInput.product_set_id,
          job_id,
          workflow_id,
          outputDir,
          {
            code: "PLATFORM_NOT_DETECTED",
            message: `Platform or productId not detected from URL: ${linkUrl}`,
          },
        );
      }

      const { platform, productId } = detection;

      logger.info(
        {
          product_set_id: mergedInput.product_set_id,
          platform,
          productId,
        },
        "플랫폼 및 상품 ID 감지 완료",
      );

      // 5. StreamingResultWriter 초기화
      resultWriter = new StreamingResultWriter({
        outputDir,
        platform: "product_set_extraction",
        jobId: job_id || `ps_${Date.now()}`,
        workflowId: workflow_id,
      });
      await resultWriter.initialize();

      // 6. PlatformScannerRegistry를 통한 스캔
      const registry = PlatformScannerRegistry.getInstance();
      const scanner = registry.get(platform);

      if (!scanner) {
        return this.createErrorResultWithFile(
          mergedInput.product_set_id,
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
        linkUrl,
      );

      // 7. fetch 데이터 생성
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

      // 8. DB 데이터 생성
      const dbData: DbProductData = {
        product_name: productSet.product_name,
        thumbnail: productSet.thumbnail ?? null,
        original_price: productSet.original_price ?? null,
        discounted_price: productSet.discounted_price ?? null,
        sale_status: productSet.sale_status ?? null,
      };

      // 9. 비교 결과 생성
      const comparison: FieldComparisonResult | null = fetchData
        ? this.compareData(productSet, fetchData)
        : null;

      // 10. 최종 결과 생성
      const resultItem: ProductSetExtractionResultItem = {
        product_set_id: mergedInput.product_set_id,
        product_id: productSet.product_id,
        url: linkUrl,
        platform,
        db: dbData,
        fetch: fetchData,
        comparison,
        match: comparison
          ? Object.values(comparison).every((v) => v === true)
          : false,
        status: scanResult.isNotFound ? "not_found" : "success",
        extracted_at: getTimestampWithTimezone(),
      };

      // 11. JSONL 파일에 결과 저장
      await resultWriter.append({
        ...resultItem,
        status: resultItem.status,
      });

      // 12. Writer 종료 및 결과 반환
      const writeResult = await resultWriter.finalize();

      logger.info(
        {
          type: this.type,
          product_set_id: mergedInput.product_set_id,
          platform,
          productName: fetchData?.product_name || "N/A",
          match: resultItem.match,
          status: resultItem.status,
          jsonlPath: writeResult.filePath,
        },
        "[ExtractProductSetNode] 추출 완료",
      );

      const output: ExtractProductSetOutput = {
        jsonl_path: writeResult.filePath,
        record_count: writeResult.recordCount,
        results: [resultItem],
        summary: {
          total: 1,
          success: resultItem.status === "success" ? 1 : 0,
          failed: resultItem.status === "failed" ? 1 : 0,
          not_found: resultItem.status === "not_found" ? 1 : 0,
          match: resultItem.match ? 1 : 0,
          mismatch:
            resultItem.status === "success" && !resultItem.match ? 1 : 0,
        },
      };

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { product_set_id: mergedInput.product_set_id, error: message },
        "[ExtractProductSetNode] 추출 실패",
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
          mergedInput.product_set_id,
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
        mergedInput.product_set_id,
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
  validate(input: ExtractProductSetInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    // product_set_id 필수
    if (!input.product_set_id) {
      errors.push({
        field: "product_set_id",
        message: "product_set_id is required",
        code: "MISSING_PRODUCT_SET_ID",
      });
    } else if (typeof input.product_set_id !== "string") {
      errors.push({
        field: "product_set_id",
        message: "product_set_id must be a string",
        code: "INVALID_PRODUCT_SET_ID_TYPE",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * 롤백 (필요 시 구현)
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info({ type: this.type }, "Rollback - no action needed");
    await this.scanExecutor.cleanup();
  }

  /**
   * Input과 Config 병합
   */
  private mergeInputWithConfig(
    input: ExtractProductSetInput,
    config: Record<string, unknown>,
  ): ExtractProductSetInput {
    return {
      product_set_id: input.product_set_id ?? (config.product_set_id as string),
      output_dir: input.output_dir ?? (config.output_dir as string),
    };
  }

  /**
   * DB 데이터와 fetch 데이터 비교
   */
  private compareData(
    dbData: ProductSetSearchResult,
    fetchData: ScannedProductData,
  ): FieldComparisonResult {
    return {
      product_name: dbData.product_name === fetchData.product_name,
      thumbnail: (dbData.thumbnail ?? null) === fetchData.thumbnail,
      original_price:
        (dbData.original_price ?? null) === fetchData.original_price,
      discounted_price:
        (dbData.discounted_price ?? null) === fetchData.discounted_price,
      sale_status: (dbData.sale_status ?? null) === fetchData.sale_status,
    };
  }

  /**
   * 에러 결과 생성 (JSONL 파일 포함)
   */
  private async createErrorResultWithFile(
    productSetId: string,
    jobId: string | undefined,
    workflowId: string | undefined,
    outputDir: string,
    error: { code: string; message: string },
  ): Promise<ITypedNodeResult<ExtractProductSetOutput>> {
    const resultItem: ProductSetExtractionResultItem = {
      product_set_id: productSetId,
      product_id: "",
      url: null,
      platform: "unknown",
      db: {
        product_name: null,
        thumbnail: null,
        original_price: null,
        discounted_price: null,
        sale_status: null,
      },
      fetch: null,
      comparison: null,
      match: false,
      status: "failed",
      extracted_at: getTimestampWithTimezone(),
      error: error.message,
    };

    const errorWriter = new StreamingResultWriter({
      outputDir,
      platform: "product_set_extraction",
      jobId: jobId || `ps_err_${Date.now()}`,
      workflowId,
    });

    try {
      await errorWriter.initialize();
      await errorWriter.append({
        ...resultItem,
        status: "failed",
      });
      const writeResult = await errorWriter.finalize();

      const output: ExtractProductSetOutput = {
        jsonl_path: writeResult.filePath,
        record_count: writeResult.recordCount,
        results: [resultItem],
        summary: {
          total: 1,
          success: 0,
          failed: 1,
          not_found: 0,
          match: 0,
          mismatch: 0,
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
      return createErrorResult<ExtractProductSetOutput>(
        error.message,
        error.code,
      );
    }
  }
}

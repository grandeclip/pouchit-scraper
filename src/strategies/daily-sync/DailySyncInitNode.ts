/**
 * DailySyncInitNode - Daily Sync 초기화 노드
 *
 * SOLID 원칙:
 * - SRP: Daily Sync 초기화만 담당 (products 조회, brand 매핑, JSONL 초기화)
 * - DIP: Repository 추상화에 의존
 *
 * 목적:
 * - products 테이블 전체 조회
 * - brand_id → brand name 매핑
 * - platform_id 매핑
 * - JSONL 로그 파일 생성
 *
 * 설계:
 * - Resume 없음 (항상 새로 시작)
 * - start → 처음부터, stop → 그냥 종료
 */

import * as fs from "fs";
import * as path from "path";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  createSuccessResult,
  createErrorResult,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { SupabaseProductsRepository } from "@/repositories/SupabaseProductsRepository";
import { SupabaseBrandRepository } from "@/repositories/SupabaseBrandRepository";
import { SupabasePlatformRepository } from "@/repositories/SupabasePlatformRepository";
import {
  DailySyncInitInput,
  DailySyncInitOutput,
  DailySyncProduct,
  DailySyncMetaRecord,
} from "./types";

/**
 * 지원 플랫폼 목록
 */
const SUPPORTED_PLATFORMS = [
  "oliveyoung",
  "hwahae",
  "zigzag",
  "musinsa",
  "ably",
  "kurly",
] as const;

/**
 * DailySyncInitNode - Daily Sync 초기화 노드
 */
export class DailySyncInitNode implements ITypedNodeStrategy<
  DailySyncInitInput,
  DailySyncInitOutput
> {
  public readonly type = "daily_sync_init";
  public readonly name = "DailySyncInitNode";

  private productsRepository: SupabaseProductsRepository;
  private brandRepository: SupabaseBrandRepository;
  private platformRepository: SupabasePlatformRepository;

  constructor() {
    this.productsRepository = new SupabaseProductsRepository();
    this.brandRepository = new SupabaseBrandRepository();
    this.platformRepository = new SupabasePlatformRepository();
  }

  /**
   * 노드 실행
   */
  async execute(
    input: DailySyncInitInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<DailySyncInitOutput>> {
    const { logger, config } = context;
    const startedAt = new Date().toISOString();

    logger.info(
      {
        type: this.type,
        product_ids: input.product_ids,
        limit: input.limit,
        dry_run: input.dry_run,
      },
      "Daily Sync 초기화 시작",
    );

    try {
      // 1. Products 조회
      let products = await this.productsRepository.findAll();

      // 특정 product_id만 필터링 (테스트용)
      if (input.product_ids && input.product_ids.length > 0) {
        products = products.filter((p) =>
          input.product_ids!.includes(p.product_id),
        );
        logger.info(
          { filtered_count: products.length },
          "특정 product_id로 필터링",
        );
      }

      // limit 적용 (테스트용)
      if (input.limit && input.limit > 0 && products.length > input.limit) {
        products = products.slice(0, input.limit);
        logger.info({ limit: input.limit }, "limit 적용");
      }

      logger.info({ count: products.length }, "products 조회 완료");

      if (products.length === 0) {
        return createSuccessResult({
          products: [],
          total_products: 0,
          platform_id_map: {},
          job_log_file: "",
          started_at: startedAt,
        });
      }

      // 2. Brand 매핑
      const brandIds = [...new Set(products.map((p) => p.brand_id))];
      const brandMap = await this.brandRepository.getNamesByIds(brandIds);
      logger.info({ brand_count: brandMap.size }, "brand 매핑 완료");

      // 3. Platform ID 매핑
      const platformIdMap = await this.platformRepository.findIdsByNames([
        ...SUPPORTED_PLATFORMS,
      ]);
      logger.info(
        { platform_count: platformIdMap.size },
        "platform_id 매핑 완료",
      );

      // 4. Products에 brand_name 추가
      const productsWithBrand: DailySyncProduct[] = products.map((p) => ({
        product_id: p.product_id,
        name: p.name,
        brand_id: p.brand_id,
        brand_name: brandMap.get(p.brand_id),
      }));

      // 5. JSONL 파일 준비 (경로: results/YYYY-MM-DD/)
      const baseOutputDir = (config.output_dir as string) || "/app/results";
      const dateDir = this.getLocalDateString();
      const outputDir = path.join(baseOutputDir, dateDir);
      const jobLogFile = this.createJobLogFile(outputDir, context.job_id);

      // 디렉토리 생성
      this.ensureDirectory(outputDir);

      // 6. 새 파일: header 메타 레코드 작성
      const header: DailySyncMetaRecord = {
        _meta: true,
        type: "header",
        job_id: context.job_id,
        workflow_id: context.workflow_id,
        total_products: products.length,
        started_at: startedAt,
      };
      fs.writeFileSync(jobLogFile, JSON.stringify(header) + "\n", "utf-8");
      logger.info(
        { job_log_file: jobLogFile },
        "JSONL 파일 생성 (header 포함)",
      );

      const output: DailySyncInitOutput = {
        products: productsWithBrand,
        total_products: products.length,
        platform_id_map: Object.fromEntries(platformIdMap),
        job_log_file: jobLogFile,
        started_at: startedAt,
        dry_run: input.dry_run,
      };

      logger.info(
        {
          type: this.type,
          total_products: output.total_products,
        },
        "Daily Sync 초기화 완료",
      );

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { type: this.type, error: message },
        "Daily Sync 초기화 실패",
      );
      return createErrorResult(message, "INIT_FAILED");
    }
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
   * JSONL 파일 경로 생성
   * 파일명: job_daily_sync_{job_id}.jsonl
   */
  private createJobLogFile(outputDir: string, jobId: string): string {
    return path.join(outputDir, `job_daily_sync_${jobId}.jsonl`);
  }

  /**
   * 디렉토리 생성 (없으면)
   */
  private ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

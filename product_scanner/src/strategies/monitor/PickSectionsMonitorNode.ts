/**
 * PickSectionsMonitorNode - Pick Sections 모니터링 노드
 *
 * SOLID 원칙:
 * - SRP: Pick Sections 상품 접근성 모니터링만 담당
 * - OCP: PlatformScannerRegistry를 통한 플랫폼 확장
 * - DIP: ITypedNodeStrategy 인터페이스 구현
 *
 * 동작 흐름:
 * 1. pick_sections 테이블에서 모든 content 조회
 * 2. upper/lower 섹션의 모든 product_set_id 평탄화
 * 3. 각 product_set_id로 상품 fetch
 * 4. fetch 실패 항목 수집 (섹션, 키워드, product_id 포함)
 * 5. ALERT_SLACK_CHANNEL_ID로 결과 알림
 */

import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  IValidationResult,
  createSuccessResult,
  createErrorResult,
  validationSuccess,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { IProductSearchService } from "@/core/interfaces/IProductSearchService";
import { ProductSearchService } from "@/services/ProductSearchService";
import {
  PickSectionsRepository,
  PickSectionProductSet,
} from "@/repositories/PickSectionsRepository";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { PlatformScannerRegistry } from "@/scanners/platform/PlatformScannerRegistry";
import { BrowserScanExecutor } from "@/scanners/base/BrowserScanExecutor";
import { applyAlertFilter, isNoFilterTimeWindow } from "@/utils/AlertFilter";
import { MonitorResultWriter } from "@/utils/MonitorResultWriter";

/**
 * 노드 입력 타입
 */
export interface PickSectionsMonitorInput {
  /** 디버그 모드 (기본: true - 성공 시에도 알림) */
  debug_mode?: boolean;
}

/**
 * 노드 출력 타입
 */
export interface PickSectionsMonitorOutput {
  /** 검사한 product_set 수 */
  total_product_sets: number;
  /** 성공 수 */
  success_count: number;
  /** 실패 수 */
  failed_count: number;
  /** 실패 항목 목록 */
  failed_items: FailedPickSectionItem[];
  /** 알림 발송 여부 */
  notified: boolean;
  /** JSONL 결과 파일 경로 */
  jsonl_path?: string;
}

/**
 * 실패 항목 정보
 */
export interface FailedPickSectionItem {
  /** 섹션 위치 (upper/lower) */
  section: "upper" | "lower";
  /** 섹션 키워드 */
  keyword: string;
  /** 원본 product_id */
  product_id: string;
  /** 실패한 product_set_id */
  product_set_id: string;
  /** 상품 링크 URL */
  link_url?: string;
  /** 에러 메시지 */
  error?: string;
}

/**
 * Slack 메시지 Block 타입
 */
interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
}

/**
 * Slack API URL
 */
const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

/**
 * PickSectionsMonitorNode
 */
export class PickSectionsMonitorNode implements ITypedNodeStrategy<
  PickSectionsMonitorInput,
  PickSectionsMonitorOutput
> {
  public readonly type = "pick_sections_monitor";
  public readonly name = "PickSectionsMonitorNode";

  private readonly pickSectionsRepository: PickSectionsRepository;
  private readonly productService: IProductSearchService;
  private readonly scanExecutor: BrowserScanExecutor;

  constructor(
    pickSectionsRepository?: PickSectionsRepository,
    productService?: IProductSearchService,
  ) {
    this.pickSectionsRepository =
      pickSectionsRepository ?? new PickSectionsRepository();
    this.productService = productService ?? new ProductSearchService();
    this.scanExecutor = new BrowserScanExecutor();
  }

  /**
   * 노드 실행
   */
  async execute(
    input: PickSectionsMonitorInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<PickSectionsMonitorOutput>> {
    const { logger, job_id, workflow_id } = context;
    const debugMode = input.debug_mode ?? true;

    logger.info(
      { type: this.type, job_id, workflow_id, debugMode },
      "[PickSectionsMonitorNode] 모니터링 시작",
    );

    // JSONL 스트리밍 Writer 초기화
    const resultWriter = new MonitorResultWriter({
      monitorType: this.type,
      jobId: job_id,
      workflowId: workflow_id,
    });

    try {
      // 1. Writer 초기화 (헤더 작성)
      await resultWriter.initialize();

      // 2. 모든 product_set 조회 (평탄화)
      const productSets =
        await this.pickSectionsRepository.findAllProductSets();

      if (productSets.length === 0) {
        // 로그 출력: 문제 없음 (터미널 + 파일)
        logger.info(
          { important: true, monitor: this.type, status: "success" },
          "✅ [PickSectionsMonitor] 검사할 product_set 없음 - 문제 없음",
        );

        // Writer 종료 (푸터 작성)
        const { filePath } = await resultWriter.finalize(false);

        return createSuccessResult({
          total_product_sets: 0,
          success_count: 0,
          failed_count: 0,
          failed_items: [],
          notified: false,
          jsonl_path: filePath,
        });
      }

      logger.info(
        { count: productSets.length },
        "[PickSectionsMonitorNode] product_set 조회 완료",
      );

      // 3. 각 product_set 스캔 (스트리밍 저장)
      const failedItems: FailedPickSectionItem[] = [];

      for (const ps of productSets) {
        const result = await this.scanProductSet(ps, logger);

        // 즉시 JSONL에 append
        await resultWriter.append({
          product_set_id: ps.product_set_id,
          valid: result.success,
          error: result.error,
          link_url: result.link_url,
          metadata: {
            section: ps.section,
            keyword: ps.keyword,
            product_id: ps.product_id,
          },
        });

        if (!result.success) {
          failedItems.push({
            section: ps.section,
            keyword: ps.keyword,
            product_id: ps.product_id,
            product_set_id: ps.product_set_id,
            link_url: result.link_url,
            error: result.error,
          });
        }
      }

      const summary = resultWriter.getSummary();
      logger.info(
        {
          total: summary.total,
          valid: summary.valid,
          invalid: summary.invalid,
        },
        "[PickSectionsMonitorNode] 스캔 완료",
      );

      // 4. Alert 필터링 (플랫폼 기반)
      const filterResult = applyAlertFilter(
        failedItems,
        (item) => item.link_url,
      );
      const filteredFailedItems = filterResult.filteredItems;

      if (filterResult.wasFiltered && filterResult.excludedCount > 0) {
        logger.info(
          {
            original: failedItems.length,
            filtered: filteredFailedItems.length,
            excluded: filterResult.excludedCount,
            isNoFilterWindow: isNoFilterTimeWindow(),
          },
          "[PickSectionsMonitorNode] 플랫폼 필터링 적용",
        );
      }

      // 5. 상태 판정 및 Slack 알림
      const hasProblems = filteredFailedItems.length > 0;

      if (hasProblems) {
        logger.info(
          {
            important: true,
            monitor: this.type,
            status: "failed",
            total: summary.total,
            invalid: filteredFailedItems.length,
          },
          `🚨 [PickSectionsMonitor] 문제 발견 - ${filteredFailedItems.length}건 실패`,
        );
        await this.sendAlert(filteredFailedItems, summary.total, logger);
      } else {
        logger.info(
          {
            important: true,
            monitor: this.type,
            status: "success",
            total: summary.total,
            valid: summary.valid,
          },
          `✅ [PickSectionsMonitor] 문제 없음 - 전체 ${summary.total}건 정상`,
        );
      }

      // 6. Writer 종료 (푸터 작성)
      const { filePath } = await resultWriter.finalize(hasProblems);

      // 7. 결과 반환
      const output: PickSectionsMonitorOutput = {
        total_product_sets: summary.total,
        success_count: summary.valid,
        failed_count: summary.invalid,
        failed_items: failedItems,
        notified: hasProblems,
        jsonl_path: filePath,
      };

      logger.info(
        { type: this.type, jsonl_path: filePath },
        "[PickSectionsMonitorNode] 모니터링 완료",
      );

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { type: this.type, error: message },
        "[PickSectionsMonitorNode] 모니터링 실패",
      );

      // Writer 정리
      await resultWriter.cleanup();

      return createErrorResult<PickSectionsMonitorOutput>(
        message,
        "MONITOR_FAILED",
      );
    } finally {
      // BrowserScanExecutor 정리
      await this.scanExecutor.cleanup();
    }
  }

  /**
   * 입력 검증 (항상 성공)
   */
  validate(_input: PickSectionsMonitorInput): IValidationResult {
    return validationSuccess();
  }

  /**
   * 롤백
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info({ type: this.type }, "Rollback - cleanup");
    await this.scanExecutor.cleanup();
  }

  /**
   * 단일 product_set 스캔
   */
  private async scanProductSet(
    ps: PickSectionProductSet,
    logger: INodeContext["logger"],
  ): Promise<{ success: boolean; error?: string; link_url?: string }> {
    const { section, keyword, product_id, product_set_id } = ps;

    try {
      // 1. Supabase에서 상품 정보 조회
      const productSet =
        await this.productService.getProductById(product_set_id);

      if (!productSet) {
        logger.warn(
          { section, keyword, product_id, product_set_id },
          "상품을 찾을 수 없음",
        );
        return { success: false, error: "Product not found in DB" };
      }

      // 2. link_url 확인
      const linkUrl = productSet.link_url;
      if (!linkUrl) {
        logger.warn(
          { section, keyword, product_id, product_set_id },
          "link_url 없음",
        );
        return { success: false, error: "link_url missing" };
      }

      // 3. 플랫폼 감지
      const detection = PlatformDetector.detect(linkUrl);
      if (!detection.platform || !detection.productId) {
        logger.warn(
          { section, keyword, product_set_id, linkUrl },
          "플랫폼 감지 실패",
        );
        return {
          success: false,
          error: "Platform detection failed",
          link_url: linkUrl,
        };
      }

      // 4. Scanner로 fetch
      const registry = PlatformScannerRegistry.getInstance();
      const scanner = registry.get(detection.platform);

      if (!scanner) {
        logger.warn(
          { section, keyword, platform: detection.platform },
          "Scanner 없음",
        );
        return {
          success: false,
          error: `Scanner not found: ${detection.platform}`,
          link_url: linkUrl,
        };
      }

      const scanResult = await this.scanExecutor.execute(
        scanner,
        detection.platform,
        linkUrl,
      );

      // 5. 결과 확인: null 또는 에러 = 실패
      if (scanResult.isNotFound || !scanResult.data) {
        logger.warn(
          {
            section,
            keyword,
            product_set_id,
            platform: detection.platform,
          },
          "Fetch 실패 (null/not_found)",
        );
        return {
          success: false,
          error: "Fetch failed (null or not_found)",
          link_url: linkUrl,
        };
      }

      // 성공
      logger.debug(
        {
          section,
          keyword,
          product_set_id,
          productName: scanResult.data.product_name,
        },
        "스캔 성공",
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { section, keyword, product_id, product_set_id, error: message },
        "스캔 중 에러 발생",
      );
      return { success: false, error: message };
    }
  }

  /**
   * Slack Alert 발송
   */
  private async sendAlert(
    failedItems: FailedPickSectionItem[],
    totalProductSets: number,
    logger: INodeContext["logger"],
  ): Promise<boolean> {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const alertChannelId = process.env.ALERT_SLACK_CHANNEL_ID;

    if (!slackToken || !alertChannelId) {
      logger.warn("SLACK_BOT_TOKEN 또는 ALERT_SLACK_CHANNEL_ID 미설정");
      return false;
    }

    const message = this.buildAlertMessage(failedItems, totalProductSets);

    try {
      const response = await fetch(SLACK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${slackToken}`,
        },
        body: JSON.stringify({
          channel: alertChannelId,
          ...message,
        }),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, "Slack API 응답 오류");
        return false;
      }

      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        logger.warn({ error: result.error }, "Slack API 에러");
        return false;
      }

      logger.info("Alert 발송 완료");
      return true;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Alert 발송 실패",
      );
      return false;
    }
  }

  /**
   * Alert 메시지 빌드
   */
  private buildAlertMessage(
    failedItems: FailedPickSectionItem[],
    totalProductSets: number,
  ): { blocks: SlackBlock[] } {
    // 실패 없음: 성공 메시지
    if (failedItems.length === 0) {
      return {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ Pick Sections 모니터링 완료 - 문제 없음 (${totalProductSets}개 검사)`,
            },
          },
        ],
      };
    }

    // 실패 있음: Alert 메시지
    const lines: string[] = [];
    lines.push(`🚨 Pick Sections Alert - ${failedItems.length}건 실패`);
    lines.push("─────────────────────");

    for (const item of failedItems) {
      lines.push(`• section: ${item.section}`);
      lines.push(`• keyword: ${item.keyword}`);
      lines.push(`• product_set_id: ${item.product_set_id}`);
      if (item.link_url) {
        lines.push(`• link_url: ${item.link_url}`);
      }
      if (item.error) {
        lines.push(`• error: ${item.error}`);
      }
      lines.push(""); // 빈 줄 구분
    }

    lines.push("─────────────────────");

    return {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: lines.join("\n"),
          },
        },
      ],
    };
  }
}

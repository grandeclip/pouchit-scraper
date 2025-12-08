/**
 * CollaboBannerMonitorNode - Collabo Banner 모니터링 노드
 *
 * SOLID 원칙:
 * - SRP: Collabo Banner 상품 접근성 모니터링만 담당
 * - OCP: PlatformScannerRegistry를 통한 플랫폼 확장
 * - DIP: ITypedNodeStrategy 인터페이스 구현
 *
 * 동작 흐름:
 * 1. collabo_banners 테이블에서 활성 배너 조회
 *    - is_active = true
 *    - start_date <= now() <= end_date
 * 2. 각 배너의 product_set_id로 상품 fetch
 * 3. fetch 실패 항목 수집
 * 4. ALERT_SLACK_CHANNEL_ID로 결과 알림
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
  CollaboBannerRepository,
  ActiveCollaboBanner,
} from "@/repositories/CollaboBannerRepository";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { PlatformScannerRegistry } from "@/scanners/platform/PlatformScannerRegistry";
import { BrowserScanExecutor } from "@/scanners/base/BrowserScanExecutor";
import { applyAlertFilter, isNoFilterTimeWindow } from "@/utils/AlertFilter";
import { MonitorResultWriter } from "@/utils/MonitorResultWriter";

/**
 * 노드 입력 타입
 */
export interface CollaboBannerMonitorInput {
  /** 디버그 모드 (기본: true - 성공 시에도 알림) */
  debug_mode?: boolean;
}

/**
 * 노드 출력 타입
 */
export interface CollaboBannerMonitorOutput {
  /** 검사한 배너 수 */
  total_banners: number;
  /** 성공 수 */
  success_count: number;
  /** 실패 수 */
  failed_count: number;
  /** 실패 항목 목록 */
  failed_items: FailedBannerItem[];
  /** 알림 발송 여부 */
  notified: boolean;
  /** JSONL 결과 파일 경로 */
  jsonl_path?: string;
}

/**
 * 실패 항목 정보
 */
export interface FailedBannerItem {
  /** collabo_banners 테이블의 id */
  banner_id: number;
  /** product_set_id */
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
 * CollaboBannerMonitorNode
 */
export class CollaboBannerMonitorNode implements ITypedNodeStrategy<
  CollaboBannerMonitorInput,
  CollaboBannerMonitorOutput
> {
  public readonly type = "collabo_banner_monitor";
  public readonly name = "CollaboBannerMonitorNode";

  private readonly bannerRepository: CollaboBannerRepository;
  private readonly productService: IProductSearchService;
  private readonly scanExecutor: BrowserScanExecutor;

  constructor(
    bannerRepository?: CollaboBannerRepository,
    productService?: IProductSearchService,
  ) {
    this.bannerRepository = bannerRepository ?? new CollaboBannerRepository();
    this.productService = productService ?? new ProductSearchService();
    this.scanExecutor = new BrowserScanExecutor();
  }

  /**
   * 노드 실행
   */
  async execute(
    input: CollaboBannerMonitorInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<CollaboBannerMonitorOutput>> {
    const { logger, job_id, workflow_id } = context;
    const debugMode = input.debug_mode ?? true;

    logger.info(
      { type: this.type, job_id, workflow_id, debugMode },
      "[CollaboBannerMonitorNode] 모니터링 시작",
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

      // 2. 활성 배너 조회
      const activeBanners = await this.bannerRepository.findActiveBanners();

      if (activeBanners.length === 0) {
        // 로그 출력: 문제 없음 (터미널 + 파일)
        logger.info(
          { important: true, monitor: this.type, status: "success" },
          "✅ [CollaboBannerMonitor] 활성 배너 없음 - 문제 없음",
        );

        // Writer 종료 (푸터 작성)
        const { filePath } = await resultWriter.finalize(false);

        return createSuccessResult({
          total_banners: 0,
          success_count: 0,
          failed_count: 0,
          failed_items: [],
          notified: false,
          jsonl_path: filePath,
        });
      }

      logger.info(
        { count: activeBanners.length },
        "[CollaboBannerMonitorNode] 활성 배너 조회 완료",
      );

      // 3. 각 배너의 상품 스캔 (스트리밍 저장)
      const failedItems: FailedBannerItem[] = [];

      for (const banner of activeBanners) {
        const result = await this.scanBanner(banner, logger);

        // 즉시 JSONL에 append
        await resultWriter.append({
          product_set_id: banner.product_set_id,
          valid: result.success,
          error: result.error,
          link_url: result.link_url,
          metadata: { banner_id: banner.id },
        });

        if (!result.success) {
          failedItems.push({
            banner_id: banner.id,
            product_set_id: banner.product_set_id,
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
        "[CollaboBannerMonitorNode] 스캔 완료",
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
          "[CollaboBannerMonitorNode] 플랫폼 필터링 적용",
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
          `🚨 [CollaboBannerMonitor] 문제 발견 - ${filteredFailedItems.length}건 실패`,
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
          `✅ [CollaboBannerMonitor] 문제 없음 - 전체 ${summary.total}건 정상`,
        );
      }

      // 6. Writer 종료 (푸터 작성)
      const { filePath } = await resultWriter.finalize(hasProblems);

      // 7. 결과 반환
      const output: CollaboBannerMonitorOutput = {
        total_banners: summary.total,
        success_count: summary.valid,
        failed_count: summary.invalid,
        failed_items: failedItems,
        notified: hasProblems,
        jsonl_path: filePath,
      };

      logger.info(
        { type: this.type, jsonl_path: filePath },
        "[CollaboBannerMonitorNode] 모니터링 완료",
      );

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { type: this.type, error: message },
        "[CollaboBannerMonitorNode] 모니터링 실패",
      );

      // Writer 정리
      await resultWriter.cleanup();

      return createErrorResult<CollaboBannerMonitorOutput>(
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
  validate(_input: CollaboBannerMonitorInput): IValidationResult {
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
   * 단일 배너 스캔
   */
  private async scanBanner(
    banner: ActiveCollaboBanner,
    logger: INodeContext["logger"],
  ): Promise<{ success: boolean; error?: string; link_url?: string }> {
    const { id, product_set_id } = banner;

    try {
      // 1. Supabase에서 상품 정보 조회
      const productSet =
        await this.productService.getProductById(product_set_id);

      if (!productSet) {
        logger.warn({ banner_id: id, product_set_id }, "상품을 찾을 수 없음");
        return { success: false, error: "Product not found in DB" };
      }

      // 2. link_url 확인
      const linkUrl = productSet.link_url;
      if (!linkUrl) {
        logger.warn({ banner_id: id, product_set_id }, "link_url 없음");
        return { success: false, error: "link_url missing" };
      }

      // 3. 플랫폼 감지
      const detection = PlatformDetector.detect(linkUrl);
      if (!detection.platform || !detection.productId) {
        logger.warn(
          { banner_id: id, product_set_id, linkUrl },
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
          { banner_id: id, platform: detection.platform },
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
          { banner_id: id, product_set_id, platform: detection.platform },
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
          banner_id: id,
          product_set_id,
          productName: scanResult.data.product_name,
        },
        "스캔 성공",
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { banner_id: id, product_set_id, error: message },
        "스캔 중 에러 발생",
      );
      return { success: false, error: message };
    }
  }

  /**
   * Slack Alert 발송
   */
  private async sendAlert(
    failedItems: FailedBannerItem[],
    totalBanners: number,
    logger: INodeContext["logger"],
  ): Promise<boolean> {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const alertChannelId = process.env.ALERT_SLACK_CHANNEL_ID;

    if (!slackToken || !alertChannelId) {
      logger.warn("SLACK_BOT_TOKEN 또는 ALERT_SLACK_CHANNEL_ID 미설정");
      return false;
    }

    const message = this.buildAlertMessage(failedItems, totalBanners);

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
    failedItems: FailedBannerItem[],
    totalBanners: number,
  ): { blocks: SlackBlock[] } {
    // 실패 없음: 성공 메시지
    if (failedItems.length === 0) {
      return {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "✅ Collabo Banner 모니터링 완료 - 문제 없음",
            },
          },
        ],
      };
    }

    // 실패 있음: Alert 메시지
    const lines: string[] = [];
    lines.push(`🚨 Collabo Banner Alert - ${failedItems.length}건 실패`);
    lines.push("─────────────────────");

    for (const item of failedItems) {
      lines.push(`• banner_id: ${item.banner_id}`);
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

/**
 * VotesMonitorNode - Votes 모니터링 노드
 *
 * SOLID 원칙:
 * - SRP: Votes 상품 접근성 모니터링만 담당
 * - OCP: PlatformScannerRegistry를 통한 플랫폼 확장
 * - DIP: ITypedNodeStrategy 인터페이스 구현
 *
 * 동작 흐름:
 * 1. votes 테이블에서 활성 투표 조회
 *    - start_date <= now() <= end_date
 * 2. 각 투표의 product_set_a, product_set_b로 상품 fetch
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
import { VotesRepository, ActiveVote } from "@/repositories/VotesRepository";
import { PlatformDetector } from "@/services/extract/url/PlatformDetector";
import { PlatformScannerRegistry } from "@/scanners/platform/PlatformScannerRegistry";
import { BrowserScanExecutor } from "@/scanners/base/BrowserScanExecutor";
import { applyAlertFilter, isNoFilterTimeWindow } from "@/utils/AlertFilter";

/**
 * 노드 입력 타입
 */
export interface VotesMonitorInput {
  /** 디버그 모드 (기본: true - 성공 시에도 알림) */
  debug_mode?: boolean;
}

/**
 * 노드 출력 타입
 */
export interface VotesMonitorOutput {
  /** 검사한 투표 수 */
  total_votes: number;
  /** 성공 수 (두 상품 모두 성공) */
  success_count: number;
  /** 실패 수 */
  failed_count: number;
  /** 실패 항목 목록 */
  failed_items: FailedVoteItem[];
  /** 알림 발송 여부 */
  notified: boolean;
}

/**
 * 실패 항목 정보
 */
export interface FailedVoteItem {
  /** votes 테이블의 id */
  vote_id: number;
  /** 실패한 product_set_id */
  product_set_id: string;
  /** A/B 구분 */
  side: "A" | "B";
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
 * VotesMonitorNode
 */
export class VotesMonitorNode implements ITypedNodeStrategy<
  VotesMonitorInput,
  VotesMonitorOutput
> {
  public readonly type = "votes_monitor";
  public readonly name = "VotesMonitorNode";

  private readonly votesRepository: VotesRepository;
  private readonly productService: IProductSearchService;
  private readonly scanExecutor: BrowserScanExecutor;

  constructor(
    votesRepository?: VotesRepository,
    productService?: IProductSearchService,
  ) {
    this.votesRepository = votesRepository ?? new VotesRepository();
    this.productService = productService ?? new ProductSearchService();
    this.scanExecutor = new BrowserScanExecutor();
  }

  /**
   * 노드 실행
   */
  async execute(
    input: VotesMonitorInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<VotesMonitorOutput>> {
    const { logger, job_id, workflow_id } = context;
    const debugMode = input.debug_mode ?? true;

    logger.info(
      { type: this.type, job_id, workflow_id, debugMode },
      "[VotesMonitorNode] 모니터링 시작",
    );

    try {
      // 1. 활성 투표 조회
      const activeVotes = await this.votesRepository.findActiveVotes();

      if (activeVotes.length === 0) {
        logger.info("[VotesMonitorNode] 활성 투표 없음");

        // 디버그 모드: 활성 투표 없음 알림
        if (debugMode) {
          await this.sendAlert([], 0, logger);
        }

        return createSuccessResult({
          total_votes: 0,
          success_count: 0,
          failed_count: 0,
          failed_items: [],
          notified: debugMode,
        });
      }

      logger.info(
        { count: activeVotes.length },
        "[VotesMonitorNode] 활성 투표 조회 완료",
      );

      // 2. 각 투표의 상품 스캔 (product_set_a, product_set_b 모두)
      const failedItems: FailedVoteItem[] = [];
      let successCount = 0;

      for (const vote of activeVotes) {
        const results = await this.scanVote(vote, logger);

        // 둘 다 성공해야 성공
        if (results.failedItems.length === 0) {
          successCount++;
        } else {
          failedItems.push(...results.failedItems);
        }
      }

      logger.info(
        {
          total: activeVotes.length,
          success: successCount,
          failed: failedItems.length,
        },
        "[VotesMonitorNode] 스캔 완료",
      );

      // 3. Alert 필터링 (플랫폼 기반)
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
          "[VotesMonitorNode] 플랫폼 필터링 적용",
        );
      }

      // 4. Alert 발송
      const shouldNotify = debugMode || filteredFailedItems.length > 0;
      if (shouldNotify) {
        await this.sendAlert(filteredFailedItems, activeVotes.length, logger);
      }

      // 5. 결과 반환
      const output: VotesMonitorOutput = {
        total_votes: activeVotes.length,
        success_count: successCount,
        failed_count: failedItems.length, // 원본 실패 수
        failed_items: failedItems, // 원본 실패 항목 (로깅용)
        notified: shouldNotify,
      };

      logger.info(
        { type: this.type, output },
        "[VotesMonitorNode] 모니터링 완료",
      );

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        { type: this.type, error: message },
        "[VotesMonitorNode] 모니터링 실패",
      );

      return createErrorResult<VotesMonitorOutput>(message, "MONITOR_FAILED");
    } finally {
      // BrowserScanExecutor 정리
      await this.scanExecutor.cleanup();
    }
  }

  /**
   * 입력 검증 (항상 성공)
   */
  validate(_input: VotesMonitorInput): IValidationResult {
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
   * 단일 투표 스캔 (A, B 모두 검사)
   */
  private async scanVote(
    vote: ActiveVote,
    logger: INodeContext["logger"],
  ): Promise<{ failedItems: FailedVoteItem[] }> {
    const { id, product_set_a, product_set_b } = vote;
    const failedItems: FailedVoteItem[] = [];

    // A 스캔
    const resultA = await this.scanProductSet(id, product_set_a, "A", logger);
    if (!resultA.success) {
      failedItems.push({
        vote_id: id,
        product_set_id: product_set_a,
        side: "A",
        link_url: resultA.link_url,
        error: resultA.error,
      });
    }

    // B 스캔
    const resultB = await this.scanProductSet(id, product_set_b, "B", logger);
    if (!resultB.success) {
      failedItems.push({
        vote_id: id,
        product_set_id: product_set_b,
        side: "B",
        link_url: resultB.link_url,
        error: resultB.error,
      });
    }

    return { failedItems };
  }

  /**
   * 단일 상품 세트 스캔
   */
  private async scanProductSet(
    voteId: number,
    productSetId: string,
    side: "A" | "B",
    logger: INodeContext["logger"],
  ): Promise<{ success: boolean; error?: string; link_url?: string }> {
    try {
      // 1. Supabase에서 상품 정보 조회
      const productSet = await this.productService.getProductById(productSetId);

      if (!productSet) {
        logger.warn(
          { vote_id: voteId, product_set_id: productSetId, side },
          "상품을 찾을 수 없음",
        );
        return { success: false, error: "Product not found in DB" };
      }

      // 2. link_url 확인
      const linkUrl = productSet.link_url;
      if (!linkUrl) {
        logger.warn(
          { vote_id: voteId, product_set_id: productSetId, side },
          "link_url 없음",
        );
        return { success: false, error: "link_url missing" };
      }

      // 3. 플랫폼 감지
      const detection = PlatformDetector.detect(linkUrl);
      if (!detection.platform || !detection.productId) {
        logger.warn(
          { vote_id: voteId, product_set_id: productSetId, side, linkUrl },
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
          { vote_id: voteId, platform: detection.platform, side },
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
            vote_id: voteId,
            product_set_id: productSetId,
            side,
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
          vote_id: voteId,
          product_set_id: productSetId,
          side,
          productName: scanResult.data.product_name,
        },
        "스캔 성공",
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { vote_id: voteId, product_set_id: productSetId, side, error: message },
        "스캔 중 에러 발생",
      );
      return { success: false, error: message };
    }
  }

  /**
   * Slack Alert 발송
   */
  private async sendAlert(
    failedItems: FailedVoteItem[],
    totalVotes: number,
    logger: INodeContext["logger"],
  ): Promise<boolean> {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const alertChannelId = process.env.ALERT_SLACK_CHANNEL_ID;

    if (!slackToken || !alertChannelId) {
      logger.warn("SLACK_BOT_TOKEN 또는 ALERT_SLACK_CHANNEL_ID 미설정");
      return false;
    }

    const message = this.buildAlertMessage(failedItems, totalVotes);

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
    failedItems: FailedVoteItem[],
    totalVotes: number,
  ): { blocks: SlackBlock[] } {
    // 실패 없음: 성공 메시지
    if (failedItems.length === 0) {
      return {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "✅ Votes 모니터링 완료 - 문제 없음",
            },
          },
        ],
      };
    }

    // 실패 있음: Alert 메시지
    const lines: string[] = [];
    lines.push(`🚨 Votes Alert - ${failedItems.length}건 실패`);
    lines.push("─────────────────────");

    for (const item of failedItems) {
      lines.push(`• vote_id: ${item.vote_id}`);
      lines.push(`• product_set_id: ${item.product_set_id} (${item.side})`);
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

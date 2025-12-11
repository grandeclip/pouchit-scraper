/**
 * DailySyncNotifyNode - Daily Sync 완료 알림 노드
 *
 * SOLID 원칙:
 * - SRP: JSONL 집계 및 Slack 알림만 담당
 * - OCP: 알림 채널 확장 가능 (Slack, Email 등)
 *
 * 목적:
 * - JSONL 파일에서 처리 결과 집계
 * - Slack 알림 발송 (시작/완료)
 */

import * as fs from "fs";
import {
  ITypedNodeStrategy,
  ITypedNodeResult,
  createSuccessResult,
  createErrorResult,
} from "@/core/interfaces/ITypedNodeStrategy";
import { INodeContext } from "@/core/interfaces/INodeContext";
import {
  DailySyncNotifyInput,
  DailySyncNotifyOutput,
  DailySyncSummary,
  DailySyncMetaRecord,
} from "./types";

/**
 * Slack API URL
 */
const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

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
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Slack API 응답 타입
 */
interface SlackApiResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

/**
 * DailySyncNotifyNode - Daily Sync 완료 알림 노드
 */
export class DailySyncNotifyNode implements ITypedNodeStrategy<
  DailySyncNotifyInput,
  DailySyncNotifyOutput
> {
  public readonly type = "daily_sync_notify";
  public readonly name = "DailySyncNotifyNode";

  private readonly REQUEST_TIMEOUT_MS = 10000;

  /**
   * 노드 실행
   */
  async execute(
    input: DailySyncNotifyInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<DailySyncNotifyOutput>> {
    const { logger, config } = context;
    const slackEnabled = (config.slack_enabled as boolean) ?? true;

    logger.info(
      {
        type: this.type,
        job_log_file: input.job_log_file,
        slack_enabled: slackEnabled,
      },
      "알림 노드 시작",
    );

    try {
      // 1. JSONL 파일에서 결과 집계
      const summary = this.aggregateResults(
        input.job_log_file,
        input.total_products,
        input.started_at,
      );

      // 2. JSONL 파일에 footer 메타 레코드 추가
      this.writeFooter(input.job_log_file, summary, logger);

      logger.info(
        {
          type: this.type,
          summary: {
            total: summary.total_products,
            processed: summary.processed_count,
            success: summary.success_count,
            skipped: summary.skipped_count,
            failed: summary.failed_count,
            new_product_sets: summary.new_product_sets_count,
            enqueued_jobs: summary.enqueued_jobs_count,
            duration_ms: summary.duration_ms,
          },
        },
        "JSONL 집계 완료 (footer 추가)",
      );

      // 3. Slack 알림 발송
      let notified = false;
      const channels: string[] = [];

      if (slackEnabled) {
        const slackSuccess = await this.sendSlackNotification(
          summary,
          input.job_id || context.job_id,
          input.workflow_id || context.workflow_id,
          logger,
        );

        if (slackSuccess) {
          channels.push("slack");
          notified = true;
        }
      }

      const output: DailySyncNotifyOutput = {
        notified,
        channels: channels.length > 0 ? channels : undefined,
        summary,
      };

      logger.info(
        {
          type: this.type,
          notified,
          channels,
        },
        "알림 발송 완료",
      );

      return createSuccessResult(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ type: this.type, error: message }, "알림 발송 실패");

      // 알림 실패는 워크플로우 실패로 처리하지 않음
      return createSuccessResult({
        notified: false,
        error: message,
        summary: {
          total_products: input.total_products,
          processed_count: 0,
          success_count: 0,
          skipped_count: 0,
          failed_count: 0,
          new_product_sets_count: 0,
          enqueued_jobs_count: 0,
          duration_ms: 0,
          errors: [],
        },
      });
    }
  }

  /**
   * JSONL 파일에서 결과 집계
   * _meta 레코드는 건너뜀
   */
  private aggregateResults(
    filePath: string,
    totalProducts: number,
    startedAt: string,
  ): DailySyncSummary {
    const summary: DailySyncSummary = {
      total_products: totalProducts,
      processed_count: 0,
      success_count: 0,
      skipped_count: 0,
      failed_count: 0,
      new_product_sets_count: 0,
      enqueued_jobs_count: 0,
      duration_ms: 0,
      errors: [],
    };

    if (!fs.existsSync(filePath)) {
      return summary;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const record = JSON.parse(line);

          // _meta 레코드는 건너뜀
          if (record._meta) {
            continue;
          }

          summary.processed_count++;

          switch (record.status) {
            case "success":
              summary.success_count++;
              summary.new_product_sets_count += record.inserted_count ?? 0;
              summary.enqueued_jobs_count += record.enqueued_count ?? 0;
              break;
            case "skipped":
              summary.skipped_count++;
              break;
            case "failed":
              summary.failed_count++;
              if (record.error && summary.errors.length < 10) {
                summary.errors.push({
                  product_id: record.product_id,
                  error: record.error,
                });
              }
              break;
          }
        } catch {
          // 파싱 실패한 라인은 무시
        }
      }

      // 소요 시간 계산
      const startTime = new Date(startedAt).getTime();
      const endTime = Date.now();
      summary.duration_ms = endTime - startTime;
    } catch {
      // 파일 읽기 실패 시 기본값 반환
    }

    return summary;
  }

  /**
   * JSONL 파일에 footer 메타 레코드 추가
   */
  private writeFooter(
    filePath: string,
    summary: DailySyncSummary,
    logger: INodeContext["logger"],
  ): void {
    try {
      const footer: DailySyncMetaRecord = {
        _meta: true,
        type: "footer",
        completed_at: new Date().toISOString(),
        summary,
      };
      fs.appendFileSync(filePath, JSON.stringify(footer) + "\n", "utf-8");
      logger.debug({ filePath }, "JSONL footer 작성 완료");
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "JSONL footer 작성 실패",
      );
    }
  }

  /**
   * Slack 알림 발송
   */
  private async sendSlackNotification(
    summary: DailySyncSummary,
    jobId: string,
    workflowId: string,
    logger: INodeContext["logger"],
  ): Promise<boolean> {
    const slackToken = process.env.SLACK_BOT_TOKEN;
    const channelId =
      process.env.ALERT_SLACK_CHANNEL_ID || process.env.SLACK_CHANNEL_ID;

    if (!slackToken || !channelId) {
      logger.warn("SLACK_BOT_TOKEN 또는 SLACK_CHANNEL_ID 미설정 - 알림 스킵");
      return false;
    }

    const message = this.buildSlackMessage(summary, jobId, workflowId);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(SLACK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${slackToken}`,
        },
        body: JSON.stringify({
          channel: channelId,
          ...message,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn(
          { status: response.status, statusText: response.statusText },
          "Slack API 응답 오류",
        );
        return false;
      }

      const slackResponse = (await response.json()) as SlackApiResponse;
      if (!slackResponse.ok) {
        logger.warn({ error: slackResponse.error }, "Slack API 에러");
        return false;
      }

      logger.info("Slack 알림 발송 완료");
      return true;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Slack 알림 발송 실패",
      );
      return false;
    }
  }

  /**
   * Slack 메시지 빌드
   */
  private buildSlackMessage(
    summary: DailySyncSummary,
    jobId: string,
    workflowId: string,
  ): { blocks: SlackBlock[] } {
    const emoji = summary.failed_count > 0 ? "⚠️" : "✅";
    const durationMin = Math.floor(summary.duration_ms / 60000);
    const durationSec = Math.floor((summary.duration_ms % 60000) / 1000);
    const durationStr = `${durationMin}분 ${durationSec}초`;

    const lines: string[] = [];
    lines.push(`• Job ID: \`${jobId}\``);
    lines.push(`• Workflow: \`${workflowId}\``);
    lines.push(`• 소요 시간: ${durationStr}`);
    lines.push("");
    lines.push(
      `• 총 상품: *${summary.total_products}*개 → 처리: *${summary.processed_count}*개`,
    );
    lines.push(
      `• 성공: *${summary.success_count}*개 | 스킵: *${summary.skipped_count}*개 | 실패: *${summary.failed_count}*개`,
    );
    lines.push(
      `• 신규 ProductSet: *${summary.new_product_sets_count}*개 | Enqueued Jobs: *${summary.enqueued_jobs_count}*개`,
    );

    // 에러가 있으면 추가
    if (summary.errors.length > 0) {
      lines.push("");
      lines.push("*에러 목록 (최대 10개):*");
      for (const err of summary.errors) {
        lines.push(`  • \`${err.product_id}\`: ${err.error}`);
      }
    }

    const blocks: SlackBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *Daily Sync 완료*\n\n${lines.join("\n")}`,
        },
      },
    ];

    return { blocks };
  }
}

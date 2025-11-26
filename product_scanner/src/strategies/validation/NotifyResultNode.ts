/**
 * NotifyResultNode - Phase 4 Typed Node Strategy
 *
 * SOLID 원칙:
 * - SRP: 결과 알림 발송만 담당
 * - OCP: 알림 채널 기반 확장 가능 (Slack, Email, Discord 등)
 * - DIP: ITypedNodeStrategy, INotificationChannel 인터페이스에 의존
 *
 * 목적:
 * - SaveResultNode 결과를 다양한 채널로 알림 발송
 * - Slack Webhook 연동
 * - 확장 가능한 알림 채널 구조
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
import { getTimestampWithTimezone } from "@/utils/timestamp";
import {
  NotifyResultInput,
  NotifyResultOutput,
  SaveResultOutput,
} from "./types";

/**
 * 알림 채널 인터페이스 (확장용)
 */
export interface INotificationChannel {
  readonly name: string;
  send(message: NotificationMessage): Promise<boolean>;
  isEnabled(): boolean;
}

/**
 * 알림 메시지 구조
 */
export interface NotificationMessage {
  title: string;
  summary: SaveResultOutput["summary"];
  platform: string;
  job_id: string;
  workflow_id: string;
  jsonl_path?: string;
  timestamp: string;
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
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * NotifyResultNode 설정
 */
export interface NotifyResultNodeConfig {
  /** Slack Webhook URL */
  slack_webhook_url?: string;

  /** Slack 알림 활성화 */
  enable_slack: boolean;

  /** 실패 시에만 알림 */
  notify_on_failure_only: boolean;

  /** 불일치 임계값 (이 비율 초과 시 경고) */
  mismatch_threshold_percent: number;

  /** 요청 타임아웃 (ms) */
  request_timeout_ms: number;
}

/**
 * 상태 이모지 임계값
 */
const EMOJI_THRESHOLDS = {
  /** 실패율 이 값 초과 시 🚨 표시 */
  CRITICAL_FAILURE_RATE: 10,
  /** 일치율 100%일 때 ✅ 표시 */
  PERFECT_MATCH_RATE: 100,
  /** 일치율 이 값 이상일 때 👍 표시 */
  GOOD_MATCH_RATE: 90,
} as const;

/**
 * 기본 설정
 */
const DEFAULT_CONFIG: NotifyResultNodeConfig = {
  slack_webhook_url: process.env.SLACK_WEBHOOK_URL,
  enable_slack: true,
  notify_on_failure_only: false,
  mismatch_threshold_percent: 10,
  request_timeout_ms: 10000,
};

/**
 * NotifyResultNode - 결과 알림 노드
 */
export class NotifyResultNode
  implements ITypedNodeStrategy<NotifyResultInput, NotifyResultOutput>
{
  public readonly type = "notify_result";
  public readonly name = "NotifyResultNode";

  private readonly nodeConfig: NotifyResultNodeConfig;

  constructor(config?: Partial<NotifyResultNodeConfig>) {
    this.nodeConfig = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 노드 실행
   */
  async execute(
    input: NotifyResultInput,
    context: INodeContext,
  ): Promise<ITypedNodeResult<NotifyResultOutput>> {
    const { logger } = context;

    // sharedState에서 save_result 가져오기 (input에 없는 경우)
    let saveResult = input.save_result;
    if (!saveResult) {
      const fromSharedState = context.sharedState.get("save_result") as
        | SaveResultOutput
        | undefined;
      if (fromSharedState) {
        saveResult = fromSharedState;
      }
    }

    // 입력 검증
    const mergedInput = {
      ...input,
      save_result: saveResult,
      platform: input.platform || context.platform,
      job_id: input.job_id || context.job_id,
      workflow_id: input.workflow_id || context.workflow_id,
    };

    const validation = this.validate(mergedInput);
    if (!validation.valid) {
      return createErrorResult<NotifyResultOutput>(
        validation.errors.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        validation.errors,
      );
    }

    logger.info(
      {
        type: this.type,
        platform: mergedInput.platform,
        job_id: mergedInput.job_id,
        enable_slack: this.nodeConfig.enable_slack,
      },
      "알림 발송 시작",
    );

    try {
      const channels: string[] = [];
      let notified = false;

      // 알림 조건 확인
      if (this.shouldNotify(saveResult)) {
        // Slack 알림
        if (this.nodeConfig.enable_slack && this.nodeConfig.slack_webhook_url) {
          const slackSuccess = await this.sendSlackNotification(
            mergedInput,
            saveResult,
          );
          if (slackSuccess) {
            channels.push("slack");
            notified = true;
          }
        }

        // 향후 추가 채널 (Email, Discord 등)
        // if (this.nodeConfig.enable_email) { ... }
      } else {
        logger.info({ type: this.type }, "알림 조건 미충족 - 발송 스킵");
      }

      const output: NotifyResultOutput = {
        notified,
        channels: channels.length > 0 ? channels : undefined,
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

      logger.error(
        {
          type: this.type,
          error: message,
        },
        "알림 발송 실패",
      );

      // 알림 실패는 워크플로우 실패로 처리하지 않음 (경고만)
      return createSuccessResult({
        notified: false,
        error: message,
      });
    }
  }

  /**
   * 입력 검증
   */
  validate(input: NotifyResultInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

    if (!input.save_result) {
      errors.push({
        field: "save_result",
        message: "save_result is required",
        code: "MISSING_SAVE_RESULT",
      });
    }

    if (!input.platform) {
      errors.push({
        field: "platform",
        message: "platform is required",
        code: "MISSING_PLATFORM",
      });
    }

    if (!input.job_id) {
      errors.push({
        field: "job_id",
        message: "job_id is required",
        code: "MISSING_JOB_ID",
      });
    }

    return errors.length > 0 ? validationFailure(errors) : validationSuccess();
  }

  /**
   * 롤백
   */
  async rollback(context: INodeContext): Promise<void> {
    context.logger.info({ type: this.type }, "Rollback - no action needed");
  }

  /**
   * 알림 발송 여부 결정
   */
  private shouldNotify(saveResult: SaveResultOutput): boolean {
    if (!this.nodeConfig.notify_on_failure_only) {
      return true;
    }

    const { summary } = saveResult;
    const total = summary.total;

    if (total === 0) {
      return false;
    }

    // 실패율 또는 불일치율이 임계값 초과 시 알림
    const failureRate = ((summary.failed + summary.not_found) / total) * 100;
    const mismatchRate = (summary.mismatch / total) * 100;

    return (
      failureRate > 0 ||
      mismatchRate > this.nodeConfig.mismatch_threshold_percent
    );
  }

  /**
   * Slack 알림 발송
   */
  private async sendSlackNotification(
    input: NotifyResultInput,
    saveResult: SaveResultOutput,
  ): Promise<boolean> {
    const webhookUrl = this.nodeConfig.slack_webhook_url;
    if (!webhookUrl) {
      return false;
    }

    const message = this.buildSlackMessage(input, saveResult);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.nodeConfig.request_timeout_ms,
      );

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      // 타임아웃 또는 네트워크 오류
      return false;
    }
  }

  /**
   * Slack 메시지 빌드
   */
  private buildSlackMessage(
    input: NotifyResultInput,
    saveResult: SaveResultOutput,
  ): { blocks: SlackBlock[] } {
    const { summary, jsonl_path } = saveResult;
    const { platform, job_id, workflow_id } = input;

    // 상태 이모지 결정
    const statusEmoji = this.getStatusEmoji(summary);
    const matchRate =
      summary.total > 0 ? Math.round((summary.match / summary.total) * 100) : 0;

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${statusEmoji} Product Validation Report`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Platform:*\n${platform}`,
          },
          {
            type: "mrkdwn",
            text: `*Job ID:*\n${job_id}`,
          },
          {
            type: "mrkdwn",
            text: `*Match Rate:*\n${matchRate}%`,
          },
          {
            type: "mrkdwn",
            text: `*Total:*\n${summary.total}`,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*✅ Match:*\n${summary.match}`,
          },
          {
            type: "mrkdwn",
            text: `*⚠️ Mismatch:*\n${summary.mismatch}`,
          },
          {
            type: "mrkdwn",
            text: `*❌ Failed:*\n${summary.failed}`,
          },
          {
            type: "mrkdwn",
            text: `*🔍 Not Found:*\n${summary.not_found}`,
          },
        ],
      },
    ];

    // JSONL 경로 추가 (있는 경우)
    if (jsonl_path) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Output File:*\n\`${jsonl_path}\``,
        },
      });
    }

    // 타임스탬프 추가
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_${getTimestampWithTimezone()}_`,
      },
    });

    return { blocks };
  }

  /**
   * 상태에 따른 이모지 반환
   */
  private getStatusEmoji(summary: SaveResultOutput["summary"]): string {
    const total = summary.total;
    if (total === 0) return "📭";

    const matchRate = (summary.match / total) * 100;
    const failureRate = ((summary.failed + summary.not_found) / total) * 100;

    if (failureRate > EMOJI_THRESHOLDS.CRITICAL_FAILURE_RATE) return "🚨";
    if (summary.mismatch > 0) return "⚠️";
    if (matchRate === EMOJI_THRESHOLDS.PERFECT_MATCH_RATE) return "✅";
    if (matchRate >= EMOJI_THRESHOLDS.GOOD_MATCH_RATE) return "👍";
    return "📊";
  }
}

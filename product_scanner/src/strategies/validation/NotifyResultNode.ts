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
 * - Slack Bot API 연동 (chat.postMessage)
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
import { JsonlParser } from "@/utils/JsonlParser";
import {
  NotifyResultInput,
  NotifyResultOutput,
  SaveResultOutput,
  ExtractUrlOutput,
  ExtractProductSetOutput,
  ExtractMultiPlatformOutput,
} from "./types";

/**
 * 통합 결과 타입 (SaveResult 또는 Extract 출력)
 */
type UnifiedResult = {
  jsonl_path?: string;
  summary: {
    total: number;
    success: number;
    failed: number;
    not_found: number;
    match?: number;
    mismatch?: number;
  };
};

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
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Job Timing 정보
 */
interface JobTiming {
  started_at?: string;
  created_at?: string;
}

/**
 * Job Params 정보
 */
interface JobParams {
  sale_status?: string;
  product_id?: string;
  product_set_id?: string;
  url?: string;
  [key: string]: unknown;
}

/**
 * NotifyResultNode 설정
 */
export interface NotifyResultNodeConfig {
  /** Slack Bot Token */
  slack_bot_token?: string;

  /** Slack Channel ID */
  slack_channel_id?: string;

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
 * Slack Bot API URL
 */
const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

/**
 * 기본 설정
 * - SLACK_BOT_TOKEN: Slack Bot Token (대체)
 * - SLACK_CHANNEL_ID: Slack Channel ID (필수)
 */
const DEFAULT_CONFIG: NotifyResultNodeConfig = {
  slack_bot_token: process.env.SLACK_BOT_TOKEN,
  slack_channel_id: process.env.SLACK_CHANNEL_ID,
  enable_slack: true,
  notify_on_failure_only: false,
  mismatch_threshold_percent: 10,
  request_timeout_ms: 10000,
};

/**
 * NotifyResultNode - 결과 알림 노드
 */
export class NotifyResultNode implements ITypedNodeStrategy<
  NotifyResultInput,
  NotifyResultOutput
> {
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

    // 결과 데이터 추출 (save_result 또는 extract 출력)
    const unifiedResult = this.extractUnifiedResult(
      input as NotifyResultInput & Record<string, unknown>,
      context,
    );

    if (!unifiedResult) {
      logger.warn({ type: this.type }, "알림 대상 결과 없음 - 스킵");
      return createSuccessResult({
        notified: false,
        error: "No result to notify",
      });
    }

    // 입력 검증 (save_result 대신 unifiedResult 사용)
    const mergedInput = {
      ...input,
      save_result: unifiedResult as SaveResultOutput,
      platform: input.platform || context.platform,
      job_id: input.job_id || context.job_id,
      workflow_id: input.workflow_id || context.workflow_id,
    };

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

      // sharedState에서 job_timing, job_params 가져오기
      const jobTiming = context.sharedState.get("job_timing") as
        | JobTiming
        | undefined;
      const jobParams = context.sharedState.get("job_params") as
        | JobParams
        | undefined;

      // 알림 조건 확인
      if (this.shouldNotify(unifiedResult)) {
        // Slack 알림
        if (
          this.nodeConfig.enable_slack &&
          this.nodeConfig.slack_bot_token &&
          this.nodeConfig.slack_channel_id
        ) {
          const slackSuccess = await this.sendSlackNotification(
            mergedInput,
            unifiedResult,
            jobTiming,
            jobParams,
            logger,
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
   * - save_result는 extractUnifiedResult에서 처리하므로 여기서 검증하지 않음
   */
  validate(input: NotifyResultInput): IValidationResult {
    const errors: Array<{ field: string; message: string; code?: string }> = [];

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
  private shouldNotify(result: UnifiedResult): boolean {
    if (!this.nodeConfig.notify_on_failure_only) {
      return true;
    }

    const { summary } = result;
    const total = summary.total;

    if (total === 0) {
      return false;
    }

    // 실패율 또는 불일치율이 임계값 초과 시 알림
    const failureRate = ((summary.failed + summary.not_found) / total) * 100;
    const mismatchRate = ((summary.mismatch ?? 0) / total) * 100;

    return (
      failureRate > 0 ||
      mismatchRate > this.nodeConfig.mismatch_threshold_percent
    );
  }

  /**
   * Slack 알림 발송 (Bot API)
   */
  private async sendSlackNotification(
    input: NotifyResultInput,
    result: UnifiedResult,
    jobTiming: JobTiming | undefined,
    jobParams: JobParams | undefined,
    logger: INodeContext["logger"],
  ): Promise<boolean> {
    const { slack_bot_token, slack_channel_id } = this.nodeConfig;
    if (!slack_bot_token || !slack_channel_id) {
      return false;
    }

    // JSONL에서 sale_status_changed 카운트 추출 (플랫폼 워크플로우)
    let saleStatusChanged: number | undefined;
    if (result.jsonl_path) {
      try {
        const stats = await JsonlParser.extractStatisticsFromFile(
          result.jsonl_path,
        );
        saleStatusChanged = stats.sale_status_changed;
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "JSONL 통계 추출 실패",
        );
      }
    }

    const message = this.buildSlackMessage(
      input,
      result,
      jobTiming,
      jobParams,
      saleStatusChanged,
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.nodeConfig.request_timeout_ms,
      );

      const response = await fetch(SLACK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${slack_bot_token}`,
        },
        body: JSON.stringify({
          channel: slack_channel_id,
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

      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        logger.warn({ error: result.error }, "Slack API 에러");
        return false;
      }

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
   * 시간 문자열을 Date로 파싱
   */
  private parseTime(timeStr: string | undefined): Date | null {
    if (!timeStr) return null;
    try {
      return new Date(timeStr);
    } catch {
      return null;
    }
  }

  /**
   * 소요 시간 포맷팅 (분:초 또는 시:분:초)
   */
  private formatDuration(startTime: Date, endTime: Date): string {
    const diffMs = endTime.getTime() - startTime.getTime();
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}시간 ${minutes}분 ${seconds}초`;
    }
    return `${minutes}분 ${seconds}초`;
  }

  /**
   * 시간 포맷팅 (HH:mm:ss)
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  /**
   * 통합 결과 추출 (save_result 또는 extract 출력)
   *
   * 우선순위:
   * 1. input.save_result
   * 2. sharedState의 save_result
   * 3. input에서 extract 노드 출력 (jsonl_path + summary)
   */
  private extractUnifiedResult(
    input: NotifyResultInput & Record<string, unknown>,
    context: INodeContext,
  ): UnifiedResult | null {
    // 1. input.save_result 확인
    if (input.save_result) {
      return input.save_result;
    }

    // 2. sharedState에서 save_result 확인
    const fromSharedState = context.sharedState.get("save_result") as
      | SaveResultOutput
      | undefined;
    if (fromSharedState) {
      return fromSharedState;
    }

    // 3. Extract 노드 출력 확인 (accumulatedData에서 전달됨)
    // ExtractUrlOutput, ExtractProductSetOutput, ExtractMultiPlatformOutput 모두
    // jsonl_path와 summary를 가짐
    if (input.jsonl_path && input.summary) {
      const summary = input.summary as UnifiedResult["summary"];
      return {
        jsonl_path: input.jsonl_path as string,
        summary: {
          total: summary.total ?? 0,
          success: summary.success ?? 0,
          failed: summary.failed ?? 0,
          not_found: summary.not_found ?? 0,
          match: summary.match,
          mismatch: summary.mismatch,
        },
      };
    }

    return null;
  }

  /**
   * 워크플로우 타입 감지 (platform, product, product-set, url)
   */
  private detectWorkflowType(
    input: NotifyResultInput,
  ): "platform" | "product" | "product-set" | "url" {
    const workflowId = input.workflow_id?.toLowerCase() || "";

    if (workflowId.includes("url")) {
      return "url";
    }
    if (
      workflowId.includes("product-set") ||
      workflowId.includes("product_set")
    ) {
      return "product-set";
    }
    // extract-product (product_id 기반)
    if (
      workflowId.includes("extract-product") &&
      !workflowId.includes("product-set")
    ) {
      return "product";
    }
    // 플랫폼 워크플로우: platform-update, multi-platform 등
    return "platform";
  }

  /**
   * 업데이트 모드 감지 (workflow_id에 "update" 포함 여부)
   */
  private detectUpdateMode(input: NotifyResultInput): boolean {
    const workflowId = input.workflow_id?.toLowerCase() || "";
    return workflowId.includes("update");
  }

  /**
   * Slack 메시지 빌드 (unordered list 형식)
   */
  private buildSlackMessage(
    input: NotifyResultInput,
    result: UnifiedResult,
    jobTiming: JobTiming | undefined,
    jobParams: JobParams | undefined,
    saleStatusChanged: number | undefined,
  ): { blocks: SlackBlock[] } {
    const { summary } = result;
    const { platform, job_id } = input;
    const workflowType = this.detectWorkflowType(input);

    // 시간 정보 계산
    const startedAt = this.parseTime(jobTiming?.started_at);
    const completedAt = new Date();
    const duration =
      startedAt && completedAt
        ? this.formatDuration(startedAt, completedAt)
        : "N/A";

    // 상태 이모지 결정
    const statusEmoji = this.getStatusEmoji(summary);

    // 워크플로우 모드 감지 (validation only vs update)
    const isUpdateMode = this.detectUpdateMode(input);
    const modeLabel = isUpdateMode ? "validation + update" : "validation only";

    // 메시지 라인 구성
    const lines: string[] = [];

    // 기본 정보
    lines.push(`• Platform: \`${platform}\``);
    lines.push(`• Job ID: \`${job_id}\``);
    lines.push(`• Mode: \`${modeLabel}\``);

    // 워크플로우별 입력 ID 표시
    if (workflowType === "product" && jobParams?.product_id) {
      lines.push(`• Product ID: \`${jobParams.product_id}\``);
    }
    if (workflowType === "product-set" && jobParams?.product_set_id) {
      lines.push(`• ProductSet ID: \`${jobParams.product_set_id}\``);
    }
    if (workflowType === "url" && jobParams?.url) {
      lines.push(`• URL: \`${jobParams.url}\``);
    }

    // sale_status 파라미터 (platform 워크플로우만)
    if (workflowType === "platform" && jobParams?.sale_status) {
      lines.push(`• Sale Status: \`${jobParams.sale_status}\``);
    }

    // 시간 정보 (한 줄)
    const startTimeStr = startedAt ? this.formatTime(startedAt) : "N/A";
    const endTimeStr = this.formatTime(completedAt);
    lines.push(`• 시간: ${startTimeStr} - ${endTimeStr} (${duration})`);

    // 결과 (한 줄)
    if (workflowType === "url") {
      lines.push(
        `• Total ${summary.total}: (success ${summary.success} | failed ${summary.failed})`,
      );
    } else {
      const statusPart =
        saleStatusChanged !== undefined
          ? ` | status changed ${saleStatusChanged}`
          : "";
      lines.push(
        `• Total ${summary.total}: (match ${summary.match ?? 0} | update ${summary.mismatch ?? 0} | failed ${summary.failed}${statusPart})`,
      );
    }

    const actionLabel = isUpdateMode ? "update" : "validation";
    // 타이틀 라벨: 워크플로우 타입에 따라 결정
    const titleLabel = this.getTitleLabel(workflowType, platform);
    const blocks: SlackBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji} *${titleLabel}* ${actionLabel} completed\n\n${lines.join("\n")}`,
        },
      },
    ];

    return { blocks };
  }

  /**
   * 타이틀 라벨 결정
   */
  private getTitleLabel(
    workflowType: "platform" | "product" | "product-set" | "url",
    platform: string,
  ): string {
    switch (workflowType) {
      case "product":
        return "product";
      case "product-set":
        return "product-set";
      case "url":
        return "url";
      case "platform":
      default:
        return platform;
    }
  }

  /**
   * 상태에 따른 이모지 반환
   */
  private getStatusEmoji(summary: UnifiedResult["summary"]): string {
    const total = summary.total;
    if (total === 0) return "📭";

    const matchRate = ((summary.match ?? 0) / total) * 100;
    const failureRate = ((summary.failed + summary.not_found) / total) * 100;

    if (failureRate > EMOJI_THRESHOLDS.CRITICAL_FAILURE_RATE) return "🚨";
    if ((summary.mismatch ?? 0) > 0) return "⚠️";
    if (matchRate === EMOJI_THRESHOLDS.PERFECT_MATCH_RATE) return "✅";
    if (matchRate >= EMOJI_THRESHOLDS.GOOD_MATCH_RATE) return "👍";
    return "📊";
  }
}

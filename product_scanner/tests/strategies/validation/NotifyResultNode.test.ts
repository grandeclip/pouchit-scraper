/**
 * NotifyResultNode 단위 테스트
 *
 * Phase 4 Step 4.7 검증
 * Note: Slack webhook은 mock 사용
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  NotifyResultNode,
  type INotificationChannel,
  type NotificationMessage,
} from "@/strategies/validation/NotifyResultNode";
import { INodeContext } from "@/core/interfaces/INodeContext";
import { SaveResultOutput } from "@/strategies/validation/types";
import pino from "pino";

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock INodeContext
const createMockContext = (
  overrides: Partial<INodeContext> = {},
): INodeContext => ({
  job_id: "test-job-123",
  workflow_id: "test-workflow-456",
  node_id: "test-node-789",
  config: {},
  input: {},
  params: {},
  platform: "oliveyoung",
  logger: pino({ level: "silent" }),
  platformConfig: {
    platform: "oliveyoung",
    platform_id: "OLIVEYOUNG",
    base_url: "https://www.oliveyoung.co.kr",
    strategies: [],
    rate_limit: { requests_per_minute: 60, delay_between_requests_ms: 1000 },
  },
  sharedState: new Map<string, unknown>(),
  ...overrides,
});

// Mock SaveResultOutput
const createMockSaveResult = (
  overrides: Partial<SaveResultOutput> = {},
): SaveResultOutput => ({
  record_count: 10,
  summary: {
    total: 10,
    success: 8,
    failed: 1,
    not_found: 1,
    match: 7,
    mismatch: 1,
  },
  jsonl_path: "/tmp/output/results.jsonl",
  ...overrides,
});

describe("NotifyResultNode", () => {
  let node: NotifyResultNode;

  beforeEach(() => {
    // Reset mocks
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    node = new NotifyResultNode({
      slack_webhook_url: "https://hooks.slack.com/test-webhook",
      enable_slack: true,
      notify_on_failure_only: false,
    });
  });

  describe("기본 속성", () => {
    it("type이 'notify_result'", () => {
      expect(node.type).toBe("notify_result");
    });

    it("name이 'NotifyResultNode'", () => {
      expect(node.name).toBe("NotifyResultNode");
    });
  });

  describe("validate()", () => {
    it("모든 필드 있으면 valid", () => {
      const result = node.validate({
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      });
      expect(result.valid).toBe(true);
    });

    it("save_result 없으면 invalid", () => {
      const result = node.validate({
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      } as unknown as {
        save_result: SaveResultOutput;
        platform: string;
        job_id: string;
        workflow_id: string;
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("MISSING_SAVE_RESULT");
    });

    it("platform 없으면 invalid", () => {
      const result = node.validate({
        save_result: createMockSaveResult(),
        job_id: "job-123",
        workflow_id: "wf-456",
      } as unknown as {
        save_result: SaveResultOutput;
        platform: string;
        job_id: string;
        workflow_id: string;
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("MISSING_PLATFORM");
    });

    it("job_id 없으면 invalid", () => {
      const result = node.validate({
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        workflow_id: "wf-456",
      } as unknown as {
        save_result: SaveResultOutput;
        platform: string;
        job_id: string;
        workflow_id: string;
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("MISSING_JOB_ID");
    });
  });

  describe("execute() - Slack 알림 발송", () => {
    it("Slack 알림 성공", async () => {
      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(true);
      expect(result.data.channels).toContain("slack");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("webhook URL 없으면 알림 스킵", async () => {
      const nodeWithoutWebhook = new NotifyResultNode({
        slack_webhook_url: undefined,
        enable_slack: true,
      });

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await nodeWithoutWebhook.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("enable_slack=false면 알림 스킵", async () => {
      const disabledNode = new NotifyResultNode({
        slack_webhook_url: "https://hooks.slack.com/test",
        enable_slack: false,
      });

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await disabledNode.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("Slack API 실패 시 에러 처리", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await node.execute(input, context);

      // 알림 실패는 워크플로우 실패가 아님
      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(false);
    });

    it("네트워크 에러 처리", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(false);
    });
  });

  describe("execute() - notify_on_failure_only", () => {
    it("실패 없고 notify_on_failure_only=true면 알림 스킵", async () => {
      const strictNode = new NotifyResultNode({
        slack_webhook_url: "https://hooks.slack.com/test",
        enable_slack: true,
        notify_on_failure_only: true,
        mismatch_threshold_percent: 50, // 높은 임계값
      });

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult({
          summary: {
            total: 10,
            success: 10,
            failed: 0,
            not_found: 0,
            match: 10,
            mismatch: 0,
          },
        }),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await strictNode.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("실패 있으면 notify_on_failure_only=true여도 알림 발송", async () => {
      const strictNode = new NotifyResultNode({
        slack_webhook_url: "https://hooks.slack.com/test",
        enable_slack: true,
        notify_on_failure_only: true,
      });

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult({
          summary: {
            total: 10,
            success: 8,
            failed: 2, // 실패 있음
            not_found: 0,
            match: 8,
            mismatch: 0,
          },
        }),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await strictNode.execute(input, context);

      expect(result.data.notified).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("불일치율 임계값 초과 시 알림 발송", async () => {
      const strictNode = new NotifyResultNode({
        slack_webhook_url: "https://hooks.slack.com/test",
        enable_slack: true,
        notify_on_failure_only: true,
        mismatch_threshold_percent: 5, // 5% 임계값
      });

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult({
          summary: {
            total: 10,
            success: 10,
            failed: 0,
            not_found: 0,
            match: 9,
            mismatch: 1, // 10% 불일치
          },
        }),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await strictNode.execute(input, context);

      expect(result.data.notified).toBe(true);
    });
  });

  describe("execute() - sharedState에서 save_result 가져오기", () => {
    it("input에 없으면 sharedState에서 조회", async () => {
      const saveResult = createMockSaveResult();
      const sharedState = new Map<string, unknown>();
      sharedState.set("save_result", saveResult);

      const context = createMockContext({ sharedState });
      const input = {
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
        // save_result 미지정
      };

      const result = await node.execute(
        input as unknown as {
          save_result: SaveResultOutput;
          platform: string;
          job_id: string;
          workflow_id: string;
        },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(true);
    });

    it("context에서 platform, job_id 가져오기", async () => {
      const context = createMockContext({
        platform: "coupang",
        job_id: "context-job-id",
        workflow_id: "context-workflow-id",
      });
      const input = {
        save_result: createMockSaveResult(),
        workflow_id: "wf-456",
        // platform, job_id 미지정 - context에서 가져옴
      };

      const result = await node.execute(
        input as unknown as {
          save_result: SaveResultOutput;
          platform: string;
          job_id: string;
          workflow_id: string;
        },
        context,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("execute() - Slack 메시지 형식", () => {
    it("올바른 Slack Block 형식으로 전송", async () => {
      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      await node.execute(input, context);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test-webhook",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"blocks"'),
        }),
      );

      // body 내용 검증
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.blocks).toBeDefined();
      expect(body.blocks.length).toBeGreaterThan(0);
      expect(body.blocks[0].type).toBe("header");
    });

    it("메시지에 summary 정보 포함", async () => {
      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult({
          summary: {
            total: 100,
            success: 90,
            failed: 5,
            not_found: 5,
            match: 85,
            mismatch: 5,
          },
        }),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      await node.execute(input, context);

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;

      // summary 정보가 포함되어 있는지 확인
      expect(bodyStr).toContain("100"); // total
      expect(bodyStr).toContain("oliveyoung"); // platform
    });
  });

  describe("execute() - 빈 결과 처리", () => {
    it("total=0인 경우 처리", async () => {
      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult({
          summary: {
            total: 0,
            success: 0,
            failed: 0,
            not_found: 0,
            match: 0,
            mismatch: 0,
          },
        }),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await node.execute(input, context);

      expect(result.success).toBe(true);
      // notify_on_failure_only=false이므로 알림 발송
      expect(result.data.notified).toBe(true);
    });

    it("total=0 + notify_on_failure_only=true면 스킵", async () => {
      const strictNode = new NotifyResultNode({
        slack_webhook_url: "https://hooks.slack.com/test",
        enable_slack: true,
        notify_on_failure_only: true,
      });

      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult({
          summary: {
            total: 0,
            success: 0,
            failed: 0,
            not_found: 0,
            match: 0,
            mismatch: 0,
          },
        }),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await strictNode.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data.notified).toBe(false);
    });
  });

  describe("타입 정합성", () => {
    it("ITypedNodeStrategy 인터페이스 구현", () => {
      expect(typeof node.type).toBe("string");
      expect(typeof node.name).toBe("string");
      expect(typeof node.execute).toBe("function");
      expect(typeof node.validate).toBe("function");
      expect(typeof node.rollback).toBe("function");
    });

    it("출력 타입 검증", async () => {
      const context = createMockContext();
      const input = {
        save_result: createMockSaveResult(),
        platform: "oliveyoung",
        job_id: "job-123",
        workflow_id: "wf-456",
      };

      const result = await node.execute(input, context);

      expect(result.data).toHaveProperty("notified");
      expect(typeof result.data.notified).toBe("boolean");
    });
  });

  describe("INotificationChannel 인터페이스", () => {
    it("커스텀 채널 구현 가능 (타입 체크)", () => {
      // 컴파일 타임 타입 체크를 위한 테스트
      const mockChannel: INotificationChannel = {
        name: "test-channel",
        send: async (_message: NotificationMessage): Promise<boolean> => true,
        isEnabled: (): boolean => true,
      };

      expect(mockChannel.name).toBe("test-channel");
      expect(mockChannel.isEnabled()).toBe(true);
    });
  });
});

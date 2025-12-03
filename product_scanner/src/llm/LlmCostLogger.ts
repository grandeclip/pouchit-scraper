/**
 * LLM Cost Logger
 *
 * LLM API 호출 비용을 JSONL 파일로 기록합니다.
 *
 * 파일 위치: results/{yyyy-mm-dd}/llm_cost__{yyyy-mm-dd}.jsonl
 *
 * JSONL 레코드 구조:
 * {
 *   timestamp: string,
 *   job_id: string,
 *   platform: string,
 *   product_set_id: string,
 *   operation: "normalize" | "label" | "full",
 *   model: string,
 *   input_tokens: number,
 *   output_tokens: number,
 *   total_tokens: number,
 *   cost_usd: number
 * }
 */

import * as fs from "fs";
import * as path from "path";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import { logger } from "@/config/logger";

// ============================================
// 인터페이스 정의
// ============================================

/** LLM 비용 레코드 */
export interface LlmCostRecord {
  /** 타임스탬프 (ISO 8601 with timezone) */
  timestamp: string;
  /** Job ID */
  job_id: string;
  /** 플랫폼명 */
  platform: string;
  /** 상품 세트 ID */
  product_set_id: string;
  /** 작업 유형 */
  operation: "normalize" | "label" | "full";
  /** 사용 모델 */
  model: string;
  /** 입력 토큰 수 */
  input_tokens: number;
  /** 출력 토큰 수 */
  output_tokens: number;
  /** 총 토큰 수 */
  total_tokens: number;
  /** 비용 (USD) */
  cost_usd: number;
}

/** 비용 로깅 입력 파라미터 */
export interface LlmCostLogParams {
  job_id: string;
  platform: string;
  product_set_id: string;
  operation: "normalize" | "label" | "full";
  model: string;
  input_tokens: number;
  output_tokens: number;
}

/** Gemini 모델별 가격 (USD per 1M tokens) */
interface GeminiPricing {
  inputPer1M: number;
  outputPer1M: number;
}

// ============================================
// 상수 정의
// ============================================

/** Gemini 모델별 가격 (2024-12 기준) */
const GEMINI_PRICING: Record<string, GeminiPricing> = {
  "gemini-2.5-flash": {
    inputPer1M: 0.15,
    outputPer1M: 0.6,
  },
  "gemini-2.0-flash": {
    inputPer1M: 0.1,
    outputPer1M: 0.4,
  },
  "gemini-1.5-flash": {
    inputPer1M: 0.075,
    outputPer1M: 0.3,
  },
};

/** 기본 가격 (알 수 없는 모델용) */
const DEFAULT_PRICING: GeminiPricing = {
  inputPer1M: 0.15,
  outputPer1M: 0.6,
};

/** 결과 디렉토리 기본 경로 */
const RESULTS_BASE_DIR = process.env.RESULTS_DIR || "results";

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 오늘 날짜 문자열 반환 (yyyy-mm-dd)
 */
function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 비용 계산
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const pricing = GEMINI_PRICING[model] || DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}

/**
 * 디렉토리 생성 (존재하지 않으면)
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ============================================
// 메인 함수
// ============================================

/**
 * LLM 비용 로그 기록
 *
 * @param params 비용 로깅 파라미터
 * @returns 기록된 레코드
 */
export function logLlmCost(params: LlmCostLogParams): LlmCostRecord {
  const dateStr = getDateString();
  const dirPath = path.join(RESULTS_BASE_DIR, dateStr);
  const filePath = path.join(dirPath, `llm_cost__${dateStr}.jsonl`);

  // 디렉토리 생성
  ensureDirectoryExists(dirPath);

  // 비용 계산
  const costUsd = calculateCost(
    params.input_tokens,
    params.output_tokens,
    params.model,
  );

  // 레코드 생성
  const record: LlmCostRecord = {
    timestamp: getTimestampWithTimezone(),
    job_id: params.job_id,
    platform: params.platform,
    product_set_id: params.product_set_id,
    operation: params.operation,
    model: params.model,
    input_tokens: params.input_tokens,
    output_tokens: params.output_tokens,
    total_tokens: params.input_tokens + params.output_tokens,
    cost_usd: costUsd,
  };

  // JSONL 파일에 append
  try {
    const jsonLine = JSON.stringify(record) + "\n";
    fs.appendFileSync(filePath, jsonLine, "utf-8");

    logger.debug(
      {
        file: filePath,
        product_set_id: params.product_set_id,
        operation: params.operation,
        cost_usd: costUsd,
      },
      "[LlmCostLogger] 비용 기록 완료",
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        file: filePath,
      },
      "[LlmCostLogger] 비용 기록 실패",
    );
  }

  return record;
}

/**
 * 배치 비용 로그 기록 (여러 레코드 한번에)
 *
 * @param records 비용 레코드 배열
 * @returns 기록된 레코드 수
 */
export function logLlmCostBatch(records: LlmCostLogParams[]): number {
  let successCount = 0;

  for (const params of records) {
    try {
      logLlmCost(params);
      successCount++;
    } catch {
      // 개별 실패는 무시하고 계속 진행
    }
  }

  return successCount;
}

/**
 * 오늘 비용 합계 조회
 *
 * @returns 오늘 총 비용 (USD)
 */
export function getTodayTotalCost(): number {
  const dateStr = getDateString();
  const filePath = path.join(
    RESULTS_BASE_DIR,
    dateStr,
    `llm_cost__${dateStr}.jsonl`,
  );

  if (!fs.existsSync(filePath)) {
    return 0;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    let totalCost = 0;
    for (const line of lines) {
      const record = JSON.parse(line) as LlmCostRecord;
      totalCost += record.cost_usd;
    }

    return totalCost;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[LlmCostLogger] 비용 합계 조회 실패",
    );
    return 0;
  }
}

/**
 * 오늘 비용 통계 조회
 */
export function getTodayCostStats(): {
  total_cost_usd: number;
  total_records: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_operation: Record<string, { count: number; cost_usd: number }>;
  by_platform: Record<string, { count: number; cost_usd: number }>;
} {
  const dateStr = getDateString();
  const filePath = path.join(
    RESULTS_BASE_DIR,
    dateStr,
    `llm_cost__${dateStr}.jsonl`,
  );

  const stats = {
    total_cost_usd: 0,
    total_records: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    by_operation: {} as Record<string, { count: number; cost_usd: number }>,
    by_platform: {} as Record<string, { count: number; cost_usd: number }>,
  };

  if (!fs.existsSync(filePath)) {
    return stats;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const record = JSON.parse(line) as LlmCostRecord;

      stats.total_cost_usd += record.cost_usd;
      stats.total_records++;
      stats.total_input_tokens += record.input_tokens;
      stats.total_output_tokens += record.output_tokens;

      // by_operation
      if (!stats.by_operation[record.operation]) {
        stats.by_operation[record.operation] = { count: 0, cost_usd: 0 };
      }
      stats.by_operation[record.operation].count++;
      stats.by_operation[record.operation].cost_usd += record.cost_usd;

      // by_platform
      if (!stats.by_platform[record.platform]) {
        stats.by_platform[record.platform] = { count: 0, cost_usd: 0 };
      }
      stats.by_platform[record.platform].count++;
      stats.by_platform[record.platform].cost_usd += record.cost_usd;
    }

    return stats;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[LlmCostLogger] 비용 통계 조회 실패",
    );
    return stats;
  }
}

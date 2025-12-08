/**
 * LLM 비용 계산기
 *
 * llm_cost__*.jsonl 파일을 읽어 총 비용을 계산합니다.
 *
 * 사용법:
 *   npx tsx scripts/calculate-llm-cost.ts                     # 오늘 날짜 파일
 *   npx tsx scripts/calculate-llm-cost.ts 2025-12-03          # 특정 날짜
 *   npx tsx scripts/calculate-llm-cost.ts path/to/file.jsonl  # 직접 파일 경로
 */

import * as fs from "fs";
import * as path from "path";
import type { LlmCostRecord } from "@/llm";

interface CostSummary {
  total_cost_usd: number;
  total_records: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_operation: Record<
    string,
    { count: number; cost_usd: number; tokens: number }
  >;
  by_platform: Record<
    string,
    { count: number; cost_usd: number; tokens: number }
  >;
  by_model: Record<string, { count: number; cost_usd: number; tokens: number }>;
  by_job: Record<string, { count: number; cost_usd: number; tokens: number }>;
  time_range: { first: string; last: string } | null;
}

// ============================================
// 유틸리티 함수
// ============================================

function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveFilePath(input?: string): string {
  const resultsDir = process.env.RESULTS_DIR || "results";

  // 입력이 없으면 오늘 날짜 파일
  if (!input) {
    const dateStr = getDateString();
    return path.join(resultsDir, dateStr, `llm_cost__${dateStr}.jsonl`);
  }

  // .jsonl 확장자가 있으면 직접 경로로 취급
  if (input.endsWith(".jsonl")) {
    return input;
  }

  // yyyy-mm-dd 형식이면 날짜로 취급
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return path.join(resultsDir, input, `llm_cost__${input}.jsonl`);
  }

  // 그 외에는 그대로 반환
  return input;
}

function parseJsonl(content: string): LlmCostRecord[] {
  const lines = content.trim().split("\n").filter(Boolean);
  const records: LlmCostRecord[] = [];

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as LlmCostRecord;
      records.push(record);
    } catch {
      console.warn(`⚠️ JSON 파싱 실패: ${line.substring(0, 50)}...`);
    }
  }

  return records;
}

function calculateSummary(records: LlmCostRecord[]): CostSummary {
  const summary: CostSummary = {
    total_cost_usd: 0,
    total_records: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    by_operation: {},
    by_platform: {},
    by_model: {},
    by_job: {},
    time_range: null,
  };

  if (records.length === 0) {
    return summary;
  }

  let firstTimestamp = records[0].timestamp;
  let lastTimestamp = records[0].timestamp;

  for (const record of records) {
    // 총계
    summary.total_cost_usd += record.cost_usd;
    summary.total_records++;
    summary.total_input_tokens += record.input_tokens;
    summary.total_output_tokens += record.output_tokens;

    // 시간 범위
    if (record.timestamp < firstTimestamp) firstTimestamp = record.timestamp;
    if (record.timestamp > lastTimestamp) lastTimestamp = record.timestamp;

    // by_operation
    if (!summary.by_operation[record.operation]) {
      summary.by_operation[record.operation] = {
        count: 0,
        cost_usd: 0,
        tokens: 0,
      };
    }
    summary.by_operation[record.operation].count++;
    summary.by_operation[record.operation].cost_usd += record.cost_usd;
    summary.by_operation[record.operation].tokens += record.total_tokens;

    // by_platform
    if (!summary.by_platform[record.platform]) {
      summary.by_platform[record.platform] = {
        count: 0,
        cost_usd: 0,
        tokens: 0,
      };
    }
    summary.by_platform[record.platform].count++;
    summary.by_platform[record.platform].cost_usd += record.cost_usd;
    summary.by_platform[record.platform].tokens += record.total_tokens;

    // by_model
    if (!summary.by_model[record.model]) {
      summary.by_model[record.model] = { count: 0, cost_usd: 0, tokens: 0 };
    }
    summary.by_model[record.model].count++;
    summary.by_model[record.model].cost_usd += record.cost_usd;
    summary.by_model[record.model].tokens += record.total_tokens;

    // by_job
    if (!summary.by_job[record.job_id]) {
      summary.by_job[record.job_id] = { count: 0, cost_usd: 0, tokens: 0 };
    }
    summary.by_job[record.job_id].count++;
    summary.by_job[record.job_id].cost_usd += record.cost_usd;
    summary.by_job[record.job_id].tokens += record.total_tokens;
  }

  summary.time_range = { first: firstTimestamp, last: lastTimestamp };

  return summary;
}

function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(6)}`;
  }
  return `$${usd.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(tokens);
}

function printSummary(summary: CostSummary, filePath: string): void {
  console.log("=".repeat(60));
  console.log("📊 LLM 비용 분석 리포트");
  console.log("=".repeat(60));
  console.log(`\n📁 파일: ${filePath}`);

  if (summary.total_records === 0) {
    console.log("\n⚠️ 레코드가 없습니다.");
    return;
  }

  // 시간 범위
  if (summary.time_range) {
    console.log(
      `📅 기간: ${summary.time_range.first} ~ ${summary.time_range.last}`,
    );
  }

  // 총계
  console.log("\n" + "-".repeat(40));
  console.log("💰 총계");
  console.log("-".repeat(40));
  console.log(`  총 비용:       ${formatCost(summary.total_cost_usd)}`);
  console.log(`  총 레코드:     ${summary.total_records}건`);
  console.log(`  총 입력 토큰:  ${formatTokens(summary.total_input_tokens)}`);
  console.log(`  총 출력 토큰:  ${formatTokens(summary.total_output_tokens)}`);
  console.log(
    `  평균 비용/건:  ${formatCost(summary.total_cost_usd / summary.total_records)}`,
  );

  // 작업별
  console.log("\n" + "-".repeat(40));
  console.log("🔧 작업별 (operation)");
  console.log("-".repeat(40));
  for (const [op, data] of Object.entries(summary.by_operation).sort(
    (a, b) => b[1].cost_usd - a[1].cost_usd,
  )) {
    const pct = ((data.cost_usd / summary.total_cost_usd) * 100).toFixed(1);
    console.log(
      `  ${op.padEnd(12)} ${data.count.toString().padStart(5)}건  ${formatCost(data.cost_usd).padStart(12)}  (${pct}%)`,
    );
  }

  // 플랫폼별
  console.log("\n" + "-".repeat(40));
  console.log("🏪 플랫폼별 (platform)");
  console.log("-".repeat(40));
  for (const [platform, data] of Object.entries(summary.by_platform).sort(
    (a, b) => b[1].cost_usd - a[1].cost_usd,
  )) {
    const pct = ((data.cost_usd / summary.total_cost_usd) * 100).toFixed(1);
    console.log(
      `  ${platform.padEnd(12)} ${data.count.toString().padStart(5)}건  ${formatCost(data.cost_usd).padStart(12)}  (${pct}%)`,
    );
  }

  // 모델별
  console.log("\n" + "-".repeat(40));
  console.log("🤖 모델별 (model)");
  console.log("-".repeat(40));
  for (const [model, data] of Object.entries(summary.by_model).sort(
    (a, b) => b[1].cost_usd - a[1].cost_usd,
  )) {
    const pct = ((data.cost_usd / summary.total_cost_usd) * 100).toFixed(1);
    console.log(
      `  ${model.padEnd(20)} ${data.count.toString().padStart(5)}건  ${formatCost(data.cost_usd).padStart(12)}  (${pct}%)`,
    );
  }

  // Job별 (상위 10개만)
  const jobEntries = Object.entries(summary.by_job).sort(
    (a, b) => b[1].cost_usd - a[1].cost_usd,
  );
  const topJobs = jobEntries.slice(0, 10);

  console.log("\n" + "-".repeat(40));
  console.log(`🏷️ Job별 (상위 ${Math.min(10, jobEntries.length)}개)`);
  console.log("-".repeat(40));
  for (const [jobId, data] of topJobs) {
    const shortId = jobId.length > 20 ? jobId.substring(0, 17) + "..." : jobId;
    const pct = ((data.cost_usd / summary.total_cost_usd) * 100).toFixed(1);
    console.log(
      `  ${shortId.padEnd(20)} ${data.count.toString().padStart(5)}건  ${formatCost(data.cost_usd).padStart(12)}  (${pct}%)`,
    );
  }

  if (jobEntries.length > 10) {
    console.log(`  ... 외 ${jobEntries.length - 10}개 job`);
  }

  console.log("\n" + "=".repeat(60));
}

// ============================================
// 메인 실행
// ============================================

async function main(): Promise<void> {
  const input = process.argv[2];
  const filePath = resolveFilePath(input);

  // 파일 존재 확인
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${filePath}`);
    console.log("\n사용법:");
    console.log(
      "  npx tsx scripts/calculate-llm-cost.ts                     # 오늘 날짜",
    );
    console.log(
      "  npx tsx scripts/calculate-llm-cost.ts 2025-12-03          # 특정 날짜",
    );
    console.log(
      "  npx tsx scripts/calculate-llm-cost.ts path/to/file.jsonl  # 파일 경로",
    );
    process.exit(1);
  }

  // 파일 읽기
  const content = fs.readFileSync(filePath, "utf-8");
  const records = parseJsonl(content);

  // 통계 계산 및 출력
  const summary = calculateSummary(records);
  printSummary(summary, filePath);
}

main().catch(console.error);

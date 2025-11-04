/**
 * 로거 설정
 * Pino 기반 로깅 시스템
 *
 * 기능:
 * - 다중 출력 (콘솔 + 파일)
 * - 서비스별 로그 파일 분리 (server.log, worker.log)
 * - 일일 로그 로테이션 (YYYYMMDD 형식)
 * - 환경별 설정
 * - 구조화된 JSON 로깅
 *
 * 콘솔 출력:
 * - WARNING/ERROR 항상 출력
 * - important: true 인 INFO 출력
 *
 * 파일 출력:
 * - 서비스별 파일: server-YYYYMMDD.log, worker-YYYYMMDD.log
 * - 에러 통합: error-YYYYMMDD.log
 * - 일일 로테이션, 30일 보관
 */

import pino from "pino";
import type { DestinationStream } from "pino";
import { createStream } from "rotating-file-stream";
import path from "path";
import fs from "fs";
import { getTimestampWithTimezone } from "@/utils/timestamp";

// 환경 변수
const NODE_ENV = process.env.NODE_ENV || "development";
const LOG_LEVEL =
  process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug");
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), "logs");
const LOG_PRETTY = process.env.LOG_PRETTY === "true";

// 로그 디렉토리 생성 (없으면)
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 날짜가 포함된 로그 파일명 생성 (YYYYMMDD 형식)
 */
function generateFilename(prefix: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${prefix}-${year}${month}${day}.log`;
}

/**
 * 일일 로테이션 파일 스트림 생성
 */
function createRotatingStream(prefix: string) {
  return createStream(
    (time: Date | number | null) => {
      if (!time) {
        time = new Date();
      }
      if (typeof time === "number") {
        time = new Date(time);
      }
      const year = time.getFullYear();
      const month = String(time.getMonth() + 1).padStart(2, "0");
      const day = String(time.getDate()).padStart(2, "0");
      return `${prefix}-${year}${month}${day}.log`;
    },
    {
      interval: "1d", // 일일 로테이션
      path: LOG_DIR,
      maxFiles: 30, // 30일 보관
      compress: "gzip", // 1일 후 압축
      maxSize: "100M", // 100MB마다 로테이션
    },
  );
}

/**
 * 기본 로거 설정
 */
const baseConfig: pino.LoggerOptions = {
  level: LOG_LEVEL,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  timestamp: () => `,"time":"${getTimestampWithTimezone()}"`,
  base: {
    service: "product_scanner",
    env: NODE_ENV,
  },
};

/**
 * 서비스별 파일 스트림 맵
 */
const serviceStreams = new Map<string, ReturnType<typeof createRotatingStream>>(
  [
    ["server", createRotatingStream("server")],
    ["worker", createRotatingStream("worker")],
    ["redis-repository", createRotatingStream("worker")], // repository는 worker 파일에
  ],
);

// 에러 전용 스트림
const errorStream = createRotatingStream("error");

/**
 * 서비스별 라우팅 스트림 (커스텀 destination)
 * skip_file_log 플래그가 있는 로그는 파일에 저장하지 않음
 */
class ServiceRoutingStream implements DestinationStream {
  write(chunk: string): boolean {
    try {
      const log = JSON.parse(chunk);

      // skip_file_log 플래그가 있으면 파일 저장 스킵 (콘솔만 출력)
      if (log.skip_file_log === true) {
        return true;
      }

      const serviceName = log.service_name || "server"; // 기본값: server

      // 에러는 error.log에도 기록
      if (log.level === "error" || log.level === 50) {
        errorStream.write(chunk);
      }

      // 서비스별 파일에 기록
      const stream =
        serviceStreams.get(serviceName) || serviceStreams.get("server");
      if (stream) {
        stream.write(chunk);
      }
    } catch (err) {
      // JSON 파싱 실패 시 server.log에 기록
      const serverStream = serviceStreams.get("server");
      if (serverStream) {
        serverStream.write(chunk);
      }
    }
    return true;
  }
}

/**
 * 콘솔 필터링 스트림
 * WARNING/ERROR 항상 출력, important: true인 INFO만 출력
 */
class ConsoleFilterStream implements DestinationStream {
  constructor(private targetStream: any) {}

  write(chunk: string): boolean {
    try {
      const log = JSON.parse(chunk);
      const level = log.level;

      // WARNING(40) 이상 항상 출력
      if (level >= 40) {
        this.targetStream.write(chunk);
        return true;
      }

      // INFO(30)는 important: true일 때만 출력
      if (level === 30 && log.important === true) {
        this.targetStream.write(chunk);
        return true;
      }

      // 나머지는 스킵
      return true;
    } catch (err) {
      // JSON 파싱 실패 시 그냥 출력
      this.targetStream.write(chunk);
      return true;
    }
  }
}

/**
 * 메인 로거 인스턴스
 */
let logger: pino.Logger;

if (NODE_ENV === "development" && LOG_PRETTY) {
  // 개발 환경: 예쁜 콘솔 출력 + 서비스별 파일 저장
  const prettyStream = pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname,service,env",
      messageFormat: "{if important}⭐ {end}{msg}",
    },
  });

  const streams = [
    // 서비스별 파일 라우팅 (모든 레벨)
    {
      level: "debug" as pino.LevelWithSilent,
      stream: new ServiceRoutingStream(),
    },
    // 필터링된 콘솔 출력 (WARNING/ERROR + important INFO만)
    {
      level: "debug" as pino.LevelWithSilent,
      stream: new ConsoleFilterStream(prettyStream),
    },
  ];
  logger = pino(baseConfig, pino.multistream(streams));
} else {
  // 프로덕션: 서비스별 JSON 파일 저장 + 콘솔 경고
  const streams: pino.StreamEntry[] = [
    {
      level: "debug",
      stream: new ServiceRoutingStream(),
    },
  ];

  // 프로덕션 환경에서 WARNING/ERROR만 콘솔 출력
  if (NODE_ENV === "production") {
    streams.push({
      level: "warn",
      stream: process.stdout,
    });
  }

  logger = pino(baseConfig, pino.multistream(streams));
}

/**
 * 로거 인스턴스 내보내기
 */
export { logger };

/**
 * TypeScript 타입 내보내기
 */
export type Logger = pino.Logger;

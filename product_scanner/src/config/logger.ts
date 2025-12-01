/**
 * 로거 설정
 * Pino 기반 로깅 시스템
 *
 * 기능:
 * - 다중 출력 (콘솔 + 파일) - 동일 내용 출력
 * - 컨테이너별 로그 파일 분리 (SERVICE_NAME 환경변수 기반)
 * - 일일 로그 로테이션 (YYYYMMDD 형식)
 * - 환경별 설정
 * - 구조화된 JSON 로깅
 *
 * 콘솔 출력:
 * - LOG_LEVEL 이상 모두 출력 (파일과 동일)
 * - 개발 환경: pino-pretty 포맷 (색상)
 * - 프로덕션: JSON 포맷
 *
 * 파일 출력 (날짜별 디렉터리 + 컨테이너별 분리):
 * - logs/YYYY-MM-DD/server.log (API 서버)
 * - logs/YYYY-MM-DD/scheduler.log (스케줄러)
 * - logs/YYYY-MM-DD/worker-oliveyoung.log, worker-ably.log, ... (플랫폼별 Worker)
 * - logs/YYYY-MM-DD/error.log (에러 통합)
 * - 일일 로테이션, 90일 보관
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
const SERVICE_NAME = process.env.SERVICE_NAME || "server"; // 기본값: server

// 로그 디렉토리 생성 (없으면)
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o2777 });
}

// 로그 디렉토리 권한 강제 설정 (이미 존재하는 경우)
try {
  fs.chmodSync(LOG_DIR, 0o2777);
} catch (error) {
  // 권한 설정 실패 무시 (Docker 환경에서는 보통 성공)
}

/**
 * 날짜 디렉터리명 생성 (YYYY-MM-DD)
 */
function getDateDir(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 날짜별 디렉터리에 로그 파일 생성
 * 구조: LOG_DIR/YYYY-MM-DD/{prefix}.log
 */
function createRotatingStream(prefix: string) {
  const stream = createStream(
    () => {
      // 날짜 디렉터리 생성 (YYYY-MM-DD)
      const dateDir = getDateDir();
      const fullDir = path.join(LOG_DIR, dateDir);

      // 디렉터리 없으면 생성 (권한 0o777)
      if (!fs.existsSync(fullDir)) {
        fs.mkdirSync(fullDir, { recursive: true, mode: 0o777 });
      }

      // 파일 경로: YYYY-MM-DD/{prefix}.log
      return path.join(dateDir, `${prefix}.log`);
    },
    {
      interval: "1d", // 일일 로테이션
      intervalBoundary: true, // 자정(00:00) 기준 정렬
      initialRotation: true, // 시작 시 정확한 날짜 파일 생성
      immutable: true, // 과거 파일 수정 방지
      path: LOG_DIR,
      maxFiles: 90, // 90일 보관
      compress: false, // 압축 비활성화
      maxSize: "100M", // 100MB마다 로테이션
    },
  );

  // 파일 생성/로테이션 이벤트 감지 → 권한 변경 (666)
  stream.on("rotated", (filename: string | undefined) => {
    if (filename) {
      const filepath = path.join(LOG_DIR, filename);
      try {
        fs.chmodSync(filepath, 0o666);
      } catch (error) {
        // 권한 변경 실패 무시
      }
    }
  });

  // 초기 파일 생성시 권한 설정
  setImmediate(() => {
    try {
      const dateDir = getDateDir();
      const fullDir = path.join(LOG_DIR, dateDir);
      if (fs.existsSync(fullDir)) {
        const logFile = path.join(fullDir, `${prefix}.log`);
        if (fs.existsSync(logFile)) {
          fs.chmodSync(logFile, 0o666);
        }
      }
    } catch (error) {
      // 권한 변경 실패 무시
    }
  });

  return stream;
}

/**
 * 기본 로거 설정
 * SERVICE_NAME 환경변수로 서비스별 로그 파일 라우팅 제어
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
    service_name: SERVICE_NAME, // 서비스별 로그 파일 라우팅용
  },
};

/**
 * 서비스별 파일 스트림 맵 (동적 생성)
 * 컨테이너별로 개별 로그 파일 생성
 */
const serviceStreams = new Map<
  string,
  ReturnType<typeof createRotatingStream>
>();

/**
 * 서비스별 스트림 조회 또는 생성
 * 처음 요청 시 스트림 생성, 이후 캐싱된 스트림 반환
 */
function getOrCreateStream(
  serviceName: string,
): ReturnType<typeof createRotatingStream> {
  if (!serviceStreams.has(serviceName)) {
    serviceStreams.set(serviceName, createRotatingStream(serviceName));
  }
  return serviceStreams.get(serviceName)!;
}

// 에러 전용 스트림
const errorStream = createRotatingStream("error");

/**
 * 서비스별 라우팅 스트림 (커스텀 destination)
 * skip_file_log 플래그가 있는 로그는 파일에 저장하지 않음
 * 컨테이너별로 개별 로그 파일 생성 (worker-oliveyoung.log, worker-ably.log 등)
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

      // 서비스별 파일에 기록 (컨테이너별 개별 파일)
      const stream = getOrCreateStream(serviceName);
      stream.write(chunk);
    } catch (err) {
      // JSON 파싱 실패 시 server.log에 기록
      const serverStream = getOrCreateStream("server");
      serverStream.write(chunk);
    }
    return true;
  }
}

/**
 * Pino 로그 레벨 상수
 */
const LOG_LEVELS = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
} as const;

/**
 * 로그 필터 함수: LOG_LEVEL 이상 모두 출력 (파일/터미널 동일)
 */
const shouldLogToConsole = (level: number): boolean => {
  const levelThreshold =
    LOG_LEVEL === "debug"
      ? LOG_LEVELS.DEBUG
      : LOG_LEVEL === "info"
        ? LOG_LEVELS.INFO
        : LOG_LEVEL === "warn"
          ? LOG_LEVELS.WARN
          : LOG_LEVELS.ERROR;
  return level >= levelThreshold;
};

/**
 * 콘솔 출력 포맷터 타입
 */
type ConsoleFormatter = (logObj: Record<string, any>, level: number) => void;

/**
 * 개발 환경용 콘솔 포맷터 (색상 + 구조화)
 */
const formatConsolePretty: ConsoleFormatter = (logObj, level) => {
  // msg 필드에서 메시지 추출
  const msg = logObj.msg || "";
  const important = Boolean(logObj.important);
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  const levelColor =
    level >= LOG_LEVELS.ERROR
      ? "\x1b[31m"
      : level >= LOG_LEVELS.WARN
        ? "\x1b[33m"
        : "\x1b[32m";
  const levelText =
    level >= LOG_LEVELS.ERROR
      ? "ERROR"
      : level >= LOG_LEVELS.WARN
        ? "WARN"
        : "INFO";
  const star = important ? " ⭐" : "";

  // 메시지가 있을 때만 출력
  if (msg) {
    console.error(
      `[${time}] ${levelColor}${levelText}\x1b[0m${star} \x1b[36m${msg}\x1b[0m`,
    );
  } else {
    console.error(`[${time}] ${levelColor}${levelText}\x1b[0m${star}`);
  }

  // 추가 필드 출력
  const excludedFields = [
    "level",
    "time",
    "service",
    "env",
    "pid",
    "hostname",
    "msg",
    "important",
    "skip_file_log",
  ];
  const fields = Object.keys(logObj).filter((k) => !excludedFields.includes(k));

  fields.forEach((field) => {
    const value =
      typeof logObj[field] === "object"
        ? JSON.stringify(logObj[field], null, 2)
            .split("\n")
            .map((l) => "  " + l)
            .join("\n")
        : logObj[field];
    console.error(`  ${field}: ${value}`);
  });
};

/**
 * 프로덕션 환경용 콘솔 포맷터 (JSON)
 */
const formatConsoleJson: ConsoleFormatter = (logObj, level) => {
  console.log(JSON.stringify({ ...logObj, level }));
};

/**
 * 콘솔 출력 Hook 생성 함수
 */
function createConsoleHook(
  formatter: ConsoleFormatter,
): pino.LoggerOptions["hooks"] {
  return {
    logMethod(inputArgs, method, level) {
      // 파일 로그는 정상 처리
      method.apply(this, inputArgs);

      // 콘솔 출력 (필터링 적용)
      // Pino 형식: logger.info(obj, msg) 또는 logger.info(msg)
      const [first, second] = inputArgs;
      const logObj: Record<string, any> = {};

      if (typeof first === "string") {
        // logger.info("message") 형식
        logObj.msg = first;
      } else if (typeof first === "object" && first !== null) {
        // logger.info({ key: value }, "message") 형식
        Object.assign(logObj, first);
        if (typeof second === "string") {
          logObj.msg = second;
        }
      }

      if (shouldLogToConsole(level)) {
        formatter(logObj, level);
      }
    },
  };
}

/**
 * 메인 로거 인스턴스
 */
let logger: pino.Logger;

// 서비스별 파일 라우팅 스트림 (공통)
const streams: pino.StreamEntry[] = [
  {
    level: "debug" as const,
    stream: new ServiceRoutingStream(),
  },
];

if (NODE_ENV === "development" && LOG_PRETTY) {
  // 개발 환경: 색상 포맷
  const hooks = createConsoleHook(formatConsolePretty);
  logger = pino({ ...baseConfig, hooks }, pino.multistream(streams));
} else {
  // 프로덕션: JSON 포맷
  const hooks = createConsoleHook(formatConsoleJson);
  logger = pino({ ...baseConfig, hooks }, pino.multistream(streams));
}

/**
 * 로거 인스턴스 내보내기
 */
export { logger };

/**
 * TypeScript 타입 내보내기
 */
export type Logger = pino.Logger;

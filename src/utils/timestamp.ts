/**
 * 타임스탬프 유틸리티
 *
 * SOLID 원칙:
 * - SRP: 타임스탬프 생성만 담당
 * - OCP: 새로운 포맷 추가 가능
 */

/**
 * 타임존 정보가 포함된 타임스탬프 생성
 * ISO 8601 형식 (예: 2025-10-30T12:34:56.789+09:00)
 *
 * 특징:
 * - 시스템의 로컬 타임존 자동 감지 (TZ 환경 변수 사용)
 * - Docker 환경에서 TZ=Asia/Seoul 설정 시 +09:00 반영
 * - 밀리초 단위까지 기록
 *
 * @returns ISO 8601 형식의 타임스탬프 문자열
 */
export function getTimestampWithTimezone(): string {
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offset) / 60);
  const offsetMinutes = Math.abs(offset) % 60;
  const offsetSign = offset >= 0 ? "+" : "-";

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;
}

/**
 * Unix timestamp (밀리초) 반환
 * @returns Unix timestamp in milliseconds
 */
export function getUnixTimestamp(): number {
  return Date.now();
}

/**
 * YYYYMMDD 형식의 날짜 문자열 반환
 * @returns Date string in YYYYMMDD format
 */
export function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * YYYY-MM-DD 형식의 날짜 문자열 반환 (로컬 타임존 기준)
 * @returns Date string in YYYY-MM-DD format
 */
export function getDateStringWithDash(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

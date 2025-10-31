/**
 * Config Merger Utility
 *
 * SOLID 원칙:
 * - SRP: Config 병합 및 변수 치환만 담당
 * - OCP: 새로운 치환 규칙 추가 시 확장 가능
 *
 * 용도:
 * - Node Strategy Config와 Params 병합
 * - 템플릿 변수 치환 (${variable})
 */

/**
 * Config 병합 및 변수 치환
 *
 * @param config Node config (from workflow JSON)
 * @param params Runtime params (from context)
 * @returns Merged config with substituted variables
 *
 * @example
 * const config = { output_dir: "/app/results", filename: "job_${platform}_${job_id}.json" };
 * const params = { platform: "oliveyoung", job_id: "12345" };
 * const merged = mergeConfig(config, params);
 * // { output_dir: "/app/results", filename: "job_oliveyoung_12345.json" }
 */
export function mergeConfig<T = Record<string, unknown>>(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
): T {
  const merged: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    merged[key] = substituteVariables(value, params);
  }

  return merged as unknown as T;
}

/**
 * 변수 치환 (재귀적)
 *
 * @param value 치환할 값 (string, object, array)
 * @param params 치환에 사용할 파라미터
 * @returns 치환된 값
 *
 * 지원 형식:
 * - String: ${variable} → params[variable]
 * - Object: 재귀적 치환
 * - Array: 재귀적 치환
 */
export function substituteVariables(
  value: unknown,
  params: Record<string, unknown>,
): unknown {
  // String 치환
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}/g, (_, key) => {
      const replacement = params[key];
      return replacement !== undefined ? String(replacement) : `\${${key}}`;
    });
  }

  // Object 재귀 치환
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteVariables(val, params);
    }
    return result;
  }

  // Array 재귀 치환
  if (Array.isArray(value)) {
    return value.map((item) => substituteVariables(item, params));
  }

  // 기타 타입 (number, boolean, null 등)
  return value;
}

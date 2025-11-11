/**
 * A-bly 플랫폼 설정
 * SOLID 원칙:
 * - SRP: A-bly 플랫폼 설정 표현
 * - OCP: PlatformConfig 확장
 */

import { PlatformConfig } from "@/core/domain/PlatformConfig";

/**
 * A-bly 플랫폼 설정 타입
 */
export interface AblyConfig extends PlatformConfig {
  platform: "ably";
  name: string;
  baseUrl: string;
}

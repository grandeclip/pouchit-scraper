/**
 * Platform Scanner Module - Barrel Export
 *
 * Phase 4 ScanProductNode 리팩토링: 플랫폼별 스캐너 모듈
 *
 * 사용 예시:
 * ```typescript
 * import {
 *   PlatformScannerRegistry,
 *   type IPlatformScanner,
 *   type PlatformScanResult,
 * } from "@/scanners/platform";
 *
 * const registry = PlatformScannerRegistry.getInstance();
 * const scanner = registry.get("ably");
 * const result = await scanner.scan(url, page);
 * ```
 */

// Interfaces
export type {
  IPlatformScanner,
  PlatformScanResult,
  PlatformScannerFactory,
} from "./IPlatformScanner";

// Base Classes
export {
  BasePlatformScanner,
  type NormalizedSaleStatus,
} from "./BasePlatformScanner";
export { BrowserPlatformScanner } from "./BrowserPlatformScanner";

// Platform Implementations
export { AblyPlatformScanner } from "./impl/AblyPlatformScanner";
export { OliveyoungPlatformScanner } from "./impl/OliveyoungPlatformScanner";
export { KurlyPlatformScanner } from "./impl/KurlyPlatformScanner";
export { ApiPlatformScanner } from "./impl/ApiPlatformScanner";

// Registry
export { PlatformScannerRegistry } from "./PlatformScannerRegistry";

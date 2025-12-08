/**
 * Phase 4 Validation Nodes Barrel Export
 *
 * Step 4.9: Platform 설정 추가
 */

// Platform Configuration
export * from "./platform";

// Types
export type {
  // FetchProductNode
  FetchProductInput,
  FetchProductOutput,
  // ScanProductNode
  SingleScanResult,
  ScanProductInput,
  ScanProductOutput,
  // ValidateProductNode
  ValidationCheckResult,
  SingleValidationResult,
  ValidateProductInput,
  ValidateProductOutput,
  // CompareProductNode
  FieldComparison,
  SingleComparisonResult,
  CompareProductInput,
  CompareProductOutput,
  // SaveResultNode
  SaveResultInput,
  SaveResultOutput,
  // NotifyResultNode
  NotifyResultInput,
  NotifyResultOutput,
} from "./types";

// Nodes
export {
  FetchProductNode,
  type FetchProductNodeConfig,
} from "./FetchProductNode";

export { ScanProductNode, type ScanProductNodeConfig } from "./ScanProductNode";

export {
  ValidateProductNode,
  type ValidateProductNodeConfig,
} from "./ValidateProductNode";

export {
  CompareProductNode,
  type CompareProductNodeConfig,
} from "./CompareProductNode";

export { SaveResultNode, type SaveResultNodeConfig } from "./SaveResultNode";

export {
  NotifyResultNode,
  type NotifyResultNodeConfig,
  type INotificationChannel,
  type NotificationMessage,
} from "./NotifyResultNode";

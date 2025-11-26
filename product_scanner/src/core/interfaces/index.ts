/**
 * Core Interfaces Barrel Export
 *
 * Phase 4: Enhanced interfaces for typed workflow nodes
 */

// Legacy interfaces (backward compatibility)
export type { INodeStrategy, NodeContext, NodeResult } from "./INodeStrategy";

// Phase 4: Enhanced Node Context
export type {
  INodeContext,
  IPlatformConfig,
  NodeContextFactory,
} from "./INodeContext";
export { createNodeContext, toEnhancedContext } from "./INodeContext";

// Phase 4: Typed Node Strategy
export type {
  ITypedNodeStrategy,
  ITypedNodeResult,
  IValidationResult,
  INodeError,
  TypedNodeConstructor,
} from "./ITypedNodeStrategy";
export {
  createSuccessResult,
  createErrorResult,
  validationSuccess,
  validationFailure,
} from "./ITypedNodeStrategy";

// Other interfaces
export type { IExtractor } from "./IExtractor";
export type { IProduct } from "./IProduct";
export type { IProductRepository } from "./IProductRepository";
export type { IProductSearchService } from "./IProductSearchService";
export type { IScanner } from "./IScanner";
export type { IValidator } from "./IValidator";

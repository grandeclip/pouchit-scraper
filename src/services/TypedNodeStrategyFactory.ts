/**
 * Typed Node Strategy Factory (Phase 4)
 *
 * SOLID 원칙:
 * - SRP: Phase 4 Typed Node 인스턴스 생성만 담당
 * - OCP: 새로운 Typed Node 추가 시 확장
 * - DIP: ITypedNodeStrategy 인터페이스에 의존
 *
 * 목적:
 * - Phase 4 타입 안전한 노드 인스턴스 관리
 * - 기존 NodeStrategyFactory와 분리된 Phase 4 노드 팩토리
 * - 파이프라인 구성 시 노드 조회
 */

import { ITypedNodeStrategy } from "@/core/interfaces/ITypedNodeStrategy";
import {
  FetchProductNode,
  ScanProductNode,
  ValidateProductNode,
  CompareProductNode,
  SaveResultNode,
  NotifyResultNode,
} from "@/strategies/validation";
import {
  ExtractUrlNode,
  ExtractProductSetNode,
  ExtractProductNode,
} from "@/strategies/extract";
import { UpdateProductSetNode } from "@/strategies/update/UpdateProductSetNode";
import { CollaboBannerMonitorNode } from "@/strategies/monitor/CollaboBannerMonitorNode";
import { VotesMonitorNode } from "@/strategies/monitor/VotesMonitorNode";
import { PickSectionsMonitorNode } from "@/strategies/monitor/PickSectionsMonitorNode";
import {
  DailySyncInitNode,
  DailySyncBatchNode,
  DailySyncNotifyNode,
} from "@/strategies/daily-sync";
import { logger } from "@/config/logger";

/**
 * Typed Node Strategy Entry
 */
interface TypedNodeEntry {
  type: string;
  name: string;
  factory: () => ITypedNodeStrategy<unknown, unknown>;
}

/**
 * Typed Node Strategy Factory
 *
 * Phase 4 타입드 노드 인스턴스 생성
 */
export class TypedNodeStrategyFactory {
  private registry: Map<string, TypedNodeEntry> = new Map();

  constructor() {
    // Phase 4 Validation Pipeline 노드 등록
    this.registerTypedNode(
      "fetch_product",
      "FetchProductNode",
      () => new FetchProductNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "scan_product",
      "ScanProductNode",
      () => new ScanProductNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "validate_product",
      "ValidateProductNode",
      () => new ValidateProductNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "compare_product",
      "CompareProductNode",
      () => new CompareProductNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "save_result",
      "SaveResultNode",
      () => new SaveResultNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "notify_result",
      "NotifyResultNode",
      () => new NotifyResultNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    // Phase 4 Extract Pipeline 노드 등록
    this.registerTypedNode(
      "extract_url",
      "ExtractUrlNode",
      () => new ExtractUrlNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "extract_product_set",
      "ExtractProductSetNode",
      () => new ExtractProductSetNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "extract_product",
      "ExtractProductNode",
      () => new ExtractProductNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    // Phase 4 Update Pipeline 노드 등록
    this.registerTypedNode(
      "update_product_set",
      "UpdateProductSetNode",
      () => new UpdateProductSetNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    // Phase 4 Monitor Pipeline 노드 등록
    this.registerTypedNode(
      "collabo_banner_monitor",
      "CollaboBannerMonitorNode",
      () =>
        new CollaboBannerMonitorNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "votes_monitor",
      "VotesMonitorNode",
      () => new VotesMonitorNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "pick_sections_monitor",
      "PickSectionsMonitorNode",
      () =>
        new PickSectionsMonitorNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    // Daily Sync Pipeline 노드 등록
    this.registerTypedNode(
      "daily_sync_init",
      "DailySyncInitNode",
      () => new DailySyncInitNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "daily_sync_batch",
      "DailySyncBatchNode",
      () => new DailySyncBatchNode() as ITypedNodeStrategy<unknown, unknown>,
    );

    this.registerTypedNode(
      "daily_sync_notify",
      "DailySyncNotifyNode",
      () => new DailySyncNotifyNode() as ITypedNodeStrategy<unknown, unknown>,
    );
  }

  /**
   * Typed Node 등록
   * @param type Node 타입
   * @param name Node 이름
   * @param factory Node 팩토리 함수
   */
  private registerTypedNode(
    type: string,
    name: string,
    factory: () => ITypedNodeStrategy<unknown, unknown>,
  ): void {
    this.registry.set(type, { type, name, factory });
    logger.debug({ type, name }, "TypedNode 등록 완료");
  }

  /**
   * Typed Node Strategy 생성
   * @param type Node 타입
   * @returns Typed Node Strategy 인스턴스
   * @throws Error 지원하지 않는 타입인 경우
   */
  createTypedNode<TInput, TOutput>(
    type: string,
  ): ITypedNodeStrategy<TInput, TOutput> {
    const entry = this.registry.get(type);

    if (!entry) {
      throw new Error(
        `Unknown typed node type: ${type}. Available types: ${Array.from(
          this.registry.keys(),
        ).join(", ")}`,
      );
    }

    return entry.factory() as ITypedNodeStrategy<TInput, TOutput>;
  }

  /**
   * Typed Node 타입 존재 여부 확인
   * @param type Node 타입
   * @returns 존재 여부
   */
  hasType(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * 사용 가능한 Typed Node 타입 목록
   * @returns Node 타입 배열
   */
  getAvailableTypes(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * 사용 가능한 Typed Node 정보 목록
   * @returns Node 정보 배열
   */
  getAvailableNodes(): Array<{ type: string; name: string }> {
    return Array.from(this.registry.values()).map(({ type, name }) => ({
      type,
      name,
    }));
  }
}

/**
 * Singleton 인스턴스
 */
let instance: TypedNodeStrategyFactory | null = null;

/**
 * TypedNodeStrategyFactory 싱글톤 인스턴스 조회
 */
export function getTypedNodeStrategyFactory(): TypedNodeStrategyFactory {
  if (!instance) {
    instance = new TypedNodeStrategyFactory();
  }
  return instance;
}

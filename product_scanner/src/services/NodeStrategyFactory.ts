/**
 * Node Strategy Factory
 * Factory Pattern 구현
 *
 * SOLID 원칙:
 * - SRP: Node 인스턴스 생성만 담당
 * - OCP: 새로운 Node 타입 추가 시 확장
 * - DIP: INodeStrategy 인터페이스에 의존
 */

import { INodeStrategy } from "@/core/interfaces/INodeStrategy";
import { SupabaseSearchNode } from "@/strategies/SupabaseSearchNode";
import { HwahaeValidationNode } from "@/strategies/HwahaeValidationNode";
import { ResultWriterNode } from "@/strategies/ResultWriterNode";

/**
 * Node Strategy Factory
 * Node 타입별 Strategy 인스턴스 생성
 */
export class NodeStrategyFactory {
  private strategies: Map<string, INodeStrategy> = new Map();

  constructor() {
    // 사용 가능한 Node Strategy 등록
    this.registerStrategy(new SupabaseSearchNode());
    this.registerStrategy(new HwahaeValidationNode());
    this.registerStrategy(new ResultWriterNode());
  }

  /**
   * Strategy 등록
   * @param strategy Node Strategy 인스턴스
   */
  private registerStrategy(strategy: INodeStrategy): void {
    this.strategies.set(strategy.type, strategy);
    console.log(`[Factory] Registered strategy: ${strategy.type}`);
  }

  /**
   * Node Strategy 생성
   * @param type Node 타입
   * @returns Node Strategy 인스턴스
   * @throws Error 지원하지 않는 타입인 경우
   */
  createNode(type: string): INodeStrategy {
    const strategy = this.strategies.get(type);

    if (!strategy) {
      throw new Error(
        `Unknown node type: ${type}. Available types: ${Array.from(
          this.strategies.keys(),
        ).join(", ")}`,
      );
    }

    return strategy;
  }

  /**
   * 사용 가능한 Node 타입 목록
   * @returns Node 타입 배열
   */
  getAvailableTypes(): string[] {
    return Array.from(this.strategies.keys());
  }
}

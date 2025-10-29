/**
 * Workflow Loader 서비스
 *
 * SOLID 원칙:
 * - SRP: Workflow JSON 파일 로딩 및 검증만 담당
 * - OCP: 새로운 검증 규칙 추가 시 확장 가능
 */

import fs from "fs/promises";
import path from "path";
import Ajv from "ajv";
import { WorkflowDefinition } from "@/core/domain/Workflow";

/**
 * Workflow JSON Schema
 */
const workflowSchema = {
  type: "object",
  properties: {
    workflow_id: { type: "string" },
    name: { type: "string" },
    version: { type: "string" },
    description: { type: "string" },
    start_node: { type: "string" },
    nodes: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          type: { type: "string" },
          name: { type: "string" },
          config: { type: "object" },
          next_node: { type: ["string", "null"] },
          retry: {
            type: "object",
            properties: {
              max_attempts: { type: "number" },
              backoff_ms: { type: "number" },
            },
            required: ["max_attempts", "backoff_ms"],
          },
          timeout_ms: { type: "number" },
        },
        required: ["type", "name", "config", "next_node"],
      },
    },
    defaults: { type: "object" },
    metadata: { type: "object" },
  },
  required: ["workflow_id", "name", "version", "start_node", "nodes"],
  additionalProperties: false,
};

/**
 * Workflow Loader 서비스
 */
export class WorkflowLoaderService {
  private ajv: Ajv;
  private cache: Map<string, WorkflowDefinition> = new Map();
  private workflowDir: string;

  constructor(workflowDir?: string) {
    this.ajv = new Ajv({ allErrors: true });
    this.workflowDir =
      workflowDir || path.resolve(__dirname, "../../workflows");
  }

  /**
   * Workflow 로딩
   * @param workflowId Workflow ID
   * @returns Workflow 정의
   */
  async loadWorkflow(workflowId: string): Promise<WorkflowDefinition> {
    console.log(`[WorkflowLoader] Loading workflow: ${workflowId}`);

    // 캐시 확인
    if (this.cache.has(workflowId)) {
      console.log(`[WorkflowLoader] Cache hit: ${workflowId}`);
      return this.cache.get(workflowId)!;
    }

    // 파일 읽기
    const filePath = path.join(this.workflowDir, `${workflowId}.json`);

    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      throw new Error(`Workflow file not found: ${workflowId} (${filePath})`);
    }

    // JSON 파싱
    let workflow: WorkflowDefinition;
    try {
      workflow = JSON.parse(fileContent) as WorkflowDefinition;
    } catch (error) {
      throw new Error(
        `Invalid JSON in workflow file: ${workflowId} - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // 스키마 검증
    this.validateSchema(workflow);

    // 구조 검증
    this.validateStructure(workflow);

    // 캐시 저장
    this.cache.set(workflowId, workflow);

    console.log(`[WorkflowLoader] Workflow loaded successfully: ${workflowId}`);

    return workflow;
  }

  /**
   * 사용 가능한 Workflow 목록 조회
   * @returns Workflow ID 배열
   */
  async listWorkflows(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.workflowDir);
      return files
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.replace(".json", ""));
    } catch (error) {
      console.error("[WorkflowLoader] Failed to list workflows:", error);
      return [];
    }
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Workflow 재로딩 (캐시 무시)
   * @param workflowId Workflow ID
   * @returns Workflow 정의
   */
  async reloadWorkflow(workflowId: string): Promise<WorkflowDefinition> {
    this.cache.delete(workflowId);
    return await this.loadWorkflow(workflowId);
  }

  /**
   * JSON 스키마 검증
   */
  private validateSchema(workflow: WorkflowDefinition): void {
    const validate = this.ajv.compile(workflowSchema);
    const valid = validate(workflow);

    if (!valid) {
      const errors = validate.errors
        ?.map((err) => `${err.instancePath} ${err.message}`)
        .join(", ");
      throw new Error(`Workflow schema validation failed: ${errors}`);
    }
  }

  /**
   * Workflow 구조 검증
   */
  private validateStructure(workflow: WorkflowDefinition): void {
    const { start_node, nodes } = workflow;

    // 시작 노드 존재 확인
    if (!nodes[start_node]) {
      throw new Error(`Start node '${start_node}' not found in workflow`);
    }

    // next_node 참조 검증
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (node.next_node !== null && !nodes[node.next_node]) {
        throw new Error(
          `Node '${nodeId}' references non-existent next node '${node.next_node}'`,
        );
      }
    }

    // 도달 불가능한 노드 검증
    const reachableNodes = new Set<string>();
    this.collectReachableNodes(start_node, nodes, reachableNodes);

    const unreachableNodes = Object.keys(nodes).filter(
      (nodeId) => !reachableNodes.has(nodeId),
    );

    if (unreachableNodes.length > 0) {
      throw new Error(
        `Unreachable nodes detected: ${unreachableNodes.join(", ")}`,
      );
    }

    // 순환 참조 경고
    const hasCycle = this.detectCycle(start_node, nodes);
    if (hasCycle) {
      console.warn(
        `[WorkflowLoader] Warning: Cycle detected in workflow '${workflow.workflow_id}'`,
      );
    }
  }

  /**
   * 도달 가능한 노드 수집
   */
  private collectReachableNodes(
    nodeId: string,
    nodes: WorkflowDefinition["nodes"],
    reachable: Set<string>,
  ): void {
    if (reachable.has(nodeId)) {
      return;
    }

    reachable.add(nodeId);

    const node = nodes[nodeId];
    if (node && node.next_node) {
      this.collectReachableNodes(node.next_node, nodes, reachable);
    }
  }

  /**
   * 순환 참조 탐지
   */
  private detectCycle(
    startNode: string,
    nodes: WorkflowDefinition["nodes"],
  ): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = nodes[nodeId];
      if (node && node.next_node) {
        if (!visited.has(node.next_node)) {
          if (dfs(node.next_node)) {
            return true;
          }
        } else if (recursionStack.has(node.next_node)) {
          return true; // 순환 탐지
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    return dfs(startNode);
  }
}

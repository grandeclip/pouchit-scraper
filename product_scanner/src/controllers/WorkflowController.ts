/**
 * Workflow 컨트롤러
 * HTTP 요청 처리
 *
 * SOLID 원칙:
 * - SRP: HTTP 요청/응답 변환만 담당
 * - DIP: IWorkflowService 인터페이스에 의존
 */

import { Request, Response } from "express";
import { IWorkflowService } from "@/core/interfaces/IWorkflowService";
import { WorkflowExecutionService } from "@/services/WorkflowExecutionService";
import { JobPriority } from "@/core/domain/Workflow";

/**
 * Workflow 컨트롤러
 */
export class WorkflowController {
  private service: IWorkflowService;

  constructor(service?: IWorkflowService) {
    // Dependency Injection (테스트 가능하도록)
    this.service = service || new WorkflowExecutionService();
  }

  /**
   * POST /api/workflows/execute
   * 워크플로우 실행
   */
  async execute(req: Request, res: Response): Promise<void> {
    try {
      const { workflow_id, params, priority, metadata } = req.body;

      // 요청 검증
      if (!workflow_id) {
        res.status(400).json({
          success: false,
          error: "workflow_id is required",
        });
        return;
      }

      if (!params || typeof params !== "object") {
        res.status(400).json({
          success: false,
          error: "params must be an object",
        });
        return;
      }

      // 워크플로우 실행
      const jobId = await this.service.executeWorkflow({
        workflow_id,
        params,
        priority: priority || JobPriority.NORMAL,
        metadata: metadata || {},
      });

      // 응답
      res.status(202).json({
        success: true,
        job_id: jobId,
        message: "Workflow execution started",
      });
    } catch (error) {
      console.error("[Controller] execute error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /api/workflows/jobs/:jobId
   * Job 상태 조회
   */
  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;

      // Job 상태 조회
      const status = await this.service.getJobStatus(jobId);

      if (!status) {
        res.status(404).json({
          success: false,
          error: "Job not found",
        });
        return;
      }

      // 응답
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error("[Controller] getJobStatus error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /api/workflows
   * 사용 가능한 워크플로우 목록 조회
   */
  async listWorkflows(req: Request, res: Response): Promise<void> {
    try {
      const workflows = await this.service.listWorkflows();

      res.status(200).json({
        success: true,
        count: workflows.length,
        data: workflows,
      });
    } catch (error) {
      console.error("[Controller] listWorkflows error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * GET /api/workflows/health
   * 서비스 상태 확인
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const healthy = await this.service.healthCheck();

      if (healthy) {
        res.status(200).json({
          success: true,
          message: "Workflow service is healthy",
        });
      } else {
        res.status(503).json({
          success: false,
          error: "Workflow service is unhealthy",
        });
      }
    } catch (error) {
      console.error("[Controller] healthCheck error:", error);
      res.status(503).json({
        success: false,
        error: error instanceof Error ? error.message : "Service unavailable",
      });
    }
  }
}

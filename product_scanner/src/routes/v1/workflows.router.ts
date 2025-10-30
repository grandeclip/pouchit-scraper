/**
 * 워크플로우 라우터
 * POST/GET /api/v1/workflows/* - 워크플로우 실행/조회
 */

import { Router, Request, Response } from "express";
import { WorkflowController } from "@/controllers/WorkflowController";

const router = Router();
const workflowController = new WorkflowController();

/**
 * POST /api/v1/workflows/execute
 * 워크플로우 실행
 */
router.post("/execute", (req: Request, res: Response) =>
  workflowController.execute(req, res),
);

/**
 * GET /api/v1/workflows/jobs/:jobId
 * Job 상태 조회
 */
router.get("/jobs/:jobId", (req: Request, res: Response) =>
  workflowController.getJobStatus(req, res),
);

/**
 * GET /api/v1/workflows
 * 워크플로우 목록 조회
 */
router.get("/", (req: Request, res: Response) =>
  workflowController.listWorkflows(req, res),
);

/**
 * GET /api/v1/workflows/health
 * 워크플로우 헬스체크
 */
router.get("/health", (req: Request, res: Response) =>
  workflowController.healthCheck(req, res),
);

export default router;

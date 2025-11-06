/**
 * Screenshot Service
 *
 * SOLID 원칙:
 * - SRP: 스크린샷 저장만 담당
 * - OCP: 다양한 저장 전략 확장 가능
 *
 * 목적:
 * - ValidationNode에서 스크린샷 로직 분리
 * - 플랫폼별 저장 경로 통일
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { Page } from "playwright";
import { logger } from "@/config/logger";

/**
 * 스크린샷 메타데이터
 */
export interface ScreenshotMetadata {
  platform: string;
  jobId: string;
  productSetId: string;
  outputDir?: string;
}

/**
 * Screenshot Service
 */
export class ScreenshotService {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir =
      outputDir || process.env.SCREENSHOT_OUTPUT_DIR || "/app/results";
  }

  /**
   * 스크린샷 저장
   * 경로: outputDir/YYYY-MM-DD/platform/jobId/{product_set_id}.png
   */
  async capture(
    page: Page | null,
    metadata: ScreenshotMetadata,
  ): Promise<void> {
    if (!page) {
      return;
    }

    try {
      // 페이지 렌더링 완료 대기 (1초)
      await page.waitForTimeout(1000);

      const { platform, jobId, productSetId } = metadata;
      const outputDir = metadata.outputDir || this.outputDir;

      // 오늘 날짜 폴더명 (YYYY-MM-DD)
      const today = new Date().toISOString().split("T")[0];

      // 디렉토리 생성: outputDir/YYYY-MM-DD/platform/jobId/
      const jobDir = path.join(outputDir, today, platform, jobId);
      await fs.mkdir(jobDir, { recursive: true });

      // 파일명: {product_set_id}.png
      const filename = `${productSetId}.png`;
      const filepath = path.join(jobDir, filename);

      // 스크린샷 저장 (viewport 크기만 캡처)
      await page.screenshot({
        path: filepath,
        fullPage: false, // 화면 크기만 캡처 (전체 페이지 X)
      });

      logger.debug({ filepath, productSetId, platform }, "스크린샷 저장 완료");
    } catch (error) {
      // 스크린샷 실패는 무시 (원래 작업에 영향 주지 않음)
      logger.warn(
        { error, productSetId: metadata.productSetId },
        "스크린샷 저장 실패 - 무시",
      );
    }
  }

  /**
   * 출력 디렉토리 변경
   */
  setOutputDir(outputDir: string): void {
    this.outputDir = outputDir;
  }

  /**
   * 현재 출력 디렉토리 조회
   */
  getOutputDir(): string {
    return this.outputDir;
  }
}

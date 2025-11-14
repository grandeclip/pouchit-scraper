/**
 * JSONL Parser Utility
 *
 * Workflow validation 결과 JSONL 파일 파싱 및 업데이트 데이터 추출
 */

import * as fs from "fs/promises";
import { getTimestampWithTimezone } from "@/utils/timestamp";
import type { ProductUpdateData } from "@/core/interfaces/IProductUpdateRepository";

/**
 * JSONL 검증 결과 레코드 구조
 */
export interface ProductValidationResult {
  /** 상품 세트 ID */
  product_set_id: string;

  /** 상품 ID */
  product_id: string;

  /** 상품 URL */
  url: string;

  /** DB 데이터 */
  db: {
    product_name?: string | null;
    thumbnail?: string | null;
    original_price?: number | null;
    discounted_price?: number | null;
    sale_status?: string | null;
  };

  /** Fetch 데이터 (실제 크롤링 결과) */
  fetch?: {
    product_name?: string | null;
    thumbnail?: string | null;
    original_price?: number | null;
    discounted_price?: number | null;
    sale_status?: string | null;
  };

  /** 비교 결과 */
  comparison?: {
    product_name?: boolean;
    thumbnail?: boolean;
    original_price?: boolean;
    discounted_price?: boolean;
    sale_status?: boolean;
  };

  /** 전체 매칭 여부 (모든 필드 일치 시 true) */
  match: boolean;

  /** 검증 상태 */
  status: "success" | "failed" | "not_found";

  /** 검증 완료 시각 */
  validated_at: string;

  /** 메타데이터 플래그 */
  _meta?: boolean;

  /** 메타데이터 타입 (header/footer) */
  type?: string;
}

/**
 * JSONL Parser
 *
 * Validation 결과 파일을 파싱하고 업데이트 대상 데이터를 추출합니다.
 */
export class JsonlParser {
  /**
   * JSONL 파일 파싱 (header/footer 제외)
   *
   * @param filePath JSONL 파일 경로
   * @returns 검증 결과 배열
   * @throws 파일 읽기/파싱 실패 시 에러
   */
  static async parseValidationResults(
    filePath: string,
  ): Promise<ProductValidationResult[]> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const results: ProductValidationResult[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        const record = JSON.parse(line) as ProductValidationResult;

        // Skip header/footer metadata
        if (record._meta) continue;

        results.push(record);
      }

      return results;
    } catch (error) {
      throw new Error(
        `JSONL 파싱 실패 (${filePath}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * 변경 감지된 항목만 추출
   *
   * - status: "success" (성공한 검증만)
   * - match: false (변경 감지된 항목만)
   * - sale_status는 제외 (업데이트 정책 미정)
   *
   * @param results 검증 결과 배열
   * @returns 업데이트할 데이터 배열
   */
  static extractUpdates(
    results: ProductValidationResult[],
  ): ProductUpdateData[] {
    return results
      .filter((r) => r.status === "success" && !r.match) // 변경 감지된 항목만
      .map((r) => {
        const updates: ProductUpdateData = {
          product_set_id: r.product_set_id,
          updated_at: getTimestampWithTimezone(),
        };

        // fetch 데이터가 없으면 스킵
        if (!r.fetch) return updates;

        // 변경된 필드만 포함 (comparison 기준)
        if (r.comparison?.product_name === false) {
          updates.product_name = r.fetch.product_name ?? null;
        }

        if (r.comparison?.thumbnail === false) {
          updates.thumbnail = r.fetch.thumbnail ?? null;
        }

        if (r.comparison?.original_price === false) {
          updates.original_price = r.fetch.original_price ?? null;
        }

        if (r.comparison?.discounted_price === false) {
          updates.discounted_price = r.fetch.discounted_price ?? null;
        }

        // sale_status는 제외 (정책 미정)
        // if (r.comparison?.sale_status === false) {
        //   updates.sale_status = r.fetch.sale_status ?? null;
        // }

        return updates;
      });
  }

  /**
   * JSONL 파일에서 업데이트 데이터 추출 (통합 메서드)
   *
   * @param filePath JSONL 파일 경로
   * @returns 업데이트할 데이터 배열
   */
  static async extractUpdatesFromFile(
    filePath: string,
  ): Promise<ProductUpdateData[]> {
    const results = await this.parseValidationResults(filePath);
    return this.extractUpdates(results);
  }
}

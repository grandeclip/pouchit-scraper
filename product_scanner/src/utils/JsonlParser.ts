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
 * Supabase sale_status 허용 값
 * - "on_sale": 판매중
 * - "off_sale": 판매중지, 품절, 재고부족 등 모든 비판매 상태
 */
type SupabaseSaleStatus = "on_sale" | "off_sale";

/**
 * sale_status 정규화 함수
 *
 * 다양한 플랫폼별 sale_status 값을 Supabase 표준 값으로 변환
 * - "on_sale" → "on_sale"
 * - 그 외 모든 값 (sold_out, off_sale, 품절, 재고부족 등) → "off_sale"
 *
 * @param rawStatus 원본 sale_status 값
 * @returns 정규화된 sale_status ("on_sale" | "off_sale")
 */
function normalizeSaleStatus(rawStatus: string | null): SupabaseSaleStatus {
  if (!rawStatus) return "off_sale";

  const normalized = rawStatus.toLowerCase().trim();

  // "on_sale" 또는 판매중으로 판단되는 값들
  const onSaleValues = ["on_sale", "onsale", "판매중", "selling", "available"];

  if (onSaleValues.includes(normalized)) {
    return "on_sale";
  }

  // 그 외 모든 값은 "off_sale" (sold_out, off_sale, 품절, 재고부족 등)
  return "off_sale";
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
   * - fetch: null이 아닌 경우만 (실패한 경우 스킵)
   * - sale_status는 제외 (업데이트 정책 미정)
   *
   * @param results 검증 결과 배열
   * @returns 업데이트할 데이터 배열
   */
  static extractUpdates(
    results: ProductValidationResult[],
  ): ProductUpdateData[] {
    return results
      .filter((r) => {
        // 변경 감지된 항목만
        if (r.status !== "success" || r.match) return false;

        // fetch 데이터가 null이면 스킵 (실패한 경우)
        if (!r.fetch) return false;

        return true;
      })
      .map((r) => {
        const updates: ProductUpdateData = {
          product_set_id: r.product_set_id,
          updated_at: getTimestampWithTimezone(),
        };

        // 변경된 필드만 포함 (comparison 기준)
        if (r.comparison?.product_name === false) {
          updates.product_name = r.fetch!.product_name ?? null;
        }

        if (r.comparison?.thumbnail === false) {
          updates.thumbnail = r.fetch!.thumbnail ?? null;
        }

        // 가격 필드 방어 로직: 0원인 경우 업데이트 제외
        // TODO: history_product_review 테이블에 가격 0 케이스 기록 필요
        if (r.comparison?.original_price === false) {
          const fetchPrice = r.fetch!.original_price;
          if (fetchPrice !== null && fetchPrice !== 0) {
            updates.original_price = fetchPrice;
          } else if (fetchPrice === 0) {
            // fetchPrice === 0 → 업데이트 제외 (의심스러운 데이터)
            // DEBUG 레벨 로깅 (필요 시 활성화)
            // console.debug(`[JsonlParser] 가격 0원 필터링: ${r.product_set_id}, field: original_price`);
          }
        }

        if (r.comparison?.discounted_price === false) {
          const fetchPrice = r.fetch!.discounted_price;
          if (fetchPrice !== null && fetchPrice !== 0) {
            updates.discounted_price = fetchPrice;
          } else if (fetchPrice === 0) {
            // fetchPrice === 0 → 업데이트 제외 (의심스러운 데이터)
            // DEBUG 레벨 로깅 (필요 시 활성화)
            // console.debug(`[JsonlParser] 가격 0원 필터링: ${r.product_set_id}, field: discounted_price`);
          }
        }

        // sale_status: 변경 감지 시 정규화하여 포함
        if (r.comparison?.sale_status === false) {
          const rawStatus = r.fetch!.sale_status ?? null;
          updates.sale_status = normalizeSaleStatus(rawStatus);
        }

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

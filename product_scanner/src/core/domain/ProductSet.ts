/**
 * ProductSet 도메인 모델
 *
 * SOLID 원칙:
 * - SRP: product_sets 테이블 데이터만 표현
 * - 불변 객체 (Value Object 패턴)
 */

import { z } from "zod";
import { SaleStatus } from "@/core/interfaces/IProduct";

/**
 * 빈 문자열을 null로 변환하는 전처리기
 * DB에서 빈 문자열("")로 저장된 값을 null로 정규화
 */
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === "" ? null : val), schema);

/**
 * ProductSet Zod 스키마
 *
 * Note: product_set_id와 product_id는 UUID 문자열입니다.
 * Note: 대부분의 필드가 nullable입니다 (데이터 안정성 보장)
 * Note: 빈 문자열("")은 null로 변환됩니다 (emptyToNull 전처리)
 *
 * Test Columns (LLM Product Labeling):
 * - test_normalized_product_name: normalized_product_name의 테스트용 복사본
 * - test_label: label의 테스트용 복사본
 * - 이 컬럼들은 Gemini API 기반 LLM 라벨링 시스템 테스트에 사용됩니다.
 * - 테스트 완료 후 실제 컬럼(normalized_product_name, label)으로 대체됩니다.
 */
export const ProductSetSchema = z.object({
  product_set_id: z.string().uuid(),
  product_id: z.string().uuid(),
  platform_id: z.coerce.number().optional().nullable(),
  product_name: emptyToNull(z.string().nullable()),
  link_url: emptyToNull(z.string().url().nullable()),
  md_pick: z.boolean().optional().nullable(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
  thumbnail: emptyToNull(z.string().url().optional().nullable()),
  normalized_product_name: emptyToNull(z.string().optional().nullable()),
  label: emptyToNull(z.string().optional().nullable()),
  volume: z.coerce.number().optional().nullable(),
  volume_unit: emptyToNull(z.string().optional().nullable()),
  sale_status: emptyToNull(z.string().optional().nullable()),
  original_price: z.coerce.number().optional().nullable(),
  discounted_price: z.coerce.number().optional().nullable(),
  mobile_link_url: emptyToNull(z.string().url().optional().nullable()),
  // Test columns for LLM Product Labeling (Gemini API)
  test_normalized_product_name: emptyToNull(z.string().optional().nullable()),
  test_label: emptyToNull(z.string().optional().nullable()),
});

/**
 * ProductSet 타입 (스키마로부터 추론)
 */
export type ProductSet = z.infer<typeof ProductSetSchema>;

/**
 * ProductSet 검색 결과 (응답용 선택 필드)
 */
export interface ProductSetSearchResult {
  product_set_id: string; // UUID
  product_id: string; // UUID
  product_name: string | null;
  link_url: string | null; // Validation에서 URL로 사용됨
  thumbnail?: string | null;
  sale_status?: string | null;
  original_price?: number | null;
  discounted_price?: number | null;
}

/**
 * ProductSet 검색 요청
 */
export interface ProductSetSearchRequest {
  link_url_pattern?: string; // ILIKE 검색용
  sale_status?: string; // = 검색용
  product_id?: string; // UUID (Multi-Platform 조회용)
  limit?: number; // 결과 개수 제한 (기본값: 3)
}

/**
 * ProductSet 도메인 엔티티
 */
export class ProductSetEntity {
  constructor(
    public readonly product_set_id: string, // UUID
    public readonly product_id: string, // UUID
    public readonly product_name: string | null,
    public readonly link_url: string | null,
    public readonly thumbnail?: string | null,
    public readonly sale_status?: string | null,
    public readonly original_price?: number | null,
    public readonly discounted_price?: number | null,
  ) {
    this.validate();
  }

  private validate(): void {
    // UUID 형식 검증은 Zod에서 수행되므로 여기서는 생략
    if (!this.product_set_id) {
      throw new Error("product_set_id is required");
    }
    if (!this.product_id) {
      throw new Error("product_id is required");
    }
    // product_name과 link_url은 nullable이므로 검증하지 않음
    if (this.original_price && this.original_price < 0) {
      throw new Error("original_price must be >= 0");
    }
    if (this.discounted_price && this.discounted_price < 0) {
      throw new Error("discounted_price must be >= 0");
    }
  }

  /**
   * 할인율 계산
   */
  getDiscountRate(): number {
    if (
      !this.original_price ||
      !this.discounted_price ||
      this.original_price === 0
    ) {
      return 0;
    }
    return Math.round(
      ((this.original_price - this.discounted_price) / this.original_price) *
        100,
    );
  }

  /**
   * 도메인 객체를 검색 결과로 변환
   */
  toSearchResult(): ProductSetSearchResult {
    return {
      product_set_id: this.product_set_id,
      product_id: this.product_id,
      product_name: this.product_name,
      link_url: this.link_url,
      thumbnail: this.thumbnail,
      sale_status: this.sale_status,
      original_price: this.original_price,
      discounted_price: this.discounted_price,
    };
  }

  /**
   * 팩토리 메서드: DB 레코드로부터 ProductSetEntity 생성
   */
  static fromDbRecord(record: ProductSet): ProductSetEntity {
    return new ProductSetEntity(
      record.product_set_id,
      record.product_id,
      record.product_name,
      record.link_url,
      record.thumbnail,
      record.sale_status,
      record.original_price,
      record.discounted_price,
    );
  }

  /**
   * 팩토리 메서드: 일반 객체로부터 ProductSetEntity 생성
   */
  static fromPlainObject(obj: any): ProductSetEntity {
    return new ProductSetEntity(
      obj.product_set_id,
      obj.product_id,
      obj.product_name,
      obj.link_url,
      obj.thumbnail,
      obj.sale_status,
      obj.original_price,
      obj.discounted_price,
    );
  }
}

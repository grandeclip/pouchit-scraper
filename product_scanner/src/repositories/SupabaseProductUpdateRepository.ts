/**
 * Supabase Product Update Repository
 *
 * product_sets 테이블 업데이트 전용 Repository
 *
 * SOLID 원칙:
 * - SRP: 상품 업데이트만 담당
 * - DIP: IProductUpdateRepository 인터페이스 구현
 * - OCP: 새로운 저장소 추가 시 이 코드는 수정하지 않음
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 업데이트 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  IProductUpdateRepository,
  ProductUpdateData,
  BatchUpdateResult,
} from "@/core/interfaces/IProductUpdateRepository";
import { DATABASE_CONFIG, UPDATE_CONFIG } from "@/config/constants";
import { logger } from "@/config/logger";

/**
 * Supabase Product Update Repository
 */
export class SupabaseProductUpdateRepository
  implements IProductUpdateRepository
{
  private static instance: SupabaseClient | null = null;
  private client: SupabaseClient;
  private readonly tableName = DATABASE_CONFIG.PRODUCT_TABLE_NAME;

  /** 업데이트 간 지연 시간 (ms) - Rate Limiting 방지 */
  private readonly UPDATE_DELAY_MS = UPDATE_CONFIG.DEFAULT_DELAY_MS;

  constructor() {
    this.client = this.getSupabaseClient();
  }

  /**
   * 지연 함수 (Rate Limiting 방지)
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (SupabaseProductUpdateRepository.instance) {
      return SupabaseProductUpdateRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables",
      );
    }

    SupabaseProductUpdateRepository.instance = createClient(
      supabaseUrl,
      supabaseKey,
    );
    logger.info("Supabase Update Repository 초기화 완료");

    return SupabaseProductUpdateRepository.instance;
  }

  /**
   * 단일 상품 업데이트
   *
   * @param data 업데이트할 상품 데이터
   * @returns 성공 여부
   */
  async update(data: ProductUpdateData): Promise<boolean> {
    try {
      // 업데이트할 필드만 포함 (undefined 제거)
      const updateFields: Record<string, unknown> = {
        updated_at: data.updated_at,
      };

      if (data.product_name !== undefined) {
        updateFields.product_name = data.product_name;
      }
      if (data.thumbnail !== undefined) {
        updateFields.thumbnail = data.thumbnail;
      }
      if (data.original_price !== undefined) {
        updateFields.original_price = data.original_price;
      }
      if (data.discounted_price !== undefined) {
        updateFields.discounted_price = data.discounted_price;
      }
      // sale_status는 제외 (정책 미정)

      // UPDATE 실행 전 로깅
      logger.info(
        {
          product_set_id: data.product_set_id,
          update_fields: updateFields,
        },
        "📝 Supabase UPDATE 실행",
      );

      const { data: resultData, error } = await this.client
        .from(this.tableName)
        .update(updateFields)
        .eq("product_set_id", data.product_set_id)
        .select();

      if (error) {
        logger.error(
          {
            product_set_id: data.product_set_id,
            error: error.message,
            error_code: error.code,
            error_details: error.details,
          },
          "❌ 상품 업데이트 실패",
        );
        return false;
      }

      // UPDATE 결과 확인
      if (!resultData || resultData.length === 0) {
        logger.warn(
          {
            product_set_id: data.product_set_id,
            update_fields: updateFields,
          },
          "⚠️  UPDATE 성공했으나 반환된 row 없음 (존재하지 않는 ID?)",
        );
        return false;
      }

      logger.info(
        {
          product_set_id: data.product_set_id,
          updated_fields: Object.keys(updateFields),
          affected_rows: resultData.length,
        },
        "✅ 상품 업데이트 성공",
      );

      return true;
    } catch (error) {
      logger.error(
        {
          product_set_id: data.product_set_id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        "💥 상품 업데이트 예외 발생",
      );
      return false;
    }
  }

  /**
   * 배치 업데이트
   *
   * Supabase는 bulk update를 지원하지 않으므로 순차 처리합니다.
   * 개별 실패 시에도 계속 진행하며, 결과를 집계합니다.
   *
   * @param updates 업데이트할 상품 데이터 배열
   * @returns 배치 업데이트 결과
   */
  async batchUpdate(updates: ProductUpdateData[]): Promise<BatchUpdateResult> {
    const result: BatchUpdateResult = {
      updated_count: 0,
      skipped_count: 0,
      failed_count: 0,
      errors: [],
    };

    logger.info(
      {
        total: updates.length,
        delay_ms: this.UPDATE_DELAY_MS,
      },
      "배치 업데이트 시작 (Rate Limiting 적용)",
    );

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];

      // 업데이트할 필드가 하나도 없으면 스킵
      const hasUpdates =
        update.product_name !== undefined ||
        update.thumbnail !== undefined ||
        update.original_price !== undefined ||
        update.discounted_price !== undefined;

      if (!hasUpdates) {
        result.skipped_count++;
        logger.debug(
          { product_set_id: update.product_set_id },
          "업데이트할 필드 없음 - 스킵",
        );
        continue;
      }

      try {
        const success = await this.update(update);

        if (success) {
          result.updated_count++;
        } else {
          result.failed_count++;
          result.errors.push({
            product_set_id: update.product_set_id,
            error: "Update returned false",
          });
        }

        // Rate Limiting: 마지막 항목이 아니면 delay 적용
        if (i < updates.length - 1) {
          await this.delay(this.UPDATE_DELAY_MS);
        }
      } catch (error) {
        result.failed_count++;
        result.errors.push({
          product_set_id: update.product_set_id,
          error: error instanceof Error ? error.message : String(error),
        });

        logger.error(
          {
            product_set_id: update.product_set_id,
            error: error instanceof Error ? error.message : String(error),
          },
          "배치 업데이트 중 예외 발생",
        );

        // 에러 발생해도 다음 항목 처리 전 delay
        if (i < updates.length - 1) {
          await this.delay(this.UPDATE_DELAY_MS);
        }
      }
    }

    logger.info(
      {
        total: updates.length,
        updated: result.updated_count,
        skipped: result.skipped_count,
        failed: result.failed_count,
      },
      "배치 업데이트 완료",
    );

    return result;
  }
}

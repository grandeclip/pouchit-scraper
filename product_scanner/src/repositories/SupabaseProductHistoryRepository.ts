/**
 * Supabase Product History Repository
 *
 * 히스토리 테이블 관리:
 * 1. history_product_review: 모든 처리 이력 감사 추적 (INSERT)
 * 2. product_price_histories: 일별 가격 변동 추적 (UPSERT)
 *
 * SOLID 원칙:
 * - SRP: 히스토리 기록만 담당
 * - DIP: IProductHistoryRepository 구현
 * - OCP: 새로운 히스토리 타입 추가 시 확장 가능
 *
 * Design Pattern:
 * - Repository Pattern: 데이터 접근 로직 캡슐화
 * - Singleton Pattern: Supabase 클라이언트 재사용
 * - Fail-Safe Pattern: 실패해도 메인 로직 방해 안 함
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  IProductHistoryRepository,
  ReviewHistoryData,
  PriceHistoryData,
} from "@/core/interfaces/IProductHistoryRepository";
import {
  getTimestampWithTimezone,
  getDateStringWithDash,
} from "@/utils/timestamp";
import { logger } from "@/config/logger";

/**
 * Supabase Product History Repository
 *
 * 안전장치 패턴:
 * - 모든 메서드는 try-catch로 감싸져 있음
 * - 실패해도 예외를 외부로 전파하지 않음
 * - boolean 반환으로 성공/실패 표시
 */
export class SupabaseProductHistoryRepository
  implements IProductHistoryRepository
{
  private static instance: SupabaseClient | null = null;

  /**
   * Supabase 클라이언트 가져오기 (Singleton)
   */
  private getSupabaseClient(): SupabaseClient {
    if (SupabaseProductHistoryRepository.instance) {
      return SupabaseProductHistoryRepository.instance;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase 환경변수 누락: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    SupabaseProductHistoryRepository.instance = createClient(
      supabaseUrl,
      supabaseKey,
    );

    return SupabaseProductHistoryRepository.instance;
  }

  /**
   * 리뷰 히스토리 기록 (history_product_review)
   *
   * 동작:
   * - 항상 INSERT (새 레코드 생성)
   * - 업데이트는 하지 않음 (완전한 이력 보존)
   *
   * 안전장치:
   * - 실패해도 예외 미발생
   * - 로그 기록 후 false 반환
   *
   * @param data 리뷰 히스토리 데이터
   * @returns 성공 여부
   */
  async recordReviewHistory(data: ReviewHistoryData): Promise<boolean> {
    try {
      const client = this.getSupabaseClient();
      const createdAt = getTimestampWithTimezone();

      const { error } = await client.from("history_product_review").insert({
        product_set_id: data.product_set_id,
        link_url: data.link_url,
        status: data.status,
        comment: data.comment || null,
        before_products: data.before_products,
        after_products: data.after_products,
        created_at: createdAt,
      });

      if (error) {
        logger.error(
          {
            product_set_id: data.product_set_id,
            error: error.message,
            code: error.code,
          },
          "❌ 리뷰 히스토리 기록 실패",
        );
        return false;
      }

      logger.info(
        {
          product_set_id: data.product_set_id,
          status: data.status,
          created_at: createdAt,
        },
        "✅ 리뷰 히스토리 생성 완료",
      );

      return true;
    } catch (error) {
      logger.error(
        {
          product_set_id: data.product_set_id,
          error: error instanceof Error ? error.message : String(error),
        },
        "❌ 리뷰 히스토리 기록 예외",
      );
      return false; // 안전장치: 예외 미발생
    }
  }

  /**
   * 가격 히스토리 기록 (product_price_histories)
   *
   * 동작:
   * - UPSERT (같은 날짜 있으면 UPDATE, 없으면 INSERT)
   * - Unique 제약: (product_set_id, base_dt)
   * - 하루에 하나의 가격만 유지 (최신 가격으로 덮어쓰기)
   *
   * 안전장치:
   * - 실패해도 예외 미발생
   * - 로그 기록 후 false 반환
   *
   * @param data 가격 히스토리 데이터
   * @returns 성공 여부
   */
  async recordPriceHistory(data: PriceHistoryData): Promise<boolean> {
    try {
      const client = this.getSupabaseClient();
      const recordedAt = getTimestampWithTimezone(); // UTC 타임스탬프
      const baseDate = getDateStringWithDash(); // KST 날짜 (YYYY-MM-DD)

      // 1. 기존 레코드 확인 (SELECT)
      const { data: existing, error: selectError } = await client
        .from("product_price_histories")
        .select("id")
        .eq("product_set_id", data.product_set_id)
        .eq("base_dt", baseDate)
        .maybeSingle();

      if (selectError) {
        logger.error(
          {
            product_set_id: data.product_set_id,
            base_dt: baseDate,
            error: selectError.message,
          },
          "❌ 가격 히스토리 조회 실패",
        );
        return false;
      }

      // 2. UPDATE 또는 INSERT
      if (existing) {
        // UPDATE: 기존 레코드 갱신
        const { error: updateError } = await client
          .from("product_price_histories")
          .update({
            original_price: data.original_price,
            discount_price: data.discount_price,
            recorded_at: recordedAt,
          })
          .eq("product_set_id", data.product_set_id)
          .eq("base_dt", baseDate);

        if (updateError) {
          logger.error(
            {
              product_set_id: data.product_set_id,
              base_dt: baseDate,
              error: updateError.message,
            },
            "❌ 가격 히스토리 업데이트 실패",
          );
          return false;
        }

        logger.info(
          {
            product_set_id: data.product_set_id,
            original_price: data.original_price,
            discount_price: data.discount_price,
            base_dt: baseDate,
            recorded_at: recordedAt,
            operation: "UPDATE",
          },
          "✅ 가격 이력 업데이트 완료",
        );
      } else {
        // INSERT: 새 레코드 생성
        const { error: insertError } = await client
          .from("product_price_histories")
          .insert({
            product_set_id: data.product_set_id,
            original_price: data.original_price,
            discount_price: data.discount_price,
            recorded_at: recordedAt,
            base_dt: baseDate,
          });

        if (insertError) {
          logger.error(
            {
              product_set_id: data.product_set_id,
              base_dt: baseDate,
              error: insertError.message,
            },
            "❌ 가격 히스토리 생성 실패",
          );
          return false;
        }

        logger.info(
          {
            product_set_id: data.product_set_id,
            original_price: data.original_price,
            discount_price: data.discount_price,
            base_dt: baseDate,
            recorded_at: recordedAt,
            operation: "INSERT",
          },
          "✅ 가격 이력 생성 완료",
        );
      }

      return true;
    } catch (error) {
      logger.error(
        {
          product_set_id: data.product_set_id,
          error: error instanceof Error ? error.message : String(error),
        },
        "❌ 가격 히스토리 기록 예외",
      );
      return false; // 안전장치: 예외 미발생
    }
  }
}

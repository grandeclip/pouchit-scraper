/**
 * ISaleStatusExtractor Interface Test
 *
 * 목적: SaleStatusData 인터페이스 구조 검증
 * 표준: schema.org ItemAvailability 규약 준수
 * @see https://schema.org/ItemAvailability
 * TDD: RED 단계
 */

import { describe, it, expect } from "@jest/globals";
import type {
  ISaleStatusExtractor,
  SaleStatusData,
} from "@/extractors/base/ISaleStatusExtractor";
import { SaleStatus } from "@/extractors/base/ISaleStatusExtractor";

describe("ISaleStatusExtractor Interface", () => {
  describe("SaleStatus 타입 검증", () => {
    it("schema.org ItemAvailability 표준 값만 허용해야 함", () => {
      const validStatuses: SaleStatus[] = [
        SaleStatus.InStock,
        SaleStatus.OutOfStock,
        SaleStatus.SoldOut,
        SaleStatus.Discontinued,
      ];

      validStatuses.forEach((status) => {
        const data: SaleStatusData = {
          saleStatus: status,
          isAvailable: true,
        };
        expect(data.saleStatus).toBe(status);
      });
    });
  });

  describe("SaleStatusData 타입 검증", () => {
    it("필수 필드를 포함해야 함", () => {
      const validData: SaleStatusData = {
        saleStatus: SaleStatus.InStock,
        isAvailable: true,
      };

      expect(validData.saleStatus).toBe(SaleStatus.InStock);
      expect(validData.isAvailable).toBe(true);
    });

    it("재고 있음(InStock) 상태를 표현할 수 있음", () => {
      const inStockData: SaleStatusData = {
        saleStatus: SaleStatus.InStock,
        isAvailable: true,
      };

      expect(inStockData.saleStatus).toBe(SaleStatus.InStock);
      expect(inStockData.isAvailable).toBe(true);
    });

    it("일시품절(OutOfStock) 상태를 표현할 수 있음", () => {
      const outOfStockData: SaleStatusData = {
        saleStatus: SaleStatus.OutOfStock,
        isAvailable: false,
      };

      expect(outOfStockData.saleStatus).toBe(SaleStatus.OutOfStock);
      expect(outOfStockData.isAvailable).toBe(false);
    });

    it("완판(SoldOut) 상태를 표현할 수 있음", () => {
      const soldOutData: SaleStatusData = {
        saleStatus: SaleStatus.SoldOut,
        isAvailable: false,
      };

      expect(soldOutData.saleStatus).toBe(SaleStatus.SoldOut);
      expect(soldOutData.isAvailable).toBe(false);
    });

    it("판매종료(Discontinued) 상태를 표현할 수 있음", () => {
      const discontinuedData: SaleStatusData = {
        saleStatus: SaleStatus.Discontinued,
        isAvailable: false,
      };

      expect(discontinuedData.saleStatus).toBe(SaleStatus.Discontinued);
      expect(discontinuedData.isAvailable).toBe(false);
    });
  });

  describe("ISaleStatusExtractor 구현 검증", () => {
    it("extract 메서드를 구현해야 함", async () => {
      const mockExtractor: ISaleStatusExtractor = {
        extract: async () => ({
          saleStatus: SaleStatus.InStock,
          isAvailable: true,
        }),
      };

      const result = await mockExtractor.extract({} as any);
      expect(result).toHaveProperty("saleStatus");
      expect(result).toHaveProperty("isAvailable");
    });

    it("Promise<SaleStatusData>를 반환해야 함", async () => {
      const mockExtractor: ISaleStatusExtractor = {
        extract: async () => ({
          saleStatus: SaleStatus.OutOfStock,
          isAvailable: false,
        }),
      };

      const result = await mockExtractor.extract({} as any);
      expect(result).toMatchObject({
        saleStatus: SaleStatus.OutOfStock,
        isAvailable: false,
      });
    });
  });
});

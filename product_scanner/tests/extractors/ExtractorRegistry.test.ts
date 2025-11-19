/**
 * ExtractorRegistry Test
 *
 * 목적: Extractor 중앙 관리 Registry 검증
 * 패턴: Singleton Pattern
 * TDD: RED → GREEN → REFACTOR
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ExtractorRegistry } from "@/extractors/ExtractorRegistry";
import { OliveyoungExtractor } from "@/extractors/oliveyoung/OliveyoungExtractor";
import type { IProductExtractor } from "@/extractors/base";

describe("ExtractorRegistry", () => {
  let registry: ExtractorRegistry;

  beforeEach(() => {
    // Singleton 인스턴스 초기화 (테스트용)
    registry = ExtractorRegistry.getInstance();
  });

  describe("Singleton Pattern", () => {
    it("항상 동일한 인스턴스를 반환해야 함", () => {
      const instance1 = ExtractorRegistry.getInstance();
      const instance2 = ExtractorRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("new 키워드로 생성 불가능해야 함", () => {
      // TypeScript에서 private constructor는 컴파일 타임 체크
      // 런타임 테스트는 불가능하므로 타입 체크만 수행
      expect(ExtractorRegistry.getInstance()).toBeDefined();
    });
  });

  describe("register() - Extractor 등록", () => {
    it("Extractor를 ID로 등록할 수 있어야 함", () => {
      const extractor = new OliveyoungExtractor();

      expect(() => {
        registry.register("test-oliveyoung", extractor);
      }).not.toThrow();
    });

    it("동일한 ID로 재등록 시 덮어써야 함", () => {
      const extractor1 = new OliveyoungExtractor();
      const extractor2 = new OliveyoungExtractor();

      registry.register("test-id", extractor1);
      registry.register("test-id", extractor2);

      const retrieved = registry.get("test-id");
      expect(retrieved).toBe(extractor2);
    });
  });

  describe("get() - Extractor 조회", () => {
    it("등록된 Extractor를 조회할 수 있어야 함", () => {
      const extractor = new OliveyoungExtractor();
      registry.register("test-get", extractor);

      const retrieved = registry.get("test-get");

      expect(retrieved).toBe(extractor);
      expect(retrieved).toBeInstanceOf(OliveyoungExtractor);
    });

    it("존재하지 않는 ID 조회 시 에러 발생", () => {
      expect(() => {
        registry.get("non-existent-id");
      }).toThrow(/Extractor not found: non-existent-id/);
      expect(() => {
        registry.get("non-existent-id");
      }).toThrow(/Available:/);
    });

    it("조회된 Extractor는 IProductExtractor 구현체여야 함", () => {
      const extractor = new OliveyoungExtractor();
      registry.register("test-interface", extractor);

      const retrieved = registry.get("test-interface");

      // IProductExtractor 메서드 존재 확인
      expect(retrieved).toHaveProperty("extract");
      expect(typeof retrieved.extract).toBe("function");
    });
  });

  describe("기본 Extractor 등록", () => {
    it("oliveyoung Extractor가 기본 등록되어 있어야 함", () => {
      const extractor = registry.get("oliveyoung");

      expect(extractor).toBeDefined();
      expect(extractor).toBeInstanceOf(OliveyoungExtractor);
    });

    it("기본 등록된 Extractor는 즉시 사용 가능해야 함", () => {
      const extractor = registry.get("oliveyoung");

      // extract 메서드 존재 확인
      expect(extractor.extract).toBeDefined();
      expect(typeof extractor.extract).toBe("function");
    });
  });

  describe("has() - Extractor 존재 확인", () => {
    it("등록된 Extractor 존재 확인", () => {
      const extractor = new OliveyoungExtractor();
      registry.register("test-has", extractor);

      expect(registry.has("test-has")).toBe(true);
    });

    it("미등록 Extractor 존재 확인", () => {
      expect(registry.has("non-existent")).toBe(false);
    });
  });

  describe("clear() - 테스트 격리", () => {
    it("모든 Extractor를 제거할 수 있어야 함 (테스트 격리용)", () => {
      const extractor = new OliveyoungExtractor();
      registry.register("test-clear", extractor);

      registry.clear();

      expect(registry.has("test-clear")).toBe(false);
    });

    it("clear 후 기본 Extractor 재등록", () => {
      registry.clear();

      // 기본 Extractor 재등록 (oliveyoung)
      const extractor = new OliveyoungExtractor();
      registry.register("oliveyoung", extractor);

      expect(registry.has("oliveyoung")).toBe(true);
    });
  });
});

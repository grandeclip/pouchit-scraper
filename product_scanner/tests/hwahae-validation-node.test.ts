/**
 * HwahaeValidationNode URL 파싱 테스트
 */

import { HwahaeValidationNode } from "@/strategies/HwahaeValidationNode";

describe("HwahaeValidationNode - extractGoodsId", () => {
  let node: HwahaeValidationNode;

  beforeEach(() => {
    // HwahaeScanService 없이 인스턴스 생성 (extractGoodsId는 서비스 불필요)
    node = new HwahaeValidationNode();
  });

  describe("✅ 정상 URL 패턴", () => {
    it("정상: /goods/숫자", () => {
      const url = "https://www.hwahae.co.kr/goods/21320";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("21320");
    });

    it("products 사용: /products/숫자", () => {
      const url = "https://www.hwahae.co.kr/products/2038055";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("2038055");
    });
  });

  describe("⚡ Query Parameter 처리", () => {
    it("goods + query params", () => {
      const url =
        "https://www.hwahae.co.kr/goods/66061?srsltid=AfmBOor_tk_oc65gF1SE82OzVwIqvFTzGVbmJyFuyqjWURj7GFHSYWEZ";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("66061");
    });

    it("products + query params", () => {
      const url =
        "https://www.hwahae.co.kr/products/2124722?srsltid=AfmBOop4etUd7QZ6omekR1x3jZSICnadIXOVZ1QofCqPt_E3GRm3JA3N";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("2124722");
    });
  });

  describe("🔤 URL-encoded 상품명 처리", () => {
    it("products + URL-encoded 상품명 + 숫자 + query", () => {
      const url =
        "https://www.hwahae.co.kr/products/%EB%8D%94%EC%83%98-%EC%A0%A4%EB%A6%AC-%EB%B8%94%EB%9F%AC%EC%85%94-PK01-%EC%8A%A4%EC%9C%84%ED%8A%B8%ED%8E%98%ED%83%88/2099549?srsltid=AfmBOooO52dE9AHSBTGdwfGTU0KfosV0uGL8nD58Z_erWEyQrfk_Y8Jn";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("2099549");
    });

    it("goods + URL-encoded 상품명 + 숫자 + 복잡한 query", () => {
      const url =
        "https://www.hwahae.co.kr/goods/%ED%8E%98%EB%A6%AC%ED%8E%98%EB%9D%BC-%EC%9B%8C%ED%84%B0-%EB%B2%A0%EC%96%B4-%ED%8B%B4%ED%8A%B8-015-%ED%95%91%EC%BF%A8%EA%B1%B0%EB%9E%98/70815?goods_tab=review_ingredients&srsltid=AfmBOoo1Jq9sUvZJlHTy1yKNHctjH3dg1TYX4t4VpVz_n2Hu-wcrpiJx";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("70815");
    });
  });

  describe("❌ 실패 케이스", () => {
    it("hwahae URL이 아님", () => {
      const url = "https://www.naver.com/products/12345";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBeNull();
    });

    it("goods/products 경로 없음", () => {
      const url = "https://www.hwahae.co.kr/about";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBeNull();
    });

    it("숫자 ID 없음", () => {
      const url = "https://www.hwahae.co.kr/goods/invalid";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBeNull();
    });
  });

  describe("🎯 Edge Cases", () => {
    it("매우 긴 상품 ID", () => {
      const url = "https://www.hwahae.co.kr/goods/9999999999";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("9999999999");
    });

    it("상품명에 숫자 포함된 경우 - 마지막 숫자 추출", () => {
      const url = "https://www.hwahae.co.kr/products/product-123-name/456789";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("456789"); // 마지막 숫자가 상품 ID
    });

    it("trailing slash 있는 경우", () => {
      const url = "https://www.hwahae.co.kr/goods/21320/";
      // @ts-expect-error - private method 테스트
      const result = node.extractGoodsId(url);
      expect(result).toBe("21320");
    });
  });
});

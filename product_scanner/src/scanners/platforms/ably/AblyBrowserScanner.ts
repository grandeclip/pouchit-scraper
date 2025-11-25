/**
 * A-bly Browser Scanner (Extractor 기반)
 *
 * 목적: BrowserScanner를 확장하여 Extractor 패턴 사용
 * 패턴: Strategy Pattern + Extractor Pattern
 * 참고: docs/analysis/ably-strategy-analysis.md L518-560
 */

import { BrowserScanner } from "@/scanners/strategies/BrowserScanner";
import { AblyProduct, AblyDOMResponse } from "@/core/domain/AblyProduct";
import { AblyConfig } from "@/core/domain/AblyConfig";
import { ExtractorRegistry } from "@/extractors/ExtractorRegistry";

/**
 * A-bly 전용 Browser Scanner
 *
 * 전략:
 * - BrowserScanner의 parseData를 override하여 Extractor 사용
 * - DOM 데이터 대신 Page 객체를 Extractor에 전달
 * - AblyExtractor → ProductData → AblyProduct.fromProductData
 */
export class AblyBrowserScanner extends BrowserScanner<
  AblyDOMResponse,
  AblyProduct,
  AblyConfig
> {
  /**
   * 데이터 파싱 (Extractor 기반)
   *
   * 전략:
   * - DOM 데이터 파싱 대신 Extractor 사용
   * - Page 객체를 Extractor에 전달
   * - ProductData로부터 AblyProduct 생성
   *
   * @param _rawData DOM 데이터 (사용하지 않음 - Extractor가 직접 Page 파싱)
   * @returns AblyProduct 도메인 객체
   */
  protected async parseData(_rawData: AblyDOMResponse): Promise<AblyProduct> {
    // Page 객체 확인
    if (!(this as any).page) {
      throw new Error("Page 객체가 초기화되지 않았습니다.");
    }

    const page = (this as any).page;
    const goodsNo = (this as any).lastScanId;

    try {
      // ExtractorRegistry에서 ably Extractor 가져오기
      const registry = ExtractorRegistry.getInstance();
      const extractor = registry.get("ably");

      // Extractor로 ProductData 추출
      const productData = await extractor.extract(page);

      // ProductData → AblyProduct 변환
      return AblyProduct.fromProductData(goodsNo, productData);
    } catch (error) {
      throw new Error(
        `Extractor 기반 파싱 실패 (goodsNo: ${goodsNo}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

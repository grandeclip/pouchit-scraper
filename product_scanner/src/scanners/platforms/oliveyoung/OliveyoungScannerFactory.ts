/**
 * 올리브영 스캐너 팩토리
 * Factory Pattern - 전략별 Scanner 생성
 *
 * SOLID 원칙:
 * - SRP: Scanner 인스턴스 생성만 담당
 * - OCP: 새로운 전략 추가 시 확장 가능
 * - DIP: 추상화(IScanner)에 의존
 */

import { IScanner } from "@/core/interfaces/IScanner.generic";
import {
  OliveyoungProduct,
  OliveyoungDOMResponse,
} from "@/core/domain/OliveyoungProduct";
import { OliveyoungConfig } from "@/core/domain/OliveyoungConfig";
import {
  StrategyConfig,
  PlaywrightStrategyConfig,
} from "@/core/domain/StrategyConfig";
import { isPlaywrightStrategy } from "@/core/domain/StrategyConfig.guards";

import { BrowserScanner } from "@/scanners/strategies/BrowserScanner";

/**
 * 올리브영 스캐너 팩토리
 */
export class OliveyoungScannerFactory {
  constructor(private readonly config: OliveyoungConfig) {}

  /**
   * 전략에 맞는 Scanner 생성 (Type Guard 사용)
   */
  create(strategy: StrategyConfig): IScanner<OliveyoungProduct> {
    if (isPlaywrightStrategy(strategy)) {
      return this.createBrowserScanner(strategy);
    }

    throw new Error(
      `Oliveyoung에서 지원하지 않는 strategy 타입: ${strategy.type}`,
    );
  }

  /**
   * Browser Scanner 생성
   */
  private createBrowserScanner(
    strategy: PlaywrightStrategyConfig,
  ): IScanner<OliveyoungProduct> {
    return new BrowserScanner<
      OliveyoungDOMResponse,
      OliveyoungProduct,
      OliveyoungConfig
    >({
      config: this.config,
      strategy,
      parseDOM: async (
        domData: any, // ProductData type but using any to avoid complex generic issues for now
        goodsNo: string,
      ): Promise<OliveyoungProduct> => {
        // ProductData 구조 (Extractor 반환값) 처리
        if (domData.metadata && domData.price && domData.saleStatus) {
          return new OliveyoungProduct(
            goodsNo,
            domData.metadata.productName ||
              (domData.saleStatus.saleStatus === "Discontinued"
                ? "판매 중지된 상품"
                : ""),
            domData.metadata.brand || "",
            domData.metadata.thumbnail ||
              "https://static.oliveyoung.co.kr/pc-static-root/image/comm/h1_logo.png", // Fallback for sold-out/deleted items
            domData.price.originalPrice || domData.price.price,
            domData.price.price,
            OliveyoungProduct.mapSaleStatus(
              // @ts-ignore - mapSaleStatus expects OliveyoungDomSaleStatus but we are passing mapped status
              // Schema.org status를 내부 status로 변환
              domData.saleStatus.saleStatus === "InStock"
                ? "SELNG" // 판매중
                : domData.saleStatus.saleStatus === "OutOfStock"
                  ? "SLDOT" // 일시품절
                  : domData.saleStatus.saleStatus === "SoldOut"
                    ? "SLDOT" // 품절
                    : "STSEL", // Discontinued (판매중지)
            ),
          );
        }

        // Legacy DOM structure fallback
        return OliveyoungProduct.fromDOMData({
          ...domData,
          id: goodsNo,
          goodsNo,
        });
      },
      screenshot: {
        enabled: true,
        outputDir: "/app/results/screenshots",
      },
    });
  }
}

/**
 * 브라우저 액션 실행기
 * Command Pattern
 * 
 * 역할:
 * - 각 액션을 Command 객체로 구현
 * - Playwright API 호출
 * 
 * SOLID 원칙:
 * - SRP: 각 액션 클래스는 하나의 액션만 실행
 * - OCP: 새로운 액션 추가 시 기존 코드 수정 불필요
 */

import type { Page } from 'playwright';
import {
  ActionConfig,
  GotoActionConfig,
  WaitActionConfig,
  WaitForSelectorActionConfig,
  WaitForLoadStateActionConfig,
  ScrollActionConfig,
  ClickActionConfig,
  FillActionConfig,
  PressActionConfig,
  CheckNoResultsActionConfig,
  WaitForEitherActionConfig,
  ClickAndExtractUrlActionConfig,
} from '../core/domain/NavigationStep';

/**
 * 검색 결과 없음 예외
 * 이 예외가 발생하면 빈 배열을 반환하고 정상 종료
 */
export class NoResultsException extends Error {
  constructor(message: string = '검색 결과가 없습니다') {
    super(message);
    this.name = 'NoResultsException';
  }
}

/**
 * 액션 인터페이스
 */
export interface IAction {
  execute(page: Page, context?: Record<string, any>): Promise<void>;
}

/**
 * Goto 액션
 */
export class GotoAction implements IAction {
  constructor(private config: GotoActionConfig) {}

  async execute(page: Page): Promise<void> {
    await page.goto(this.config.url, {
      waitUntil: this.config.waitUntil || 'domcontentloaded',
      timeout: this.config.timeout || 30000,
    });
  }
}

/**
 * Wait 액션
 */
export class WaitAction implements IAction {
  constructor(private config: WaitActionConfig) {}

  async execute(page: Page): Promise<void> {
    await page.waitForTimeout(this.config.duration);
  }
}

/**
 * WaitForSelector 액션
 */
export class WaitForSelectorAction implements IAction {
  constructor(private config: WaitForSelectorActionConfig) {}

  async execute(page: Page): Promise<void> {
    try {
      await page.waitForSelector(this.config.selector, {
        timeout: this.config.timeout || 10000,
      });
    } catch (error) {
      if (!this.config.optional) {
        throw error;
      }
      // optional이면 에러 무시
    }
  }
}

/**
 * WaitForLoadState 액션
 */
export class WaitForLoadStateAction implements IAction {
  constructor(private config: WaitForLoadStateActionConfig) {}

  async execute(page: Page): Promise<void> {
    try {
      await page.waitForLoadState(this.config.state || 'networkidle', {
        timeout: this.config.timeout || 30000,
      });
    } catch (error) {
      if (!this.config.optional) {
        throw error;
      }
      // optional이면 에러 무시하고 계속 진행
      console.log(`[WaitForLoadState] Optional - 타임아웃 무시: ${this.config.state || 'networkidle'}`);
    }
  }
}

/**
 * Scroll 액션
 */
export class ScrollAction implements IAction {
  constructor(private config: ScrollActionConfig) {}

  async execute(page: Page): Promise<void> {
    await page.evaluate(
      ({ x, y, behavior }) => {
        window.scrollTo({
          top: y,
          left: x,
          behavior: behavior as ScrollBehavior,
        });
      },
      {
        x: this.config.x || 0,
        y: this.config.y || 0,
        behavior: this.config.behavior || 'auto',
      }
    );
  }
}

/**
 * Click 액션
 */
export class ClickAction implements IAction {
  constructor(private config: ClickActionConfig) {}

  async execute(page: Page): Promise<void> {
    await page.click(this.config.selector, {
      timeout: this.config.timeout || 10000,
    });
  }
}

/**
 * Fill 액션
 */
export class FillAction implements IAction {
  constructor(private config: FillActionConfig) {}

  async execute(page: Page): Promise<void> {
    await page.fill(this.config.selector, this.config.value, {
      timeout: this.config.timeout || 10000,
    });
  }
}

/**
 * Press 액션
 */
export class PressAction implements IAction {
  constructor(private config: PressActionConfig) {}

  async execute(page: Page): Promise<void> {
    await page.press(this.config.selector, this.config.key, {
      timeout: this.config.timeout || 10000,
    });
  }
}

/**
 * CheckNoResults 액션
 * 검색 결과 없음을 빠르게 감지하여 조기 종료
 */
export class CheckNoResultsAction implements IAction {
  constructor(private config: CheckNoResultsActionConfig) {}

  async execute(page: Page): Promise<void> {
    const timeout = this.config.timeout || 3000;
    
    console.log(`[CheckNoResults] 결과 없음 체크 시작 (${timeout}ms)`);

    try {
      // 여러 셀렉터 중 하나라도 매칭되면 결과 없음으로 판단
      for (const selector of this.config.selectors) {
        try {
          const element = await page.waitForSelector(selector, {
            timeout: timeout / this.config.selectors.length,
            state: 'visible',
          });

          if (element) {
            console.log(`[CheckNoResults] 결과 없음 감지: ${selector}`);
            
            // onMatch 동작 수행
            if (this.config.onMatch === 'returnEmpty') {
              throw new NoResultsException(`검색 결과 없음 (셀렉터: ${selector})`);
            }
            return;
          }
        } catch (error) {
          // 이 셀렉터는 타임아웃 - 다음 셀렉터 시도
          continue;
        }
      }

      console.log(`[CheckNoResults] 결과 없음 셀렉터 발견 안됨 - 정상 진행`);
    } catch (error) {
      if (error instanceof NoResultsException) {
        throw error;
      }
      // 기타 에러는 무시하고 정상 진행
      console.log(`[CheckNoResults] 체크 실패 - 정상 진행`);
    }
  }
}

/**
 * WaitForEither 액션
 * 성공/실패 시그널을 동시에 대기하고 먼저 오는 것 처리 (Race Condition)
 */
export class WaitForEitherAction implements IAction {
  constructor(private config: WaitForEitherActionConfig) {}

  async execute(page: Page): Promise<void> {
    const timeout = this.config.timeout || 5000;

    console.log(`[WaitForEither] Race 시작 - 성공(${this.config.success.length}개) vs 실패(${this.config.failure.length}개)`);

    try {
      // 모든 셀렉터에 대한 Promise 배열 생성
      const promises: Promise<{ type: 'success' | 'failure'; selector: string }>[] = [];

      // 성공 시그널 Promise들
      this.config.success.forEach((selector) => {
        promises.push(
          page
            .waitForSelector(selector, { timeout, state: 'visible' })
            .then(() => ({ type: 'success' as const, selector }))
        );
      });

      // 실패 시그널 Promise들
      this.config.failure.forEach((selector) => {
        promises.push(
          page
            .waitForSelector(selector, { timeout, state: 'visible' })
            .then(() => ({ type: 'failure' as const, selector }))
        );
      });

      // Race - 가장 먼저 완료되는 것 반환
      const result = await Promise.race(promises);

      if (result.type === 'success') {
        console.log(`[WaitForEither] ✅ 성공 시그널 감지: ${result.selector}`);
        return;
      } else {
        console.log(`[WaitForEither] ❌ 실패 시그널 감지: ${result.selector}`);

        // onFailure 동작 수행
        if (this.config.onFailure === 'returnEmpty') {
          throw new NoResultsException(`검색 결과 없음 (실패 시그널: ${result.selector})`);
        }
      }
    } catch (error) {
      if (error instanceof NoResultsException) {
        throw error;
      }

      // 모든 셀렉터가 타임아웃된 경우 - 정상 진행
      console.log(`[WaitForEither] 타임아웃 - 모든 시그널 감지 실패, 정상 진행`);
    }
  }
}

/**
 * ClickAndExtractUrl 액션
 * 상품을 순차적으로 클릭하여 URL 추출 (SPA 쇼핑몰용 - Ably 등)
 */
export class ClickAndExtractUrlAction implements IAction {
  constructor(private config: ClickAndExtractUrlActionConfig) {}

  async execute(page: Page, context?: Record<string, any>): Promise<void> {
    const maxProducts = this.config.maxProducts || 2;
    const waitAfterClick = this.config.waitAfterClick || 1000;
    const waitAfterBack = this.config.waitAfterBack || 500;

    console.log(`[ClickAndExtractUrl] 시작 - 최대 ${maxProducts}개 상품 URL 추출`);

    if (!context) {
      throw new Error('[ClickAndExtractUrl] Context가 필요합니다.');
    }

    const extractedUrls: string[] = [];

    try {
      // 컨테이너 요소들 가져오기
      const containers = await page.$$(this.config.containerSelector);
      console.log(`[ClickAndExtractUrl] 발견된 상품 컨테이너: ${containers.length}개`);

      const actualCount = Math.min(maxProducts, containers.length);
      console.log(`[ClickAndExtractUrl] 처리할 상품 수: ${actualCount}개`);

      for (let i = 0; i < actualCount; i++) {
        try {
          console.log(`[ClickAndExtractUrl] 상품 ${i + 1}/${actualCount} 처리 시작`);

          // 현재 URL 저장 (검색 결과 페이지)
          const searchPageUrl = page.url();

          // 컨테이너 다시 가져오기 (DOM이 변경될 수 있으므로)
          const currentContainers = await page.$$(this.config.containerSelector);

          if (i >= currentContainers.length) {
            console.log(`[ClickAndExtractUrl] 상품 ${i + 1} - 더 이상 컨테이너 없음`);
            break;
          }

          const container = currentContainers[i];

          // 클릭할 요소 결정
          const clickTarget = this.config.clickSelector
            ? await container.$(this.config.clickSelector)
            : container;

          if (!clickTarget) {
            console.log(`[ClickAndExtractUrl] 상품 ${i + 1} - 클릭 대상 없음, 스킵`);
            continue;
          }

          // JavaScript evaluate를 사용하여 클릭 (오버레이 우회)
          // Ably 등의 SPA 쇼핑몰에서 무한 스크롤 로딩 오버레이가 클릭을 가로채므로
          // DOM 이벤트를 직접 발생시켜 우회
          await clickTarget.evaluate((el: any) => el.click());
          console.log(`[ClickAndExtractUrl] 상품 ${i + 1} - 클릭 완료`);

          // 페이지 이동 대기
          await page.waitForTimeout(waitAfterClick);

          // 상품 상세 페이지 URL 추출
          const productUrl = page.url();

          if (productUrl === searchPageUrl) {
            console.log(`[ClickAndExtractUrl] 상품 ${i + 1} - URL 변경 안됨, 스킵`);
            continue;
          }

          extractedUrls.push(productUrl);
          console.log(`[ClickAndExtractUrl] 상품 ${i + 1} - URL 추출: ${productUrl}`);

          // 검색 결과 페이지로 돌아가기
          await page.goBack();
          console.log(`[ClickAndExtractUrl] 상품 ${i + 1} - 검색 결과 페이지로 복귀`);

          // DOM 안정화 대기
          await page.waitForTimeout(waitAfterBack);

        } catch (error) {
          console.error(`[ClickAndExtractUrl] 상품 ${i + 1} 처리 중 오류:`, error);

          // 오류 발생 시 검색 결과 페이지로 복귀 시도
          try {
            await page.goBack();
            await page.waitForTimeout(waitAfterBack);
          } catch (backError) {
            console.error(`[ClickAndExtractUrl] 복귀 실패:`, backError);
          }
        }
      }

      // Context에 URL 배열 저장
      context[this.config.storeIn] = extractedUrls;
      console.log(`[ClickAndExtractUrl] 완료 - 총 ${extractedUrls.length}개 URL 추출`);
      console.log(`[ClickAndExtractUrl] Context['${this.config.storeIn}']에 저장됨`);

    } catch (error) {
      console.error(`[ClickAndExtractUrl] 실행 중 오류:`, error);
      // 오류가 발생해도 빈 배열을 저장
      context[this.config.storeIn] = extractedUrls;
      throw error;
    }
  }
}

/**
 * 액션 팩토리
 */
export class ActionFactory {
  /**
   * 액션 설정으로부터 액션 인스턴스 생성
   */
  static createAction(config: ActionConfig): IAction {
    switch (config.action) {
      case 'goto':
        return new GotoAction(config as GotoActionConfig);
      case 'wait':
        return new WaitAction(config as WaitActionConfig);
      case 'waitForSelector':
        return new WaitForSelectorAction(config as WaitForSelectorActionConfig);
      case 'waitForLoadState':
        return new WaitForLoadStateAction(config as WaitForLoadStateActionConfig);
      case 'scroll':
        return new ScrollAction(config as ScrollActionConfig);
      case 'click':
        return new ClickAction(config as ClickActionConfig);
      case 'fill':
        return new FillAction(config as FillActionConfig);
      case 'press':
        return new PressAction(config as PressActionConfig);
      case 'checkNoResults':
        return new CheckNoResultsAction(config as CheckNoResultsActionConfig);
      case 'waitForEither':
        return new WaitForEitherAction(config as WaitForEitherActionConfig);
      case 'clickAndExtractUrl':
        return new ClickAndExtractUrlAction(config as ClickAndExtractUrlActionConfig);
      default:
        throw new Error(`알 수 없는 액션 타입: ${(config as any).action}`);
    }
  }
}


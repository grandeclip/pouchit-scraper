/**
 * 페이지 네비게이터
 * 네비게이션 오케스트레이터
 * 
 * 역할:
 * - YAML의 navigation.steps 실행
 * - 템플릿 변수 치환
 * - 에러 처리
 * 
 * SOLID 원칙:
 * - SRP: 페이지 네비게이션 오케스트레이션만 담당
 * - DIP: IPageNavigator 인터페이스에 의존
 */

import type { Page } from 'playwright';
import { IPageNavigator } from '../core/interfaces/IPageNavigator';
import { NavigationConfig } from '../core/domain/NavigationStep';
import { ActionFactory, NoResultsException } from './ActionExecutor';
import { ConfigLoader } from '../config/ConfigLoader';

/**
 * 페이지 네비게이터 구현
 */
export class PageNavigator implements IPageNavigator {
  private configLoader: ConfigLoader;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * 네비게이션 실행
   */
  async navigate(
    page: Page,
    config: NavigationConfig,
    context: Record<string, any>
  ): Promise<void> {
    // 템플릿 변수 치환
    const substitutedConfig = this.configLoader.substituteObject(config, context);

    // 각 단계 실행
    for (let i = 0; i < substitutedConfig.steps.length; i++) {
      const step = substitutedConfig.steps[i];

      try {
        console.log(`[Navigation] Step ${i + 1}/${substitutedConfig.steps.length}: ${step.action}`);

        // 액션 생성 및 실행 (context 전달)
        const action = ActionFactory.createAction(step);
        await action.execute(page, context);

        console.log(`[Navigation] Step ${i + 1} 완료`);
      } catch (error) {
        // NoResultsException은 상위로 전파 (조기 종료)
        if (error instanceof NoResultsException) {
          console.log(`[Navigation] 검색 결과 없음 감지 - 조기 종료`);
          throw error;
        }

        console.error(`[Navigation] Step ${i + 1} 실패:`, error);
        throw new Error(`네비게이션 실패 (Step ${i + 1}): ${error}`);
      }
    }
  }
}


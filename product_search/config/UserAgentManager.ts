/**
 * User-Agent 관리자
 * Singleton Pattern
 * 
 * 역할:
 * - config/userAgents/userAgents.yaml 파일에서 User-Agent 목록 로드
 * - 쇼핑몰별로 할당된 User-Agent 중 랜덤 선택
 * - 사용된 User-Agent 정보 추적
 * 
 * SOLID 원칙:
 * - SRP: User-Agent 관리만 담당
 * - Singleton: 전역 인스턴스
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ShoppingMall } from '../core/domain/Product';

/**
 * User-Agent 정의
 */
export interface UserAgentDefinition {
  value: string;
  description: string;
  platform: 'desktop' | 'mobile';
  browser: string;
}

/**
 * User-Agent 설정 구조
 */
interface UserAgentConfig {
  userAgents: Record<string, UserAgentDefinition>;
  mallUserAgents: Record<ShoppingMall, string[]>;
}

/**
 * 선택된 User-Agent 정보
 */
export interface SelectedUserAgent {
  id: string;
  value: string;
  description: string;
  platform: string;
  browser: string;
}

/**
 * User-Agent 관리자 (Singleton)
 */
export class UserAgentManager {
  private static instance: UserAgentManager;
  private config: UserAgentConfig | null = null;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(__dirname, 'userAgents/userAgents.yaml');
  }

  /**
   * Singleton 인스턴스
   */
  static getInstance(): UserAgentManager {
    if (!UserAgentManager.instance) {
      UserAgentManager.instance = new UserAgentManager();
    }
    return UserAgentManager.instance;
  }

  /**
   * 설정 로드 (Lazy Loading)
   */
  private loadConfig(): UserAgentConfig {
    if (this.config) {
      return this.config;
    }

    try {
      const fileContents = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(fileContents) as UserAgentConfig;
      console.log('[UserAgentManager] User-Agent 설정 로드 완료');
      return this.config;
    } catch (error) {
      console.error('[UserAgentManager] User-Agent 설정 로드 실패:', error);
      throw new Error(`User-Agent 설정 파일 로드 실패: ${this.configPath}`);
    }
  }

  /**
   * 쇼핑몰에 할당된 User-Agent 중 랜덤 선택
   * 
   * @param mall 쇼핑몰 이름
   * @returns 선택된 User-Agent 정보
   */
  getRandomUserAgent(mall: ShoppingMall): SelectedUserAgent {
    const config = this.loadConfig();

    // 쇼핑몰에 할당된 User-Agent ID 목록
    const assignedAgentIds = config.mallUserAgents[mall];
    
    if (!assignedAgentIds || assignedAgentIds.length === 0) {
      throw new Error(`${mall}에 할당된 User-Agent가 없습니다`);
    }

    // 랜덤 선택
    const randomIndex = Math.floor(Math.random() * assignedAgentIds.length);
    const selectedId = assignedAgentIds[randomIndex];

    // User-Agent 정보 가져오기
    const agentDef = config.userAgents[selectedId];
    
    if (!agentDef) {
      throw new Error(`User-Agent 정의를 찾을 수 없습니다: ${selectedId}`);
    }

    const selectedAgent: SelectedUserAgent = {
      id: selectedId,
      value: agentDef.value,
      description: agentDef.description,
      platform: agentDef.platform,
      browser: agentDef.browser,
    };

    console.log(`[UserAgentManager] ${mall} - User-Agent 선택: ${selectedId} (${agentDef.description})`);

    return selectedAgent;
  }

  /**
   * 특정 쇼핑몰에 할당된 모든 User-Agent 목록
   * 
   * @param mall 쇼핑몰 이름
   * @returns User-Agent 목록
   */
  getAvailableUserAgents(mall: ShoppingMall): SelectedUserAgent[] {
    const config = this.loadConfig();
    const assignedAgentIds = config.mallUserAgents[mall];

    if (!assignedAgentIds) {
      return [];
    }

    return assignedAgentIds.map(id => {
      const agentDef = config.userAgents[id];
      return {
        id,
        value: agentDef.value,
        description: agentDef.description,
        platform: agentDef.platform,
        browser: agentDef.browser,
      };
    });
  }

  /**
   * 모든 User-Agent 정의 목록
   */
  getAllUserAgents(): Record<string, UserAgentDefinition> {
    const config = this.loadConfig();
    return config.userAgents;
  }

  /**
   * 설정 리로드 (테스트용)
   */
  reload(): void {
    this.config = null;
    console.log('[UserAgentManager] 설정 리로드');
  }
}


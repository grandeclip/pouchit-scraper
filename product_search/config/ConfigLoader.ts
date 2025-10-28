/**
 * YAML 설정 로더
 * Singleton Pattern
 * 
 * 역할:
 * - YAML 파일 로딩
 * - 스키마 검증
 * - 템플릿 변수 치환
 * - 설정 캐싱
 * 
 * SOLID 원칙:
 * - SRP: 설정 로딩만 담당
 * - OCP: 새로운 쇼핑몰 추가 시 코드 수정 불필요
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { ScraperConfig } from '../core/domain/ScraperConfig';
import { ShoppingMall } from '../core/domain/Product';

/**
 * Zod 스키마 정의
 */
const BrowserConfigSchema = z.object({
  headless: z.boolean(),
  args: z.array(z.string()),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
  // userAgent는 더 이상 설정 파일에 포함되지 않음 (UserAgentManager에서 관리)
  userAgent: z.string().optional(),
});

// 각 액션별로 명확한 스키마 정의
const GotoActionSchema = z.object({
  action: z.literal('goto'),
  url: z.string(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
  timeout: z.number().optional(),
});

const WaitActionSchema = z.object({
  action: z.literal('wait'),
  duration: z.number(),
});

const WaitForSelectorActionSchema = z.object({
  action: z.literal('waitForSelector'),
  selector: z.string(),
  timeout: z.number().optional(),
  optional: z.boolean().optional(),
});

const WaitForLoadStateActionSchema = z.object({
  action: z.literal('waitForLoadState'),
  state: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
  timeout: z.number().optional(),
  optional: z.boolean().optional(),
});

const ScrollActionSchema = z.object({
  action: z.literal('scroll'),
  x: z.number().optional(),
  y: z.number().optional(),
  behavior: z.enum(['auto', 'smooth']).optional(),
});

const ClickActionSchema = z.object({
  action: z.literal('click'),
  selector: z.string(),
  timeout: z.number().optional(),
});

const FillActionSchema = z.object({
  action: z.literal('fill'),
  selector: z.string(),
  value: z.string(),
  timeout: z.number().optional(),
});

const PressActionSchema = z.object({
  action: z.literal('press'),
  selector: z.string(),
  key: z.string(),
  timeout: z.number().optional(),
});

const CheckNoResultsActionSchema = z.object({
  action: z.literal('checkNoResults'),
  selectors: z.array(z.string()),
  timeout: z.number().optional(),
  onMatch: z.literal('returnEmpty').optional(),
});

const WaitForEitherActionSchema = z.object({
  action: z.literal('waitForEither'),
  success: z.array(z.string()),
  failure: z.array(z.string()),
  timeout: z.number().optional(),
  onFailure: z.literal('returnEmpty').optional(),
});

const ClickAndExtractUrlActionSchema = z.object({
  action: z.literal('clickAndExtractUrl'),
  containerSelector: z.string(),
  clickSelector: z.string().optional(),
  maxProducts: z.union([z.number(), z.string()]).optional(),  // 템플릿 변수 지원
  waitAfterClick: z.number().optional(),
  waitAfterBack: z.number().optional(),
  storeIn: z.string(),
});

// discriminatedUnion으로 엄격하게 검증
const NavigationStepSchema = z.discriminatedUnion('action', [
  GotoActionSchema,
  WaitActionSchema,
  WaitForSelectorActionSchema,
  WaitForLoadStateActionSchema,
  ScrollActionSchema,
  ClickActionSchema,
  FillActionSchema,
  PressActionSchema,
  CheckNoResultsActionSchema,
  WaitForEitherActionSchema,
  ClickAndExtractUrlActionSchema,
]);

const NavigationConfigSchema = z.object({
  steps: z.array(NavigationStepSchema),
});

const FieldConfigSchema = z.object({
  selector: z.string().optional(),
  type: z.enum(['text', 'attribute', 'html']).optional(),
  attribute: z.string().optional(),
  regex: z.string().optional(),
  group: z.number().optional(),
  transform: z
    .enum(['removeNonDigits', 'trim', 'lowercase', 'uppercase', 'removeCommas'])
    .optional(),
  parse: z.enum(['int', 'float', 'boolean']).optional(),
  required: z.boolean().optional(),
  nullable: z.boolean().optional(),
  fallback: z.string().optional(),
  multiple: z.boolean().optional(),
});

const ExtractionConfigSchema = z.object({
  type: z.enum(['evaluate', 'selector']),
  containerSelector: z.string().optional(),
  script: z.string().optional(),
  scriptArgs: z.array(z.string()).optional(),
  fields: z.record(FieldConfigSchema),
});

const ScraperConfigSchema = z.object({
  mall: z.enum(['oliveyoung', 'zigzag', 'musinsa', 'ably', 'kurly', 'hwahae']), // 'coupang' - 봇 탐지로 인해 비활성화
  name: z.string(),
  baseUrl: z.string(),
  searchUrl: z.string(),
  browser: BrowserConfigSchema,
  navigation: NavigationConfigSchema,
  extraction: ExtractionConfigSchema,
});

/**
 * ConfigLoader 클래스 (Singleton)
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private configCache: Map<ShoppingMall, ScraperConfig> = new Map();
  private configDir: string;

  private constructor() {
    this.configDir = path.join(__dirname, 'malls');
  }

  /**
   * Singleton 인스턴스 반환
   */
  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * 쇼핑몰 설정 로드
   * @param mall 쇼핑몰 이름
   * @returns 스크래퍼 설정
   */
  loadConfig(mall: ShoppingMall): ScraperConfig {
    // 캐시 확인
    if (this.configCache.has(mall)) {
      return this.configCache.get(mall)!;
    }

    // YAML 파일 경로
    const configPath = path.join(this.configDir, `${mall}.yaml`);

    // 파일 존재 확인
    if (!fs.existsSync(configPath)) {
      throw new Error(`설정 파일을 찾을 수 없습니다: ${configPath}`);
    }

    try {
      // YAML 파일 읽기
      const fileContent = fs.readFileSync(configPath, 'utf-8');

      // YAML 파싱
      const rawConfig = yaml.load(fileContent) as any;

      // 스키마 검증
      const validatedConfig = ScraperConfigSchema.parse(rawConfig);

      // 캐시에 저장
      this.configCache.set(mall, validatedConfig as ScraperConfig);

      return validatedConfig as ScraperConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `설정 검증 실패 (${mall}): ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw new Error(`설정 로드 실패 (${mall}): ${error}`);
    }
  }

  /**
   * 모든 쇼핑몰 설정 로드
   */
  loadAllConfigs(): Map<ShoppingMall, ScraperConfig> {
    const malls: ShoppingMall[] = ['oliveyoung', 'zigzag', 'musinsa', 'ably', 'kurly'];

    malls.forEach((mall) => {
      try {
        this.loadConfig(mall);
      } catch (error) {
        console.warn(`${mall} 설정 로드 실패:`, error);
      }
    });

    return new Map(this.configCache);
  }

  /**
   * 사용 가능한 쇼핑몰 목록
   */
  getAvailableMalls(): ShoppingMall[] {
    if (!fs.existsSync(this.configDir)) {
      return [];
    }

    const files = fs.readdirSync(this.configDir);
    const malls: ShoppingMall[] = [];

    files.forEach((file) => {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const mallName = file.replace(/\.(yaml|yml)$/, '') as ShoppingMall;
        malls.push(mallName);
      }
    });

    return malls;
  }

  /**
   * 템플릿 변수 치환
   * @param text 치환할 텍스트
   * @param context 변수 컨텍스트
   * @returns 치환된 텍스트
   */
  substituteVariables(text: string, context: Record<string, any>): string {
    return text.replace(/\$\{(\w+)\}/g, (match, key) => {
      if (key in context) {
        return String(context[key]);
      }
      return match;
    });
  }

  /**
   * 객체 전체의 템플릿 변수 치환
   * @param obj 객체
   * @param context 변수 컨텍스트
   * @returns 치환된 객체
   */
  substituteObject<T>(obj: T, context: Record<string, any>): T {
    const jsonStr = JSON.stringify(obj);
    const substituted = this.substituteVariables(jsonStr, context);
    return JSON.parse(substituted);
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * 특정 쇼핑몰 캐시 삭제
   */
  clearCacheFor(mall: ShoppingMall): void {
    this.configCache.delete(mall);
  }

  /**
   * 설정 디렉토리 경로 설정 (테스트용)
   */
  setConfigDir(dir: string): void {
    this.configDir = dir;
    this.clearCache();
  }
}


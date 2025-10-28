/**
 * Evaluate 기반 데이터 추출기
 * page.evaluate를 사용하여 브라우저 컨텍스트에서 데이터 추출
 * 
 * 역할:
 * - YAML의 fields 규칙에 따라 데이터 추출
 * - 변환 및 파싱 적용
 * 
 * SOLID 원칙:
 * - SRP: 데이터 추출만 담당
 * - OCP: 새로운 변환 타입 추가 용이
 */

import type { Page } from 'playwright';
import { IDataExtractor } from '../core/interfaces/IDataExtractor';
import {
  ExtractionConfig,
  FieldConfig,
  TransformType,
  ParseType,
} from '../core/domain/ScraperConfig';
import { ConfigLoader } from '../config/ConfigLoader';

/**
 * Evaluate 기반 추출기
 */
export class EvaluateExtractor implements IDataExtractor {
  private configLoader: ConfigLoader;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
  }

  /**
   * 데이터 추출
   */
  async extract(
    page: Page,
    config: ExtractionConfig,
    context: Record<string, any>
  ): Promise<any[]> {
    // 템플릿 변수 치환
    const substitutedConfig = this.configLoader.substituteObject(config, context);

    // 커스텀 스크립트가 있으면 직접 실행
    if (substitutedConfig.script) {
      // scriptArgs가 있으면 함께 전달
      const scriptArgs = substitutedConfig.scriptArgs || [];
      const resolvedArgs = scriptArgs.map((arg: string) => {
        // ${context.XXX} 패턴 감지하여 context 객체에서 직접 가져오기
        const contextMatch = arg.match(/^\$\{context\.(\w+)\}$/);
        if (contextMatch) {
          const key = contextMatch[1];
          console.log(`[EvaluateExtractor] Context 변수 감지: ${arg} → context.${key}`, typeof context[key], Array.isArray(context[key]) ? `Array(${context[key].length})` : context[key]);
          return context[key]; // 배열이나 객체를 그대로 반환
        }

        // 일반 템플릿 변수 치환
        const resolved = this.configLoader.substituteVariables(arg, context);
        console.log(`[EvaluateExtractor] 템플릿 변수 치환: ${arg} → ${resolved}`);
        return resolved;
      });

      console.log(`[EvaluateExtractor] 스크립트 실행 - 인자 수: ${resolvedArgs.length}`, resolvedArgs.map((arg, i) => `[${i}]: ${typeof arg} ${Array.isArray(arg) ? `Array(${arg.length})` : ''}`));

      // 스크립트를 함수로 래핑하고 실행
      // Playwright는 1개의 인자만 허용하므로 배열로 전달
      const results = await page.evaluate(
        ({ scriptCode, args }) => {

          const fn = eval(`(${scriptCode})`);
          return fn(...args);
        },
        { scriptCode: substitutedConfig.script, args: resolvedArgs }
      );

      return results;
    }

    // 기본 selector 기반 추출
    const results = await page.evaluate(
      ({ containerSelector, fields, brandName }) => {
        const results: any[] = [];
        const containers = document.querySelectorAll(containerSelector);

        containers.forEach((container) => {
          try {
            const item: any = {};

            // 각 필드 추출
            for (const [fieldName, fieldConfig] of Object.entries(fields)) {
              try {
                const value = extractField(container, fieldConfig as any, brandName);
                item[fieldName] = value;
              } catch (error) {
                if ((fieldConfig as any).required) {
                  throw error;
                }
                item[fieldName] = null;
              }
            }

            // 필수 필드 검증
            let hasAllRequired = true;
            for (const [fieldName, fieldConfig] of Object.entries(fields)) {
              if ((fieldConfig as any).required && !item[fieldName]) {
                hasAllRequired = false;
                break;
              }
            }

            if (hasAllRequired) {
              results.push(item);
            }
          } catch (error) {
            // 개별 아이템 추출 실패는 무시
          }
        });

        return results;

        // 필드 추출 함수 (브라우저 컨텍스트에서 실행)
        function extractField(
          container: Element,
          config: any,
          brandFallback: string
        ): any {
          if (!config.selector) {
            return null;
          }

          const element = container.querySelector(config.selector);
          if (!element && !config.nullable && !config.fallback) {
            throw new Error(`Element not found: ${config.selector}`);
          }

          let value: any = null;

          // 값 추출
          if (element) {
            if (config.type === 'attribute') {
              value = element.getAttribute(config.attribute || 'href');
            } else if (config.type === 'html') {
              value = element.innerHTML;
            } else {
              // 기본: text
              value = element.textContent?.trim();
            }
          }

          // Fallback 처리
          if (!value && config.fallback) {
            value = config.fallback === '${brand}' ? brandFallback : config.fallback;
          }

          // Null 체크
          if (!value && config.nullable) {
            return null;
          }

          // Regex 적용
          if (value && config.regex) {
            const match = String(value).match(new RegExp(config.regex));
            if (match) {
              value = match[config.group || 0];
            }
          }

          // Transform 적용
          if (value && config.transform) {
            value = applyTransform(value, config.transform);
          }

          // Parse 적용
          if (value && config.parse) {
            value = applyParse(value, config.parse);
          }

          return value;
        }

        // Transform 함수
        function applyTransform(value: any, transform: string): any {
          const str = String(value);
          switch (transform) {
            case 'removeNonDigits':
              return str.replace(/[^0-9]/g, '');
            case 'removeCommas':
              return str.replace(/,/g, '');
            case 'trim':
              return str.trim();
            case 'lowercase':
              return str.toLowerCase();
            case 'uppercase':
              return str.toUpperCase();
            default:
              return value;
          }
        }

        // Parse 함수
        function applyParse(value: any, parse: string): any {
          const str = String(value);
          switch (parse) {
            case 'int':
              return parseInt(str, 10);
            case 'float':
              return parseFloat(str);
            case 'boolean':
              return str.toLowerCase() === 'true';
            default:
              return value;
          }
        }
      },
      {
        containerSelector: substitutedConfig.containerSelector || 'body',
        fields: substitutedConfig.fields,
        brandName: context.brand || '',
      }
    );

    return results;
  }
}


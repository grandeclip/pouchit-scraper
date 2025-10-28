/**
 * Selector 기반 데이터 추출기
 * Playwright API를 직접 사용하여 데이터 추출
 * 
 * 역할:
 * - Playwright의 locator API 사용
 * - 복잡한 케이스를 위한 대안
 * 
 * SOLID 원칙:
 * - SRP: 데이터 추출만 담당
 */

import type { Page } from 'playwright';
import { IDataExtractor } from '../core/interfaces/IDataExtractor';
import { ExtractionConfig, FieldConfig } from '../core/domain/ScraperConfig';
import { ConfigLoader } from '../config/ConfigLoader';

/**
 * Selector 기반 추출기
 */
export class SelectorExtractor implements IDataExtractor {
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

    const results: any[] = [];

    // 컨테이너 선택자로 모든 아이템 찾기
    const containerSelector = substitutedConfig.containerSelector || 'body';
    const containers = await page.locator(containerSelector).all();

    for (const container of containers) {
      try {
        const item: any = {};

        // 각 필드 추출
        for (const [fieldName, fieldConfig] of Object.entries(
          substitutedConfig.fields
        )) {
          try {
            const value = await this.extractField(
              container,
              fieldConfig,
              context.brand || ''
            );
            item[fieldName] = value;
          } catch (error) {
            if (fieldConfig.required) {
              throw error;
            }
            item[fieldName] = null;
          }
        }

        // 필수 필드 검증
        let hasAllRequired = true;
        for (const [fieldName, fieldConfig] of Object.entries(
          substitutedConfig.fields
        )) {
          if (fieldConfig.required && !item[fieldName]) {
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
    }

    return results;
  }

  /**
   * 개별 필드 추출
   */
  private async extractField(
    container: any,
    config: FieldConfig,
    brandFallback: string
  ): Promise<any> {
    if (!config.selector) {
      return null;
    }

    const element = container.locator(config.selector).first();
    const exists = await element.count();

    if (exists === 0) {
      if (config.fallback) {
        return config.fallback === '${brand}' ? brandFallback : config.fallback;
      }
      if (config.nullable) {
        return null;
      }
      throw new Error(`Element not found: ${config.selector}`);
    }

    let value: any = null;

    // 값 추출
    if (config.type === 'attribute') {
      value = await element.getAttribute(config.attribute || 'href');
    } else if (config.type === 'html') {
      value = await element.innerHTML();
    } else {
      // 기본: text
      value = await element.textContent();
      if (value) {
        value = value.trim();
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
      value = this.applyTransform(value, config.transform);
    }

    // Parse 적용
    if (value && config.parse) {
      value = this.applyParse(value, config.parse);
    }

    return value;
  }

  /**
   * Transform 적용
   */
  private applyTransform(value: any, transform: string): any {
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

  /**
   * Parse 적용
   */
  private applyParse(value: any, parse: string): any {
    const str = String(value);
    switch (parse) {
      case 'int':
        return parseInt(str, 10) || 0;
      case 'float':
        return parseFloat(str) || 0;
      case 'boolean':
        return str.toLowerCase() === 'true';
      default:
        return value;
    }
  }
}


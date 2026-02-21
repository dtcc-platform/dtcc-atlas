import type { UnionTypeInfo } from '../types/form-fields';

/**
 * Result of parsing union input
 */
export interface UnionParseResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Parser for smart union field inputs
 * Intelligently parses user input based on union type information
 */
export class UnionParser {
  /**
   * Parse user input based on union type info
   * @param input - Raw string from user
   * @param unionInfo - Type information from schema
   * @returns Parsed value or error
   */
  parse(input: string, unionInfo: UnionTypeInfo): UnionParseResult {
    const trimmed = input.trim();

    if (!trimmed) {
      return { success: false, error: 'Value is required' };
    }

    // Try literal values first (highest priority)
    if (unionInfo.literalValues.length > 0) {
      if (unionInfo.literalValues.includes(trimmed)) {
        return { success: true, value: trimmed };
      }
    }

    // Try comma-separated integers (array)
    if (unionInfo.hasIntegerArray && trimmed.includes(',')) {
      const arrayResult = this.parseIntegerArray(trimmed);
      if (arrayResult.success) {
        return arrayResult;
      }
    }

    // Try single integer
    if (unionInfo.hasInteger) {
      const intResult = this.parseInteger(trimmed);
      if (intResult.success) {
        return intResult;
      }
    }

    // Try string (fallback)
    if (unionInfo.hasString) {
      return { success: true, value: trimmed };
    }

    // No valid parse
    return {
      success: false,
      error: `Invalid value. Expected: ${this.describeExpectedInput(unionInfo)}`,
    };
  }

  /**
   * Parse comma-separated integers
   */
  private parseIntegerArray(input: string): UnionParseResult {
    const parts = input.split(',').map((s) => s.trim());
    const numbers: number[] = [];

    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num) || !Number.isInteger(num)) {
        return {
          success: false,
          error: `Invalid integer in list: "${part}"`,
        };
      }
      numbers.push(num);
    }

    return { success: true, value: numbers };
  }

  /**
   * Parse single integer
   */
  private parseInteger(input: string): UnionParseResult {
    const num = parseInt(input, 10);
    if (isNaN(num) || !Number.isInteger(num)) {
      return { success: false, error: 'Not a valid integer' };
    }
    return { success: true, value: num };
  }

  /**
   * Generate human-readable description of expected input
   */
  private describeExpectedInput(unionInfo: UnionTypeInfo): string {
    const parts: string[] = [];

    if (unionInfo.hasInteger) parts.push('integer (e.g., 5)');
    if (unionInfo.hasIntegerArray)
      parts.push('comma-separated integers (e.g., 1,2,3)');
    if (unionInfo.literalValues.length > 0) {
      parts.push(`one of: ${unionInfo.literalValues.join(', ')}`);
    }
    if (unionInfo.hasString) parts.push('text string');

    return parts.join(' OR ');
  }
}

// Export singleton instance
export const unionParser = new UnionParser();

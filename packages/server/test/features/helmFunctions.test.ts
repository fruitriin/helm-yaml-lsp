/**
 * Helm Functions Test
 */

import { describe, expect, it } from 'bun:test';
import {
  findFunction,
  findFunctionsByCategory,
  getAllFunctionNames,
  getAllFunctions,
} from '../../src/features/helmFunctions';

describe('helmFunctions', () => {
  describe('findFunction', () => {
    it('should find a function by name', () => {
      const fn = findFunction('default');
      expect(fn).toBeDefined();
      expect(fn?.name).toBe('default');
      expect(fn?.category).toBe('default');
    });

    it('should find string functions', () => {
      const quote = findFunction('quote');
      expect(quote).toBeDefined();
      expect(quote?.category).toBe('string');

      const indent = findFunction('indent');
      expect(indent).toBeDefined();
      expect(indent?.category).toBe('string');
    });

    it('should find conversion functions', () => {
      const toYaml = findFunction('toYaml');
      expect(toYaml).toBeDefined();
      expect(toYaml?.category).toBe('conversion');

      const toJson = findFunction('toJson');
      expect(toJson).toBeDefined();
      expect(toJson?.category).toBe('conversion');
    });

    it('should return undefined for non-existent function', () => {
      const fn = findFunction('nonExistentFunction');
      expect(fn).toBeUndefined();
    });
  });

  describe('findFunctionsByCategory', () => {
    it('should find all string functions', () => {
      const stringFns = findFunctionsByCategory('string');
      expect(stringFns.length).toBeGreaterThan(0);
      expect(stringFns.every(fn => fn.category === 'string')).toBe(true);
      expect(stringFns.some(fn => fn.name === 'quote')).toBe(true);
      expect(stringFns.some(fn => fn.name === 'indent')).toBe(true);
    });

    it('should find all conversion functions', () => {
      const conversionFns = findFunctionsByCategory('conversion');
      expect(conversionFns.length).toBeGreaterThan(0);
      expect(conversionFns.every(fn => fn.category === 'conversion')).toBe(true);
      expect(conversionFns.some(fn => fn.name === 'toYaml')).toBe(true);
    });

    it('should find all math functions', () => {
      const mathFns = findFunctionsByCategory('math');
      expect(mathFns.length).toBeGreaterThan(0);
      expect(mathFns.every(fn => fn.category === 'math')).toBe(true);
      expect(mathFns.some(fn => fn.name === 'add')).toBe(true);
    });

    it('should return empty array for non-existent category', () => {
      // @ts-expect-error Testing with invalid category
      const fns = findFunctionsByCategory('nonExistent');
      expect(fns).toEqual([]);
    });
  });

  describe('getAllFunctionNames', () => {
    it('should return all function names', () => {
      const names = getAllFunctionNames();
      expect(names.length).toBeGreaterThan(50);
      expect(names).toContain('default');
      expect(names).toContain('quote');
      expect(names).toContain('toYaml');
      expect(names).toContain('indent');
    });

    it('should not have duplicate names', () => {
      const names = getAllFunctionNames();
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });
  });

  describe('getAllFunctions', () => {
    it('should return all functions', () => {
      const functions = getAllFunctions();
      expect(functions.length).toBeGreaterThan(50);
    });

    it('should have all required properties', () => {
      const functions = getAllFunctions();
      for (const fn of functions) {
        expect(fn.name).toBeDefined();
        expect(fn.signature).toBeDefined();
        expect(fn.description).toBeDefined();
        expect(fn.category).toBeDefined();
      }
    });

    it('should have examples for most functions', () => {
      const functions = getAllFunctions();
      const withExamples = functions.filter(fn => fn.examples && fn.examples.length > 0);
      // At least 80% of functions should have examples
      expect(withExamples.length).toBeGreaterThan(functions.length * 0.8);
    });
  });

  describe('function properties', () => {
    it('default function should have correct properties', () => {
      const fn = findFunction('default');
      expect(fn?.name).toBe('default');
      expect(fn?.signature).toBe('default DEFAULT_VALUE GIVEN_VALUE');
      expect(fn?.description).toContain('DEFAULT_VALUE');
      expect(fn?.category).toBe('default');
      expect(fn?.examples).toBeDefined();
      expect(fn?.examples?.length).toBeGreaterThan(0);
    });

    it('toYaml function should have correct properties', () => {
      const fn = findFunction('toYaml');
      expect(fn?.name).toBe('toYaml');
      expect(fn?.signature).toBe('toYaml VALUE');
      expect(fn?.description).toContain('YAML');
      expect(fn?.category).toBe('conversion');
    });

    it('quote function should have correct properties', () => {
      const fn = findFunction('quote');
      expect(fn?.name).toBe('quote');
      expect(fn?.signature).toBe('quote VALUE');
      expect(fn?.description).toContain('double quotes');
      expect(fn?.category).toBe('string');
    });
  });
});

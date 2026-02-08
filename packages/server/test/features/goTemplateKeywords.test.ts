import { describe, expect, it } from 'bun:test';
import {
  findGoTemplateKeyword,
  GO_TEMPLATE_KEYWORDS,
  getAllGoTemplateKeywords,
} from '@/features/goTemplateKeywords';

describe('goTemplateKeywords', () => {
  describe('GO_TEMPLATE_KEYWORDS catalog', () => {
    it('should contain all expected keywords', () => {
      const names = GO_TEMPLATE_KEYWORDS.map(k => k.name);
      expect(names).toContain('if');
      expect(names).toContain('else');
      expect(names).toContain('else if');
      expect(names).toContain('range');
      expect(names).toContain('with');
      expect(names).toContain('define');
      expect(names).toContain('template');
      expect(names).toContain('block');
      expect(names).toContain('end');
    });

    it('should have syntax and description for all keywords', () => {
      for (const keyword of GO_TEMPLATE_KEYWORDS) {
        expect(keyword.syntax).toBeTruthy();
        expect(keyword.description).toBeTruthy();
        expect(keyword.examples.length).toBeGreaterThan(0);
      }
    });
  });

  describe('findGoTemplateKeyword', () => {
    it('should find existing keyword', () => {
      const result = findGoTemplateKeyword('if');
      expect(result).toBeDefined();
      expect(result!.name).toBe('if');
    });

    it('should find "else if" keyword', () => {
      const result = findGoTemplateKeyword('else if');
      expect(result).toBeDefined();
      expect(result!.name).toBe('else if');
    });

    it('should return undefined for unknown keyword', () => {
      expect(findGoTemplateKeyword('unknown')).toBeUndefined();
    });
  });

  describe('getAllGoTemplateKeywords', () => {
    it('should return all keywords', () => {
      const all = getAllGoTemplateKeywords();
      expect(all.length).toBe(GO_TEMPLATE_KEYWORDS.length);
    });
  });
});

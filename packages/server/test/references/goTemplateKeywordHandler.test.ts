import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { createGoTemplateKeywordHandler } from '@/references/handlers/goTemplateKeywordHandler';

function makeDoc(content: string): TextDocument {
  return TextDocument.create('file:///test.yaml', 'helm', 1, content);
}

describe('goTemplateKeywordHandler', () => {
  const handler = createGoTemplateKeywordHandler();

  describe('detect', () => {
    it('should detect "if" keyword', () => {
      const doc = makeDoc('{{ if .Values.enabled }}');
      // "if" is at position 3-5
      const detected = handler.detect(doc, Position.create(0, 4));
      expect(detected).toBeDefined();
      expect(detected!.kind).toBe('goTemplateKeyword');
      expect(detected!.details.kind).toBe('goTemplateKeyword');
      expect((detected!.details as any).keywordName).toBe('if');
    });

    it('should detect "range" keyword', () => {
      const doc = makeDoc('{{ range .Values.list }}');
      const detected = handler.detect(doc, Position.create(0, 5));
      expect(detected).toBeDefined();
      expect((detected!.details as any).keywordName).toBe('range');
    });

    it('should detect "end" keyword', () => {
      const doc = makeDoc('{{ end }}');
      const detected = handler.detect(doc, Position.create(0, 4));
      expect(detected).toBeDefined();
      expect((detected!.details as any).keywordName).toBe('end');
    });

    it('should detect "else if" keyword', () => {
      const doc = makeDoc('{{ else if .Values.other }}');
      const detected = handler.detect(doc, Position.create(0, 6));
      expect(detected).toBeDefined();
      expect((detected!.details as any).keywordName).toBe('else if');
    });

    it('should detect keyword with whitespace trimming {{-', () => {
      const doc = makeDoc('{{- if .Values.enabled -}}');
      const detected = handler.detect(doc, Position.create(0, 5));
      expect(detected).toBeDefined();
      expect((detected!.details as any).keywordName).toBe('if');
    });

    it('should detect "define" keyword', () => {
      const doc = makeDoc('{{- define "mychart.labels" -}}');
      const detected = handler.detect(doc, Position.create(0, 7));
      expect(detected).toBeDefined();
      expect((detected!.details as any).keywordName).toBe('define');
    });

    it('should detect "with" keyword', () => {
      const doc = makeDoc('{{ with .Values.ingress }}');
      const detected = handler.detect(doc, Position.create(0, 5));
      expect(detected).toBeDefined();
      expect((detected!.details as any).keywordName).toBe('with');
    });

    it('should not detect on comment line', () => {
      const doc = makeDoc('# {{ if .Values.enabled }}');
      const detected = handler.detect(doc, Position.create(0, 7));
      expect(detected).toBeUndefined();
    });

    it('should not detect at unrelated position', () => {
      const doc = makeDoc('name: {{ .Values.name }}');
      const detected = handler.detect(doc, Position.create(0, 2));
      expect(detected).toBeUndefined();
    });

    it('should detect on multi-line at correct position', () => {
      const doc = makeDoc('name: value\n{{ range .Values.items }}\n  - {{ . }}\n{{ end }}');
      const detected = handler.detect(doc, Position.create(1, 5));
      expect(detected).toBeDefined();
      expect((detected!.details as any).keywordName).toBe('range');

      const detected2 = handler.detect(doc, Position.create(3, 4));
      expect(detected2).toBeDefined();
      expect((detected2!.details as any).keywordName).toBe('end');
    });
  });

  describe('resolve', () => {
    it('should return hover markdown for "if"', async () => {
      const doc = makeDoc('{{ if .Values.enabled }}');
      const detected = handler.detect(doc, Position.create(0, 4))!;
      const resolved = await handler.resolve(doc, detected);

      expect(resolved.hoverMarkdown).not.toBeNull();
      expect(resolved.hoverMarkdown).toContain('**Keyword**: `if`');
      expect(resolved.hoverMarkdown).toContain('**Syntax**:');
      expect(resolved.hoverMarkdown).toContain('Conditional');
      expect(resolved.definitionLocation).toBeNull();
      expect(resolved.exists).toBeNull();
    });

    it('should return hover markdown for "range"', async () => {
      const doc = makeDoc('{{ range .Values.list }}');
      const detected = handler.detect(doc, Position.create(0, 5))!;
      const resolved = await handler.resolve(doc, detected);

      expect(resolved.hoverMarkdown).toContain('**Keyword**: `range`');
      expect(resolved.hoverMarkdown).toContain('Iterates');
      expect(resolved.hoverMarkdown).toContain('**Examples**:');
    });

    it('should return hover markdown for "else if"', async () => {
      const doc = makeDoc('{{ else if .Values.other }}');
      const detected = handler.detect(doc, Position.create(0, 6))!;
      const resolved = await handler.resolve(doc, detected);

      expect(resolved.hoverMarkdown).toContain('**Keyword**: `else if`');
      expect(resolved.hoverMarkdown).toContain('Chains multiple conditions');
    });
  });

  describe('complete', () => {
    it('should provide keyword completions after {{', () => {
      const doc = makeDoc('{{ ');
      const items = handler.complete!(doc, Position.create(0, 3));
      expect(items).toBeDefined();
      expect(items!.length).toBeGreaterThan(0);

      const labels = items!.map(i => i.label);
      expect(labels).toContain('if');
      expect(labels).toContain('range');
      expect(labels).toContain('with');
      expect(labels).toContain('end');
      expect(labels).toContain('define');
    });

    it('should provide keyword completions after {{-', () => {
      const doc = makeDoc('{{- ');
      const items = handler.complete!(doc, Position.create(0, 4));
      expect(items).toBeDefined();
      expect(items!.length).toBeGreaterThan(0);
    });

    it('should not provide completions in the middle of content', () => {
      const doc = makeDoc('name: value');
      const items = handler.complete!(doc, Position.create(0, 5));
      expect(items).toBeUndefined();
    });
  });
});
